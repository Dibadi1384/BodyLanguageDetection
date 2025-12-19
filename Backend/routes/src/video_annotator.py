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
    """Draw a rounded rectangle"""
    x1, y1, x2, y2 = bbox
    
    # Draw rounded corners and edges
    draw.rounded_rectangle(
        [x1, y1, x2, y2],
        radius=radius,
        outline=color,
        width=width
    )

def draw_text_with_stroke(draw, position, text, font, text_color=(255, 255, 255, 255), stroke_color=(0, 0, 0, 255), stroke_width=3):
    """Draw text with a stroke/outline for better visibility"""
    x, y = position
    
    # Draw stroke by drawing text in multiple positions around the main position
    for offset_x in range(-stroke_width, stroke_width + 1):
        for offset_y in range(-stroke_width, stroke_width + 1):
            if offset_x != 0 or offset_y != 0:
                draw.text((x + offset_x, y + offset_y), text, fill=stroke_color, font=font)
    
    # Draw main text on top
    draw.text((x, y), text, fill=text_color, font=font)

def draw_label_badge(draw, position, text, color, font, padding=28, radius=18):
    """Draw a modern badge-style label with rounded corners and shadow"""
    x, y = position
    
    # Get text size
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Badge dimensions
    badge_width = text_width + padding * 2
    badge_height = text_height + padding
    
    # Shadow layer (slight offset)
    shadow_offset = 6
    shadow_color = (0, 0, 0, 150)
    draw.rounded_rectangle(
        [x + shadow_offset, y + shadow_offset, 
         x + badge_width + shadow_offset, y + badge_height + shadow_offset],
        radius=radius,
        fill=shadow_color
    )
    
    # Dark background for maximum contrast with white text
    badge_color = (20, 20, 20, 250)
    draw.rounded_rectangle(
        [x, y, x + badge_width, y + badge_height],
        radius=radius,
        fill=badge_color
    )
    
    # Colored accent border
    draw.rounded_rectangle(
        [x, y, x + badge_width, y + badge_height],
        radius=radius,
        outline=(*color, 255),
        width=5
    )
    
    # Text with stroke for maximum visibility
    text_x = x + padding
    text_y = y + padding // 2
    draw_text_with_stroke(draw, (text_x, text_y), text, font, stroke_width=3)
    
    return badge_width, badge_height

def draw_id_badge(draw, position, person_id, color, font_small):
    """Draw small circular ID badge"""
    x, y = position
    radius = 35
    
    # Shadow
    shadow_offset = 6
    draw.ellipse(
        [x + shadow_offset, y + shadow_offset, 
         x + 2*radius + shadow_offset, y + 2*radius + shadow_offset],
        fill=(0, 0, 0, 150)
    )
    
    # Dark circle background for maximum contrast
    draw.ellipse(
        [x, y, x + 2*radius, y + 2*radius],
        fill=(20, 20, 20, 250)
    )
    
    # Colored accent border
    draw.ellipse(
        [x, y, x + 2*radius, y + 2*radius],
        outline=(*color, 255),
        width=5
    )
    
    # ID text (centered) with stroke
    id_text = str(person_id)
    bbox = draw.textbbox((0, 0), id_text, font=font_small)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    text_x = x + radius - text_width // 2
    text_y = y + radius - text_height // 2 - 2
    
    draw_text_with_stroke(draw, (text_x, text_y), id_text, font_small, stroke_width=2)

def get_font(size=20):
    """Load a bold font for maximum visibility"""
    # Try multiple bold font options in order of preference
    font_options = [
        "/System/Library/Fonts/Helvetica.ttc",  # macOS Helvetica
        "/Library/Fonts/Arial Bold.ttf",         # macOS Arial Bold
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",  # macOS Arial Bold alternative
        "Arial.ttf",                              # Generic Arial
        "Helvetica",                              # Generic Helvetica
        "DejaVuSans-Bold.ttf",                   # Linux bold font
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
    ]
    
    # Try bundled Inter font first
    script_dir = Path(__file__).parent
    font_path = script_dir / "Inter-SemiBold.ttf"
    if font_path.exists():
        try:
            print(f"Loading Inter font at size {size}", file=sys.stderr)
            return ImageFont.truetype(str(font_path), size)
        except Exception as e:
            print(f"Warning: Could not load Inter font: {e}", file=sys.stderr)
    
    # Try system fonts
    for font_path_str in font_options:
        try:
            font = ImageFont.truetype(font_path_str, size)
            print(f"Successfully loaded font: {font_path_str} at size {size}", file=sys.stderr)
            return font
        except Exception:
            continue
    
    # Last resort - use default but warn
    print(f"Warning: Could not load any TrueType fonts, using PIL default", file=sys.stderr)
    return ImageFont.load_default()

