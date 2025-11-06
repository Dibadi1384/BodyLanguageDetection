import sys
import json
import os
import base64
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from langchain.output_parsers import PydanticOutputParser
from PIL import Image
from openai import OpenAI
from dotenv import load_dotenv
    
load_dotenv()

class BoundingBox(BaseModel):
    """Bounding box in [x_min, y_min, x_max, y_max] format"""
    x_min: int = Field(..., ge=0, description="Left edge x-coordinate")
    y_min: int = Field(..., ge=0, description="Top edge y-coordinate")
    x_max: int = Field(..., gt=0, description="Right edge x-coordinate")
    y_max: int = Field(..., gt=0, description="Bottom edge y-coordinate")
    
    def to_list(self) -> List[int]:
        """Convert to [x_min, y_min, x_max, y_max] format"""
        return [self.x_min, self.y_min, self.x_max, self.y_max]

class DetectedPerson(BaseModel):
    """Detected person with flexible attributes based on analysis task"""
    person_id: int = Field(..., ge=0, description="Unique identifier for this person in the image")
    bbox: BoundingBox = Field(..., description="Bounding box coordinates")
    bbox_confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in person detection")
    analysis_result: Dict[str, Any] = Field(
        ..., 
        description="Consise Flexible analysis results based on the task (e.g., emotion, action, clothing, etc.)"
    )
    visual_description: str = Field(
        ..., 
        description="Detailed visual description supporting the analysis"
    )

class ImageAnalysis(BaseModel):
    image_id: int = Field(..., ge=0)
    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)
    people_detected: int = Field(..., ge=0, description="Total number of people detected")
    people: List[DetectedPerson] = Field(default_factory=list, description="List of detected people")

class BatchAnalysisResult(BaseModel):
    total_images: int = Field(..., ge=1)
    images: List[ImageAnalysis]


def build_user_content(images_payload: List[Dict], task_description: str):
    """Build prompt with flexible task description"""
    
    parser = PydanticOutputParser(pydantic_object=BatchAnalysisResult)
    schema_instructions = parser.get_format_instructions()
    
    user_texts = [
        {"type": "text", "text": f"""You are an expert computer vision system specialized in detecting people and analyzing them based on specific tasks.

TASK: {task_description}

OUTPUT: Return EXACTLY ONE valid JSON object following the schema below."""},
        {"type": "text", "text": schema_instructions},
        {"type": "text", "text": """
DETECTION GUIDELINES:

1. PERSON DETECTION:
   - Detect ALL visible people in each image, even if partially visible
   - Each person gets a unique person_id starting from 0
   - Bounding box format: {x_min, y_min, x_max, y_max} in pixel coordinates
   - bbox_confidence: Use < 1.0 if person is occluded, blurry, or partially visible

2. ANALYSIS RESULT (analysis_result field):
   - This is a flexible JSON object containing your analysis based on the task
   - Structure it logically based on what you're analyzing
   - Include confidence scores where appropriate
   - Examples:
     * For emotion: {"emotion": "happy", "confidence": 0.9, "intensity": "high"}
     * For action: {"action": "running", "confidence": 0.85, "direction": "left"}
     * For clothing: {"top": "red shirt", "bottom": "blue jeans", "accessories": ["hat"]}
     * For pose: {"pose": "standing", "arms": "crossed", "facing": "camera"}

3. VISUAL DESCRIPTION (visual_description field):
   - Provide specific, detailed observations that support your analysis
   - GOOD: "Person wearing red shirt with raised arms, mouth open in smile, eyes crinkled"
   - BAD: "Person looks happy"
   - Include relevant details about: posture, gestures, clothing, facial features, body position

4. COORDINATE ACCURACY:
   - All coordinates must be within image bounds (0 to width/height)
   - Ensure x_max > x_min and y_max > y_min
   - Be precise but if uncertain, indicate with lower bbox_confidence

5. EDGE CASES:
   - If no people detected, return empty people array with people_detected=0
   - If requested information is not visible, note this in analysis_result with low confidence

Analyze systematically: scan the entire image, identify each person, perform the requested analysis, then output structured JSON."""}
    ]

    # Add images with metadata
    for img in images_payload:
        user_texts.append({
            "type": "image_url",
            "image_url": {"url": img["data_uri"]}
        })
        user_texts.append({
            "type": "text",
            "text": f"[IMAGE {img['id']}] File: {img['file_name']} | Dimensions: {img['width']}x{img['height']} pixels"
        })

    return user_texts

# ============================================================================
# Analysis Function
# ============================================================================

def analyze_batch(
    client, 
    model_name: str, 
    images_payload: List[Dict], 
    task_description: str,
    max_tokens: int = 4000
):
    """Analyze a batch of images with flexible task"""
    
    messages = [
        {
            "role": "system", 
            "content": "You are a precise computer vision assistant. Output ONLY valid JSON matching the schema. No additional text."
        },
        {"role": "user", "content": build_user_content(images_payload, task_description)},
    ]

    parser = PydanticOutputParser(pydantic_object=BatchAnalysisResult)
    
    try:
        resp = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.0,
        )
        text_out = resp.choices[0].message.content
        parsed = parser.parse(text_out)
        return parsed
    except Exception as e:
        print(f"Error analyzing batch: {e}", file=sys.stderr)
        if 'resp' in locals():
            print(f"Raw response: {resp.choices[0].message.content}", file=sys.stderr)
        return None


