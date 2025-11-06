import sys
import os
import json
from typing import Dict, Optional
from pathlib import Path


import cv2


def extract_frames(
    video_path: str,
    output_dir: str,
    frame_interval: int = 30,
    max_frames: Optional[int] = None
) -> Dict:
    """
    Extract frames from video at specified intervals
    
    Args:
        video_path: Path to input video file
        output_dir: Directory to save extracted frames
        frame_interval: Extract every Nth frame (default: 30, i.e., 1 frame per second at 30fps)
        max_frames: Maximum number of frames to extract (None = no limit)
    
    Returns:
        Dictionary with video metadata and frame information
    """
    
    # Validate video path
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0
    
    video_stem = Path(video_path).stem
    
    print(f"Video Info:")
    print(f"  Resolution: {width}x{height}")
    print(f"  FPS: {fps}")
    print(f"  Total Frames: {total_frames}")
    print(f"  Duration: {duration:.2f}s")
    print(f"  Extracting every {frame_interval} frame(s)...")
    
    frames_data = []
    frame_count = 0
    saved_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Extract frame at intervals
        if frame_count % frame_interval == 0:
            timestamp_s = frame_count / fps if fps > 0 else 0
            frame_filename = f"frame_{saved_count:06d}.jpg"
            frame_path = os.path.join(output_dir, frame_filename)
            
            cv2.imwrite(frame_path, frame)
            
            frames_data.append({
                "index": saved_count,
                "filename": frame_filename,
                "path": frame_path,
                "original_frame_number": frame_count,
                "timestamp_s": round(timestamp_s, 3)
            })
            
            saved_count += 1
            
            if max_frames and saved_count >= max_frames:
                print(f"Reached max_frames limit ({max_frames})")
                break
        
        frame_count += 1
    
    cap.release()
    
    print(f"Extracted {saved_count} frames to {output_dir}")
    
    # Create manifest
    manifest = {
        "video_path": str(Path(video_path).absolute()),
        "video_stem": video_stem,
        "output_dir": str(Path(output_dir).absolute()),
        "fps": fps,
        "width": width,
        "height": height,
        "total_frames": total_frames,
        "duration_s": duration,
        "frame_interval": frame_interval,
        "saved_count": saved_count,
        "frames": frames_data
    }
    
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    return manifest

if __name__ == "__main__":

    
    if len(sys.argv) < 2:
        print("Usage: python video_extractor.py <video_path> [output_dir] [frame_interval] [max_frames]")
        sys.exit(1)
    
    video_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "./frames"
    frame_interval = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    max_frames = int(sys.argv[4]) if len(sys.argv) > 4 else None
    
    manifest = extract_frames(video_path, output_dir, frame_interval, max_frames)
    print(f"Manifest path: {os.path.join(output_dir, 'manifest.json')}")