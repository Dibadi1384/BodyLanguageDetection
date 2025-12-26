#!/usr/bin/env python3
"""
Test script for video annotator.
Finds the most recent video and corresponding detections JSON,
then creates an annotated test video.
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# Add the routes/src directory to the path so we can import video_annotator
script_dir = Path(__file__).parent
routes_src = script_dir / "routes" / "src"
sys.path.insert(0, str(routes_src))

from video_annotator import annotate_video

def find_latest_video(uploads_dir):
    """Find the most recently modified video file in uploads directory."""
    uploads_path = Path(uploads_dir)
    if not uploads_path.exists():
        raise FileNotFoundError(f"Uploads directory not found: {uploads_dir}")
    
    video_files = list(uploads_path.glob("*.mp4"))
    if not video_files:
        raise FileNotFoundError(f"No video files found in {uploads_dir}")
    
    # Sort by modification time, most recent first
    video_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    latest_video = video_files[0]
    
    return latest_video

def find_detections_json(work_dir, video_stem):
    """Find the detections JSON file matching the video stem."""
    work_path = Path(work_dir)
    detections_file = work_path / f"{video_stem}_detections.json"
    
    if not detections_file.exists():
        raise FileNotFoundError(
            f"Detections file not found: {detections_file}\n"
            f"Looking for video stem: {video_stem}"
        )
    
    return detections_file

def main():
    # Set up paths
    backend_dir = Path(__file__).parent
    uploads_dir = backend_dir / "uploads"
    work_dir = backend_dir / "work"
    
    print("=" * 60)
    print("Video Annotator Test Script")
    print("=" * 60)
    print()
    
    try:
        # Find latest video
        print(f"Searching for latest video in: {uploads_dir}")
        latest_video = find_latest_video(uploads_dir)
        video_stem = latest_video.stem
        print(f"✓ Found latest video: {latest_video.name}")
        print(f"  Video stem: {video_stem}")
        print(f"  Modified: {datetime.fromtimestamp(latest_video.stat().st_mtime)}")
        print()
        
        # Find corresponding detections JSON
        print(f"Searching for detections JSON in: {work_dir}")
        detections_file = find_detections_json(work_dir, video_stem)
        print(f"✓ Found detections file: {detections_file.name}")
        print()
        
        # Create test output path
        test_output = work_dir / f"{video_stem}_test_annotated.mp4"
        print(f"Output will be saved to: {test_output.name}")
        print()
        
        # Run annotation
        print("=" * 60)
        print("Starting video annotation...")
        print("=" * 60)
        print()
        
        result_path = annotate_video(
            str(latest_video),
            str(detections_file),
            str(test_output),
            show_progress=True
        )
        
        print()
        print("=" * 60)
        print("✓ Annotation complete!")
        print("=" * 60)
        print(f"Test video saved to: {result_path}")
        print()
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()