def load_frame_payload(frame_info: Dict) -> Dict:
    """Load a single frame and prepare payload"""
    frame_path = frame_info['path']
    
    if not os.path.exists(frame_path):
        raise FileNotFoundError(f"Frame not found: {frame_path}")
    
    file_type = Path(frame_path).suffix[1:].lower()
    
    with Image.open(frame_path) as img:
        w, h = img.size
    
    with open(frame_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    
    return {
        "id": frame_info['index'],
        "file_name": frame_info['filename'],
        "width": w,
        "height": h,
        "data_uri": f"data:image/{file_type};base64,{b64}",
        "timestamp_s": frame_info.get('timestamp_s')
    }

def process_frames_in_batches(
    client, 
    model_name: str, 
    frames: List[Dict], 
    task_description: str,
    batch_size: int = 3
):
    """Process frames in batches"""
    all_detections = []
    total_frames = len(frames)
    
    print(f"Processing {total_frames} frames in batches of {batch_size}...", file=sys.stderr)
    print(f"Task: {task_description}", file=sys.stderr)
    
    for i in range(0, total_frames, batch_size):
        batch_frames = frames[i:i+batch_size]
        batch_num = i//batch_size + 1
        total_batches = (total_frames + batch_size - 1)//batch_size
        
        print(f"Processing batch {batch_num}/{total_batches} (frames {i} to {min(i+batch_size, total_frames)-1})...", 
              file=sys.stderr)
        
        try:
            # Load frame data
            images_payload = []
            for frame in batch_frames:
                try:
                    payload = load_frame_payload(frame)
                    images_payload.append(payload)
                except Exception as e:
                    print(f"Error loading frame {frame['index']}: {e}", file=sys.stderr)
                    continue
            
            if not images_payload:
                print(f"No valid images in batch {batch_num}, skipping...", file=sys.stderr)
                continue
            
            # Analyze batch
            result = analyze_batch(client, model_name, images_payload, task_description)
            
            if result:
                # Store results with frame metadata
                for img_analysis in result.images:
                    frame_idx = img_analysis.image_id
                    frame_info = next((f for f in batch_frames if f['index'] == frame_idx), None)
                    
                    detection = {
                        "frame_index": frame_idx,
                        "frame_filename": frame_info['filename'] if frame_info else None,
                        "timestamp_s": frame_info.get('timestamp_s') if frame_info else None,
                        "image_width": img_analysis.image_width,
                        "image_height": img_analysis.image_height,
                        "people_detected": img_analysis.people_detected,
                        "people": [
                            {
                                "person_id": p.person_id,
                                "bbox": {
                                    "x_min": p.bbox.x_min,
                                    "y_min": p.bbox.y_min,
                                    "x_max": p.bbox.x_max,
                                    "y_max": p.bbox.y_max
                                },
                                "bbox_confidence": p.bbox_confidence,
                                "analysis_result": p.analysis_result,
                                "visual_description": p.visual_description
                            }
                            for p in img_analysis.people
                        ]
                    }
                    all_detections.append(detection)
                
                print(f"Batch {batch_num} complete: {len(result.images)} frames analyzed, "
                      f"{sum(img.people_detected for img in result.images)} people detected", 
                      file=sys.stderr)
            else:
                print(f"Batch {batch_num} failed to produce results", file=sys.stderr)
        
        except Exception as e:
            print(f"Error processing batch {batch_num}: {e}", file=sys.stderr)
            continue
    
    return all_detections

# ============================================================================
# Main Function
# ============================================================================

def main():
    if len(sys.argv) < 3:
        print("Usage: python flexible_frame_analyzer.py <manifest.json> <task_description>", file=sys.stderr)
        print('Example: python flexible_frame_analyzer.py manifest.json "Detect people and analyze their emotions"', file=sys.stderr)
        sys.exit(1)
    
    manifest_path = sys.argv[1]
    task_description = sys.argv[2]
    
    # Optional parameters
    batch_size = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    
    # Load environment
    HF_TOKEN = os.environ.get("HF_TOKEN")
    if not HF_TOKEN:
        print("Error: HF_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    # Load manifest
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        print(f"Manifest loaded from: {manifest_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error loading manifest: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Get frames
    frames = manifest.get('frames', [])
    
    if not frames:
        print("Error: No frames found in manifest", file=sys.stderr)
        sys.exit(1)
    
    print(f"Loaded {len(frames)} frames", file=sys.stderr)
    
    # Initialize client
    client = OpenAI(base_url="https://router.huggingface.co/v1", api_key=HF_TOKEN)
    model_name = "Qwen/Qwen3-VL-8B-Instruct:novita"
    
    print(f"Using model: {model_name}", file=sys.stderr)
    
    # Process frames
    detections = process_frames_in_batches(
        client, 
        model_name, 
        frames, 
        task_description,
        batch_size=batch_size
    )
    
    if not detections:
        print("Error: No detections generated", file=sys.stderr)
        sys.exit(1)
    
    print(f"Detection complete: {len(detections)} frames processed", file=sys.stderr)
    
    # Prepare output
    output = {
        "video_info": {
            "video_path": manifest['video_path'],
            "video_stem": manifest['video_stem'],
            "fps": manifest['fps'],
            "total_frames": manifest['saved_count']
        },
        "task_description": task_description,
        "frame_detections": detections
    }
    
    # Save results
    work_dir = Path(manifest_path).parent
    output_path = work_dir / "detections.json"
    
    try:
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"Results saved to: {output_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error saving results: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Output the detections path (for capture by Node.js)
    print(str(output_path))

if __name__ == "__main__":
    main()