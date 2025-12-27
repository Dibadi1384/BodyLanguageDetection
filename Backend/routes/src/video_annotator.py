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
    (52, 152, 219),   # Blue
    (231, 76, 60),    # Red
    (155, 89, 182),   # Purple
    (241, 196, 15),   # Yellow
    (230, 126, 34),   # Orange
    (26, 188, 156),   # Turquoise
]

def get_font(size=20):
    """Load Inter font with system font as backup."""
    script_dir = Path(__file__).parent
    font_path = script_dir / "Inter-SemiBold.ttf"
    
    if font_path.exists():
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            pass
    
    # Try system fonts
    system_fonts = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arial.ttf",  # Windows
        "C:/Windows/Fonts/arialbd.ttf",  # Windows Bold
    ]
    
    for font_path_str in system_fonts:
        try:
            return ImageFont.truetype(font_path_str, size)
        except:
            continue
    
    return ImageFont.load_default()

def extract_label_from_analysis(analysis_result: Dict, detection_key: str = 'emotion') -> str:
    """Extract a human-readable label from analysis_result, prioritizing the specified detection_key."""
    if not analysis_result or not isinstance(analysis_result, dict):
        return 'Unknown'
    
    # Prioritize the selected detection key
    if detection_key in analysis_result and analysis_result[detection_key]:
        value = analysis_result[detection_key]
        if isinstance(value, str) and value:
            return value.capitalize()
        elif isinstance(value, (int, float)) and value:
            return str(value)
    
    # Fallback to other keys if selected key not found
    # Check for common fields in priority order
    if 'emotion' in analysis_result and analysis_result['emotion']:
        return str(analysis_result['emotion']).capitalize()
    
    if 'action' in analysis_result and analysis_result['action']:
        return str(analysis_result['action']).capitalize()
    
    if 'pose' in analysis_result and analysis_result['pose']:
        return str(analysis_result['pose']).capitalize()
    
    if 'expression' in analysis_result and analysis_result['expression']:
        return str(analysis_result['expression']).capitalize()
    
    # Try to find any key with a string value
    for key, value in analysis_result.items():
        if isinstance(value, str) and value and key not in ('confidence', 'intensity'):
            return value.capitalize()
    
    return 'Unknown'

def draw_text_badge_above_bbox(
    draw: ImageDraw.Draw,
    text: str,
    bbox_coords: Tuple[int, int, int, int],
    text_color: Tuple[int, int, int] = (255, 255, 255),
    bg_color: Tuple[int, int, int, int] = (0, 0, 0, 200),
    stroke_color: Tuple[int, int, int] = (0, 0, 0),
    stroke_width: int = 2
):
    """
    Draw text badge centered above the top of a bounding box.
    Font size is calculated as a reasonable percentage of the bounding box size.
    """
    x_min, y_min, x_max, y_max = bbox_coords
    bbox_width = x_max - x_min
    bbox_height = y_max - y_min
    
    # Calculate font size as percentage of bounding box (use smaller dimension)
    bbox_min_dim = min(bbox_width, bbox_height)
    # Use 10% of the smaller dimension for font size - reasonable and readable
    font_size = max(16, int(bbox_min_dim * 0.10))
    
    # Load font with calculated size
    font = get_font(font_size)
    
    # Get text bounding box
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    # Calculate padding for badge (proportional to font size)
    padding_x = max(8, int(font_size * 0.3))
    padding_y = max(6, int(font_size * 0.2))
    
    # Badge dimensions
    badge_width = text_width + padding_x * 2
    badge_height = text_height + padding_y * 2
    
    # Calculate center position above bounding box
    center_x = (x_min + x_max) // 2
    
    # Position badge above the top edge of bounding box
    badge_x = center_x - badge_width // 2
    badge_y = y_min - badge_height  # Position above the top edge
    
    # Ensure badge doesn't go above frame (minimum y position)
    if badge_y < 0:
        badge_y = 0
    
    # Draw rounded rectangle background for badge
    radius = max(4, int(font_size * 0.15))
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_width, badge_y + badge_height],
        radius=radius,
        fill=bg_color
    )
    
    # Calculate text position (centered in badge)
    text_x = badge_x + padding_x
    text_y = badge_y + padding_y
    
    # Draw text with stroke for visibility
    # Draw stroke (outline) first
    for dx in range(-stroke_width, stroke_width + 1):
        for dy in range(-stroke_width, stroke_width + 1):
            if dx != 0 or dy != 0:
                draw.text((text_x + dx, text_y + dy), text, fill=stroke_color, font=font)
    
    # Draw main text on top
    draw.text((text_x, text_y), text, fill=text_color, font=font)

