from pathlib import Path
import cv2
import os

# Input and output directories
input_folder = Path('uploads')
output_folder = Path('extracted_frames')

# Create output directory if it doesn't exist
output_folder.mkdir(exist_ok=True)

for file in input_folder.iterdir():
    if file.is_file() and file.suffix == '.mp4':
        # Create a subfolder for this video's frames
        video_output_folder = output_folder / file.stem
        video_output_folder.mkdir(exist_ok=True)
        
        video = cv2.VideoCapture(str(file))
        success, image = video.read()
        count = 0
        
        while success:
            # Save frame to the video's subfolder
            frame_path = video_output_folder / f'frame_{count:04d}.jpg'
            cv2.imwrite(str(frame_path), image)
            success, image = video.read()
            count += 1
        
        video.release()
        print(f'{file.stem} split into {count} images in folder: {video_output_folder}')
    else:
        print(f'{file.name} is not a video file')