def draw_detection(
    frame, 
    person: Dict, 
    color: Tuple[int, int, int] = (88, 214, 141),
    font_main=None,
    font_small=None
):
    # Convert BGR (OpenCV) to RGB for PIL
    color_rgb = (color[2], color[1], color[0])
    
    bbox = person['bbox']
    x_min, y_min = bbox['x_min'], bbox['y_min']
    x_max, y_max = bbox['x_max'], bbox['y_max']
    
    person_id = person['person_id']
    confidence = person['bbox_confidence']
    
    # Build label text - format: {emotion} | {confidence}%
    analysis = person.get('analysis_result', {})
    emotion = analysis.get('emotion', 'unknown').capitalize()
    analysis_confidence = analysis.get('confidence', 0)
    conf_percent = int(analysis_confidence * 100)
    
    label = f"{emotion} | {conf_percent}%"
    
    # Convert frame to PIL for drawing
    frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(frame_pil, 'RGBA')
    
    # Draw rounded bounding box
    draw_rounded_rectangle(draw, (x_min, y_min, x_max, y_max), color_rgb, radius=20, width=6)
    
    # Draw main label badge above box
    label_y = max(y_min - 120, 10)
    draw_label_badge(draw, (x_min, label_y), label, color_rgb, font_main)
    
    # Draw ID badge at bottom left corner of box
    id_x = x_min - 10
    id_y = y_max - 65
    draw_id_badge(draw, (id_x, id_y), person_id, color_rgb, font_small)
    
    # Convert back to OpenCV format
    frame_cv = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGB2BGR)
    frame[:] = frame_cv

def annotate_video(
    video_path: str,
    detections_path: str,
    output_path: str,
    show_progress: bool = True
) -> str:
    """
    Create annotated video with bounding boxes and labels
    
    Args:
        video_path: Path to original video
        detections_path: Path to detections.json file
        output_path: Path for output annotated video
        show_progress: Print progress updates
    
    Returns:
        Path to annotated video
    """
    
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
    
    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Load fonts once - balanced size for visibility
    font_main = get_font(72)
    font_small = get_font(32)
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if show_progress:
        print(f"Creating annotated video: {output_path}", file=sys.stderr)
        print(f"Resolution: {width}x{height}", file=sys.stderr)
    
    frame_idx = 0
    processed_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Only draw detections for frames that have actual detection data
        if frame_idx in frame_detections:
            detection = frame_detections[frame_idx]
            
            # Draw all detected people
            for person in detection['people']:
                # Use different colors for different people
                color_idx = person['person_id'] % 7
                color = COLORS[color_idx]
                
                draw_detection(frame, person, color=color, font_main=font_main, font_small=font_small)
            
            processed_count += 1
            
        out.write(frame)
        
        if show_progress and frame_idx % 100 == 0:
            progress = (frame_idx / total_frames) * 100
            print(f"Progress: {progress:.1f}% ({frame_idx}/{total_frames} frames)", file=sys.stderr)
        
        frame_idx += 1
    
    cap.release()
    out.release()
    
    if show_progress:
        print(f"Annotation complete!", file=sys.stderr)
        print(f"Annotated {processed_count} frames", file=sys.stderr)
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
    
    # Validate inputs
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(detections_path):
        print(f"Error: Detections file not found: {detections_path}", file=sys.stderr)
        sys.exit(1)
    
    # Create annotated video
    result_path = annotate_video(video_path, detections_path, output_path)
    
    # Output path (for Node.js to capture)
    print(result_path)

if __name__ == "__main__":
    main()
