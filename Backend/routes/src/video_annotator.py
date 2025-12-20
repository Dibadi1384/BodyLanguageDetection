import cv2
import json
import sys
import os
import numpy as np
from pathlib import Path
from typing import Dict, Tuple
from PIL import Image, ImageDraw, ImageFont

COLORS = [
    (88, 214, 141),   # Green
    (52, 152, 219),   #  Blue
    (231, 76, 60),    #  Red
    (155, 89, 182),   #  Purple
    (241, 196, 15),   #  Yellow
    (230, 126, 34),   #  Orange
    (26, 188, 156),   # Turquoise
]

def draw_rounded_rectangle(draw, bbox, color, radius=10, width=3):
    x1, y1, x2, y2 = bbox
    draw.rounded_rectangle(
        [x1, y1, x2, y2],
        radius=radius,
        outline=color,
        width=width
    )

def draw_text_with_stroke(draw, position, text, font, text_color=(255, 255, 255, 255), stroke_color=(0, 0, 0, 255), stroke_width=3):
    x, y = position
    # Draw stroke by drawing text in multiple positions around the main position
    for offset_x in range(-stroke_width, stroke_width + 1):
        for offset_y in range(-stroke_width, stroke_width + 1):
            if offset_x != 0 or offset_y != 0:
                draw.text((x + offset_x, y + offset_y), text, fill=stroke_color, font=font)
    
    # Draw main text on top
    draw.text((x, y), text, fill=text_color, font=font)

def draw_label_badge(draw, position, text, color, font, padding=28, radius=16):
    """Draw a simple label with text and stroke"""
    x, y = position
    
    # Get text size
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Badge dimensions
    badge_width = text_width + padding * 2
    badge_height = text_height + padding
    
    # Simple semi-transparent background for slight contrast
    badge_color = (*color, 215)
    draw.rounded_rectangle(
        [x, y, x + badge_width, y + badge_height],
        radius=radius,
        fill=badge_color
    )
    
    # Text with stroke for visibility
    text_x = x + padding
    text_y = y + padding // 2
    draw_text_with_stroke(draw, (text_x, text_y), text, font, 
                          text_color=(255, 255, 255, 255), 
                          stroke_color=(0, 0, 0, 255), 
                          stroke_width=4)
    
    return badge_width, badge_height

# unused
def draw_id_badge(draw, position, person_id, color, font_small):
    x, y = position
    radius = 35

    shadow_offset = 6
    draw.ellipse(
        [x + shadow_offset, y + shadow_offset, 
         x + 2*radius + shadow_offset, y + 2*radius + shadow_offset],
        fill=(0, 0, 0, 150)
    )
    draw.ellipse(
        [x, y, x + 2*radius, y + 2*radius],
        fill=(20, 20, 20, 250)
    )
    draw.ellipse(
        [x, y, x + 2*radius, y + 2*radius],
        outline=(*color, 255),
        width=5
    )
    id_text = str(person_id)
    bbox = draw.textbbox((0, 0), id_text, font=font_small)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    text_x = x + radius - text_width // 2
    text_y = y + radius - text_height // 2 - 2
    
    draw_text_with_stroke(draw, (text_x, text_y), id_text, font_small, stroke_width=2)

def get_font(size=20):
    # Load Inter font with system font as backup

    script_dir = Path(__file__).parent
    font_path = script_dir / "Inter-SemiBold.ttf"
    
    if font_path.exists():
        try:
            font = ImageFont.truetype(str(font_path), size)
            return font
        except Exception as e:
            pass
    
    system_fonts = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    
    for font_path_str in system_fonts:
        try:
            font = ImageFont.truetype(font_path_str, size)
            return font
        except:
            continue
    
    return ImageFont.load_default()

