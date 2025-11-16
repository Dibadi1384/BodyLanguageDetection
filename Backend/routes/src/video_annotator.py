import cv2
import json
import sys
import os
from pathlib import Path
from typing import Dict, Tuple

COLORS = [
    (0, 255, 0),    # Green
    (255, 0, 0),    # Blue
    (0, 0, 255),    # Red
    (255, 255, 0),  # Cyan
    (255, 0, 255),  # Magenta
    (0, 255, 255),  # Yellow
    (128, 0, 128),  # Purple
]

def draw_detection(
    frame, 
    person: Dict, 
    color: Tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2
):
    """Draw bounding box and label on frame"""
    bbox = person['bbox']
    x_min, y_min = bbox['x_min'], bbox['y_min']
    x_max, y_max = bbox['x_max'], bbox['y_max']
    
    # Draw bounding box
    cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), color, thickness)
    
    person_id = person['person_id']
    confidence = person['bbox_confidence']
    
    analysis = person.get('analysis_result', {})
    label_parts = [f"ID:{person_id}"]
    
    # Add main analysis info (first 2 items)
    for i, (key, value) in enumerate(analysis.items()):
        if isinstance(value, (int, float)):
            label_parts.append(f"{key}:{value:.2f}")
        else:
            label_parts.append(f"{key}:{value}")
    
    label = " ".join(label_parts)
    
    # Draw label background
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.5
    font_thickness = 1
    (text_width, text_height), baseline = cv2.getTextSize(
        label, font, font_scale, font_thickness
    )
    
    # Position label above bounding box
    label_y = max(y_min - 10, text_height + 10)
    
    cv2.rectangle(
        frame,
        (x_min, label_y - text_height - baseline - 5),
        (x_min + text_width + 5, label_y + baseline),
        color,
        -1
    )
    
    # Draw label text
    cv2.putText(
        frame,
        label,
        (x_min + 2, label_y - baseline),
        font,
        font_scale,
        (255, 255, 255),
        font_thickness,
        cv2.LINE_AA
    )
    
    # Draw confidence below box
    conf_label = f"conf:{confidence:.2f}"
    cv2.putText(
        frame,
        conf_label,
        (x_min, y_max + 15),
        font,
        0.4,
        color,
        1,
        cv2.LINE_AA
    )

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
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if show_progress:
        print(f"Creating annotated video: {output_path}", file=sys.stderr)
        print(f"Resolution: {width}x{height}", file=sys.stderr)
    
    frame_idx = 0
    processed_count = 0
    detection = None
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Check if we have detections for this frame
        if frame_idx in frame_detections:
            detection = frame_detections[frame_idx]
            
            # Draw all detected people
            for person in detection['people']:
                # Use different colors for different people
                color_idx = person['person_id'] % 7
                color = COLORS[color_idx]
                
                draw_detection(frame, person, color=color)
            
            processed_count += 1
        elif detection: # if not prediction made on frame_idx, use previous detection
            for person in detection['people']:
                color_idx = person['person_id'] % 7
                color = COLORS[color_idx]
                draw_detection(frame, person, color=color)
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