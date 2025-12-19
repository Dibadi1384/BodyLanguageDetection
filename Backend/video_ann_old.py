#!/usr/bin/env python3
"""
Quick test script for video annotations
Usage: python test_annotation.py
"""

import sys
from pathlib import Path

# Add routes/src to path
sys.path.insert(0, str(Path(__file__).parent / "routes" / "src"))

from video_annotator import annotate_video

def main():
    # Find the most recent video and detection files
    uploads_dir = Path(__file__).parent / "uploads"
    
    # Get most recent video
    videos = list(uploads_dir.glob("*.webm")) + list(uploads_dir.glob("*.mp4"))
    if not videos:
        print("❌ No videos found in uploads/ directory")
        print("Please upload a video through the web interface first")
        return
    
    # Sort by modification time, most recent first
    videos.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    latest_video = videos[0]
    
    print(f"📹 Latest video: {latest_video.name}")
    
    # Find corresponding work directory
    video_stem = latest_video.stem
    work_dir = uploads_dir / video_stem
    
    if not work_dir.exists():
        print(f"❌ Work directory not found: {work_dir}")
        print("Process a video through the web interface first")
        return
    
    detections_file = work_dir / "detections.json"
    
    if not detections_file.exists():
        print(f"❌ Detections file not found: {detections_file}")
        print("Complete video processing through the web interface first")
        return
    
    print(f"✅ Found detections: {detections_file.name}")
    
    # Create output path
    output_path = work_dir / f"{video_stem}_annotated_test.mp4"
    
    print(f"\n🎨 Creating annotated video with new design...")
    print(f"Output: {output_path}")
    print("-" * 60)
    
    try:
        result = annotate_video(
            str(latest_video),
            str(detections_file),
            str(output_path),
            show_progress=True
        )
        
        print("-" * 60)
        print(f"\n✨ Success! Annotated video saved to:")
        print(f"   {result}")
        print(f"\nYou can find it in: {work_dir.name}/")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