def draw_detection(
    frame, 
    person: Dict, 
    color: Tuple[int, int, int] = (88, 214, 141),
    font_main=None,
    font_small=None
):
    # Convert BGR to RGB for PIL
    color_rgb = (color[2], color[1], color[0])
    
    bbox = person['bbox']
    x_min, y_min = bbox['x_min'], bbox['y_min']
    x_max, y_max = bbox['x_max'], bbox['y_max']
    
    person_id = person['person_id']
    confidence = person['bbox_confidence']
    
    analysis = person.get('analysis_result', {})
    emotion = analysis.get('emotion', 'unknown').capitalize()
    analysis_confidence = analysis.get('confidence', 0)
    conf_percent = int(analysis_confidence * 100)
    
    # label = f"{emotion} | {conf_percent}%" # Only label for now 
    label = f"{emotion}"
    

    frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(frame_pil, 'RGBA')

    draw_rounded_rectangle(draw, (x_min, y_min, x_max, y_max), color_rgb, radius=18, width=6)
    
    label_y = max(y_min - 110, 10)
    draw_label_badge(draw, (x_min, label_y), label, color_rgb, font_main)
    
    frame_cv = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGB2BGR)
    frame[:] = frame_cv

# Interpolated bbox dict 
def interpolate_bbox(bbox1, bbox2, alpha):

    return {
        'x_min': int(bbox1['x_min'] * (1 - alpha) + bbox2['x_min'] * alpha),
        'y_min': int(bbox1['y_min'] * (1 - alpha) + bbox2['y_min'] * alpha),
        'x_max': int(bbox1['x_max'] * (1 - alpha) + bbox2['x_max'] * alpha),
        'y_max': int(bbox1['y_max'] * (1 - alpha) + bbox2['y_max'] * alpha),
    }
# Dict mapping person_id to list of (frame_idx, person_data) tuples
def build_person_timelines(frame_detections):
    timelines = {}
    
    for frame_idx, detection in frame_detections.items():
        for person in detection['people']:
            person_id = person['person_id']
            if person_id not in timelines:
                timelines[person_id] = []
            timelines[person_id].append((frame_idx, person))
    
    for person_id in timelines:
        timelines[person_id].sort(key=lambda x: x[0])
    
    return timelines

def get_interpolated_person_data(person_id, frame_idx, timelines, max_gap=90):
    
    if person_id not in timelines:
        return None
    
    timeline = timelines[person_id]
    
    # Find surrounding detections
    prev_detection = None
    next_detection = None
    
    for i, (det_frame_idx, person_data) in enumerate(timeline):
        if det_frame_idx <= frame_idx:
            prev_detection = (det_frame_idx, person_data)
        if det_frame_idx >= frame_idx and next_detection is None:
            next_detection = (det_frame_idx, person_data)
            break
    
    # If exact match, return it
    if prev_detection and prev_detection[0] == frame_idx:
        return prev_detection[1]
    
    # If we have both prev and next then interpolate
    if prev_detection and next_detection:
        prev_frame, prev_data = prev_detection
        next_frame, next_data = next_detection
        
        frame_gap = next_frame - prev_frame
        
        # Only interpolate if gap is reasonable
        if frame_gap <= max_gap:
            alpha = (frame_idx - prev_frame) / frame_gap
            
            # Create interpolated person data
            interpolated = prev_data.copy()
            interpolated['bbox'] = interpolate_bbox(prev_data['bbox'], next_data['bbox'], alpha)
            
            return interpolated
    
    # If only prev and it's recent enough, use it
    if prev_detection:
        prev_frame, prev_data = prev_detection
        if frame_idx - prev_frame <= max_gap // 2:
            return prev_data
    
    # If only next and it's close enough, use it
    if next_detection:
        next_frame, next_data = next_detection
        if next_frame - frame_idx <= max_gap // 2:
            return next_data
    
    return None

