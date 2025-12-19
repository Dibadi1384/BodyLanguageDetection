import sys
import json
import os
import base64
from pathlib import Path
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
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
    image_id: int = Field(..., ge=0, description="Identification for the image idx, should match the index provided in the image input")
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
        {"type": "text", "text": "**Important note:** The image_id you generate, should match the IMAGE ID you will be provided with the image. Do not change it "},
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
            "text": f"[IMAGE ID: {img['id']}] File: {img['file_name']} | Dimensions: {img['width']}x{img['height']} pixels"
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
    max_tokens: int = 8000,
    fallback_client = None,
    fallback_model: str = None
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
    
    # Try primary client first
    try:
        resp = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.0,
        )
        text_out = resp.choices[0].message.content
        
        # Clean up the response - remove markdown code blocks if present
        text_out = text_out.strip()
        if text_out.startswith("```json"):
            text_out = text_out[7:]
        if text_out.startswith("```"):
            text_out = text_out[3:]
        if text_out.endswith("```"):
            text_out = text_out[:-3]
        text_out = text_out.strip()
        
        # Parse JSON directly and validate with Pydantic
        try:
            json_data = json.loads(text_out)
            
            # Convert bbox arrays to objects if needed
            if "images" in json_data:
                for img in json_data["images"]:
                    if "people" in img:
                        for person in img["people"]:
                            if "bbox" in person and isinstance(person["bbox"], list):
                                # Convert [x_min, y_min, x_max, y_max] to object
                                bbox_list = person["bbox"]
                                person["bbox"] = {
                                    "x_min": bbox_list[0],
                                    "y_min": bbox_list[1],
                                    "x_max": bbox_list[2],
                                    "y_max": bbox_list[3]
                                }
            
            parsed = BatchAnalysisResult(**json_data)
            return parsed
            
        except json.JSONDecodeError as json_err:
            print(f"JSON decode error: {json_err}", file=sys.stderr)
            print(f"Raw response (first 500 chars): {text_out[:500]}", file=sys.stderr)
            print(f"Raw response (last 100 chars): {text_out[-100:]}", file=sys.stderr)
            return None
        
    except Exception as e:
        error_msg = str(e).lower()
        # Check if it's a token limit/quota error
        if fallback_client and any(keyword in error_msg for keyword in ['quota', 'limit', 'rate', 'token']):
            print(f"Primary API failed (quota/limit): {e}", file=sys.stderr)
            print(f"Attempting fallback to OpenRouter...", file=sys.stderr)
            try:
                resp = fallback_client.chat.completions.create(
                    model=fallback_model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=0.0,
                )
                text_out = resp.choices[0].message.content
                
                # Parse JSON directly and validate with Pydantic
                try:
                    json_data = json.loads(text_out)
                    
                    # Convert bbox arrays to objects if needed
                    if "images" in json_data:
                        for img in json_data["images"]:
                            if "people" in img:
                                for person in img["people"]:
                                    if "bbox" in person and isinstance(person["bbox"], list):
                                        bbox_list = person["bbox"]
                                        person["bbox"] = {
                                            "x_min": bbox_list[0],
                                            "y_min": bbox_list[1],
                                            "x_max": bbox_list[2],
                                            "y_max": bbox_list[3]
                                        }
                    
                    parsed = BatchAnalysisResult(**json_data)
                    print(f"Fallback successful", file=sys.stderr)
                    return parsed
                except json.JSONDecodeError as json_err:
                    print(f"Fallback JSON decode error: {json_err}", file=sys.stderr)
                    print(f"Raw response: {text_out}", file=sys.stderr)
                    return None
                    
            except Exception as fallback_error:
                print(f"Fallback also failed: {fallback_error}", file=sys.stderr)
                if 'resp' in locals():
                    print(f"Raw response: {resp.choices[0].message.content}", file=sys.stderr)
                return None
        else:
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
        "id": frame_info['original_frame_number'],
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
    batch_size: int = 2,  # Reduced from 3 to 2 to avoid token limits
    fallback_client = None,
    fallback_model: str = None
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
            result = analyze_batch(
                client, 
                model_name, 
                images_payload, 
                task_description,
                max_tokens=8000,
                fallback_client=fallback_client,
                fallback_model=fallback_model
            )
            
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
    batch_size = int(sys.argv[3]) if len(sys.argv) > 3 else 2 
    
    # Load environment
    HF_TOKEN = os.environ.get("HF_TOKEN")
    OPEN_ROUTER_API_KEY = os.environ.get("OPEN_ROUTER_API_KEY")
    
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
    
    # Initialize primary client
    client = OpenAI(base_url="https://router.huggingface.co/v1", api_key=HF_TOKEN)
    # model_name = "Qwen/Qwen3-VL-8B-Instruct:novita"
    # model_name = "meta-llama/Llama-4-Scout-17B-16E-Instruct"
    # Use a vision-capable chat model compatible with images
    model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
    
    print(f"Using model: {model_name}", file=sys.stderr)
    
    # Initialize fallback client if available
    fallback_client = None
    fallback_model = None
    if OPEN_ROUTER_API_KEY:
        fallback_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPEN_ROUTER_API_KEY)
        fallback_model = "Qwen/Qwen2.5-VL-7B-Instruct"
        print(f"Fallback configured: OpenRouter with model {fallback_model}", file=sys.stderr)
    else:
        print(f"Warning: OPEN_ROUTER_API_KEY not found - no fallback available", file=sys.stderr)
    
    # Process frames
    detections = process_frames_in_batches(
        client, 
        model_name, 
        frames, 
        task_description,
        batch_size=batch_size,
        fallback_client=fallback_client,
        fallback_model=fallback_model
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
    
    # Save results outside the frames directory to avoid cleanup removal
    frames_dir = Path(manifest_path).parent
    work_root = frames_dir.parent
    video_stem = manifest.get('video_stem', 'video')
    output_path = work_root / f"{video_stem}_detections.json"
    
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