def draw_detection(
    frame: np.ndarray,
    person: Dict,
    color: Tuple[int, int, int] = (88, 214, 141),
    bbox_line_width: int = 6,
    detection_key: str = 'emotion'
):
    """
    Draw bounding box and text badge for a detected person.
    Text badge is positioned at the top center, above the bounding box.
    """
    # Convert BGR to RGB for PIL
    color_rgb = (color[2], color[1], color[0])
    
    bbox = person['bbox']
    x_min, y_min = bbox['x_min'], bbox['y_min']
    x_max, y_max = bbox['x_max'], bbox['y_max']
    
    # Extract label from analysis using the selected detection key
    analysis = person.get('analysis_result', {})
    label = extract_label_from_analysis(analysis, detection_key)
    
    # Convert frame to PIL Image
    frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(frame_pil, 'RGBA')
    
    # Draw bounding box with rounded corners
    bbox_coords = (x_min, y_min, x_max, y_max)
    radius = 18
    draw.rounded_rectangle(
        bbox_coords,
        radius=radius,
        outline=color_rgb,
        width=bbox_line_width
    )
    
    # Draw text badge above bounding box (top center)
    draw_text_badge_above_bbox(
        draw=draw,
        text=label,
        bbox_coords=bbox_coords,
        text_color=(255, 255, 255),
        bg_color=(*color_rgb, 200),  # Semi-transparent background matching box color
        stroke_color=(0, 0, 0),
        stroke_width=2
    )
    
    # Convert back to OpenCV format
    frame_cv = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGB2BGR)
    frame[:] = frame_cv

def interpolate_bbox(bbox1: Dict, bbox2: Dict, alpha: float) -> Dict:
    """Interpolate between two bounding boxes."""
    return {
        'x_min': int(bbox1['x_min'] * (1 - alpha) + bbox2['x_min'] * alpha),
        'y_min': int(bbox1['y_min'] * (1 - alpha) + bbox2['y_min'] * alpha),
        'x_max': int(bbox1['x_max'] * (1 - alpha) + bbox2['x_max'] * alpha),
        'y_max': int(bbox1['y_max'] * (1 - alpha) + bbox2['y_max'] * alpha),
    }

def build_person_timelines(frame_detections: Dict) -> Dict:
    """Build timelines for each person across frames."""
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

def get_interpolated_person_data(person_id: int, frame_idx: int, timelines: Dict, max_gap: int = 90) -> Dict:
    """Get person data for a frame, with interpolation if needed."""
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

def annotate_video(video_path: str, detections_path: str, output_path: str, detection_key: str = 'emotion', show_progress: bool = True) -> str:
    """Annotate video with bounding boxes and centered text labels."""
    # Load detections
    with open(detections_path, 'r') as f:
        data = json.load(f)
    
    # Get detection_key from data if not provided (backward compatibility)
    if detection_key == 'emotion' and 'detection_key' in data:
        detection_key = data['detection_key']
    
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
    
    if show_progress:
        print(f"Video resolution: {width}x{height}", file=sys.stderr)
        print(f"Total frames: {total_frames}", file=sys.stderr)
    
    # Calculate bounding box line width based on resolution (keep it reasonable)
    scale_factor = height / 720.0
    bbox_line_width = max(4, int(6 * scale_factor))
    
    if show_progress:
        print(f"Bounding box line width: {bbox_line_width}px", file=sys.stderr)
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        if show_progress:
            print("Warning: avc1 codec not available, trying H264...", file=sys.stderr)
        fourcc = cv2.VideoWriter_fourcc(*'H264')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        if show_progress:
            print("Warning: H264 codec not available, using mp4v...", file=sys.stderr)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        raise ValueError(f"Could not create video writer for: {output_path}")
    
    if show_progress:
        print(f"Creating annotated video: {output_path}", file=sys.stderr)
    
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
                
                draw_detection(frame, person_data, color=color, bbox_line_width=bbox_line_width, detection_key=detection_key)
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
        print("Usage: python video_annotator.py <video_path> <detections.json> [output_path] [detection_key]", file=sys.stderr)
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
    
    # Get detection_key from command line or default to 'emotion'
    detection_key = sys.argv[4] if len(sys.argv) > 4 else 'emotion'
    
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(detections_path):
        print(f"Error: Detections file not found: {detections_path}", file=sys.stderr)
        sys.exit(1)
    
    # Create annotated video
    result_path = annotate_video(video_path, detections_path, output_path, detection_key)
    
    # Output path (for Node.js)
    print(result_path)

if __name__ == "__main__":
    main()