def annotate_video(video_path: str, detections_path: str, output_path: str,  show_progress: bool = True) -> str:     
    # Load detections
    with open(detections_path, 'r') as f:
        data = json.load(f)
    
    frame_detections = {
        det['frame_index']: det 
        for det in data['frame_detections']
    }
    
    video_info = data['video_info']
    fps = video_info['fps']
    
    if show_progress:
        print(f"Loading video: {video_path}", file=sys.stderr)
        print(f"FPS: {fps}", file=sys.stderr)
        print(f"Total detection frames: {len(frame_detections)}", file=sys.stderr)
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Load fonts and size
    font_main = get_font(85)
    font_small = get_font(40)
    
    # Create video writer
    # Use 'avc1' (H.264) codec for browser compatibility
    # Fallback to 'mp4v' if avc1 is not available, but note it's not browser-compatible
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # If avc1 fails, try H264 (alternative H.264 codec)
    if not out.isOpened():
        if show_progress:
            print("Warning: avc1 codec not available, trying H264...", file=sys.stderr)
        fourcc = cv2.VideoWriter_fourcc(*'H264')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Final fallback to mp4v (not browser-compatible, but will work for local playback)
    if not out.isOpened():
        if show_progress:
            print("Warning: H264 codec not available, using mp4v (not browser-compatible)...", file=sys.stderr)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        raise ValueError(f"Could not create video writer with any available codec for: {output_path}")
    
    if show_progress:
        print(f"Creating annotated video: {output_path}", file=sys.stderr)
        print(f"Resolution: {width}x{height}", file=sys.stderr)
    
    # Build person timelines for tracking
    person_timelines = build_person_timelines(frame_detections)
    all_person_ids = sorted(list(person_timelines.keys()))
    
    if show_progress:
        print(f"Tracking {len(all_person_ids)} people across video", file=sys.stderr)
        for pid in all_person_ids:
            timeline_len = len(person_timelines[pid])
            first_frame = person_timelines[pid][0][0]
            last_frame = person_timelines[pid][-1][0]
            print(f"  Person {pid}: {timeline_len} detections (frames {first_frame}-{last_frame})", file=sys.stderr)
    
    frame_idx = 0
    annotations_per_person = {pid: 0 for pid in all_person_ids}
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Draw detections for all tracked people (with interpolation)
        for person_id in all_person_ids:
            person_data = get_interpolated_person_data(person_id, frame_idx, person_timelines)
            
            if person_data:
                # Use different colors for different people
                color_idx = person_id % len(COLORS)
                color = COLORS[color_idx]
                
                draw_detection(frame, person_data, color=color, font_main=font_main, font_small=font_small)
                annotations_per_person[person_id] += 1
            
        out.write(frame)
        
        if show_progress and frame_idx % 100 == 0:
            progress = (frame_idx / total_frames) * 100
            print(f"Progress: {progress:.1f}% ({frame_idx}/{total_frames} frames)", file=sys.stderr)
        
        frame_idx += 1
    
    cap.release()
    out.release()
    
    if show_progress:
        print(f"Annotation complete!", file=sys.stderr)
        for pid in all_person_ids:
            print(f"  Person {pid}: annotated {annotations_per_person[pid]} frames", file=sys.stderr)
        print(f"Output saved to: {output_path}", file=sys.stderr)
    
    return output_path

def main():
    if len(sys.argv) < 3:
        print("Usage: python video_annotator.py <video_path> <detections.json> [output_path]", file=sys.stderr)
        sys.exit(1)
    
    video_path = sys.argv[1]
    detections_path = sys.argv[2]
    
    # Default output path
    if len(sys.argv) > 3:
        output_path = sys.argv[3]
    else:
        video_stem = Path(video_path).stem
        output_dir = Path(detections_path).parent
        output_path = str(output_dir / f"{video_stem}_annotated.mp4")
    
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(detections_path):
        print(f"Error: Detections file not found: {detections_path}", file=sys.stderr)
        sys.exit(1)
    
    # Create annotated video
    result_path = annotate_video(video_path, detections_path, output_path)
    
    # Output path (for Node.js)
    print(result_path)

if __name__ == "__main__":
    main()
