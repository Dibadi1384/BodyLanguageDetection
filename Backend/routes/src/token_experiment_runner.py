import sys
import json
import os
import base64
import time
from pathlib import Path
from typing import List, Dict, Any
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from PIL import Image
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class BoundingBox(BaseModel):
    x_min: int = Field(..., ge=0)
    y_min: int = Field(..., ge=0)
    x_max: int = Field(..., gt=0)
    y_max: int = Field(..., gt=0)

class DetectedPerson(BaseModel):
    person_id: int = Field(..., ge=0)
    bbox: BoundingBox = Field(...)
    bbox_confidence: float = Field(..., ge=0.0, le=1.0)
    analysis_result: Dict[str, Any] = Field(...)
    visual_description: str = Field(...)

class ImageAnalysis(BaseModel):
    image_id: int = Field(..., ge=0)
    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)
    people_detected: int = Field(..., ge=0)
    people: List[DetectedPerson] = Field(default_factory=list)

class BatchAnalysisResult(BaseModel):
    total_images: int = Field(..., ge=1)
    images: List[ImageAnalysis]

# ============================================================================
# Experiment Logic
# ============================================================================

def build_user_content(images_payload: List[Dict], task_description: str):
    """Builds the prompt content (same logic as original file)"""
    parser = PydanticOutputParser(pydantic_object=BatchAnalysisResult)
    schema_instructions = parser.get_format_instructions()
    
    user_texts = [
        {"type": "text", "text": f"You are a computer vision system. TASK: {task_description}. OUTPUT: Valid JSON only."},
        {"type": "text", "text": schema_instructions},
        {"type": "text", "text": "Important: image_id must match provided IMAGE ID. Detect all people. Return valid JSON."}
    ]

    for img in images_payload:
        user_texts.append({
            "type": "image_url",
            "image_url": {"url": img["data_uri"]}
        })
        user_texts.append({
            "type": "text",
            "text": f"[IMAGE ID: {img['id']}] File: {img['file_name']} | Size: {img['width']}x{img['height']}"
        })

    return user_texts

def run_single_batch(client, model_name, batch_frames, task_description):
    """Runs a single batch and returns usage stats"""
    
    # Prepare payload
    images_payload = []
    for frame in batch_frames:
        frame_path = frame['path']
        if not os.path.exists(frame_path): 
            continue
            
        file_type = Path(frame_path).suffix[1:].lower()
        with Image.open(frame_path) as img:
            w, h = img.size
        with open(frame_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
            
        images_payload.append({
            "id": frame['original_frame_number'],
            "file_name": frame['filename'],
            "width": w, 
            "height": h,
            "data_uri": f"data:image/{file_type};base64,{b64}"
        })

    if not images_payload:
        return None

    messages = [
        {"role": "system", "content": "You are a precise computer vision assistant. Output ONLY valid JSON matching the schema."},
        {"role": "user", "content": build_user_content(images_payload, task_description)},
    ]

    try:
        start_time = time.time()
        resp = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=4000,
            temperature=0.0,
        )
        duration = time.time() - start_time
        
        # Capture Token Usage
        usage = resp.usage
        
        return {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "total_tokens": usage.total_tokens,
            "latency_seconds": duration,
            "batch_size": len(images_payload)
        }
        
    except Exception as e:
        print(f"Error calling model {model_name}: {e}", file=sys.stderr)
        return None

def analyze_results(results_df, output_dir):
    """Generates plots and analysis"""
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)
    
    # Set plot style
    sns.set_theme(style="whitegrid")
    
    # 1. Total Token Usage vs Batch Size (Grouped by Model)
    plt.figure(figsize=(10, 6))
    sns.lineplot(data=results_df, x="batch_size", y="total_tokens", hue="model_alias", marker="o")
    plt.title("Total Token Usage by Batch Size")
    plt.xlabel("Batch Size")
    plt.ylabel("Total Tokens (Input + Output)")
    plt.savefig(output_dir / "1_total_tokens_vs_batch.png")
    plt.close()

    # 2. Input vs Output Token Comparison
    # Melt dataframe for stacked/grouped bar chart
    melted = results_df.melt(
        id_vars=["model_alias", "batch_size"], 
        value_vars=["prompt_tokens", "completion_tokens"],
        var_name="token_type", 
        value_name="count"
    )
    
    plt.figure(figsize=(12, 6))
    sns.barplot(data=melted, x="batch_size", y="count", hue="token_type", ci=None)

    g = sns.catplot(
        data=melted, kind="bar",
        x="batch_size", y="count", hue="token_type", col="model_alias",
        height=5, aspect=1.2, palette="viridis"
    )
    g.fig.subplots_adjust(top=0.85)
    g.fig.suptitle("Input (Prompt) vs Output (Completion) Tokens")
    plt.savefig(output_dir / "2_input_vs_output.png")
    plt.close()

    # 3. Efficiency: Tokens Per Image
    results_df["tokens_per_image"] = results_df["total_tokens"] / results_df["batch_size"]
    
    plt.figure(figsize=(10, 6))
    sns.barplot(data=results_df, x="batch_size", y="tokens_per_image", hue="model_alias")
    plt.title("Efficiency: Average Tokens Cost Per Image")
    plt.ylabel("Tokens per Image")
    plt.xlabel("Batch Size")
    plt.savefig(output_dir / "3_tokens_per_image_efficiency.png")
    plt.close()

    print(f"Analysis plots saved to {output_dir}")
    print("\nSummary Statistics:")
    print(results_df.groupby(["model_alias", "batch_size"])[["prompt_tokens", "completion_tokens", "total_tokens"]].mean())

def main():
    if len(sys.argv) < 3:
        print("Usage: python token_experiment_runner.py <manifest.json> <task_description>", file=sys.stderr)
        sys.exit(1)

    manifest_path = sys.argv[1]
    task_description = sys.argv[2]
    
    
    models_config = {
        #"Llama 3.3": "meta-llama/Llama-3.2-90B-Vision-Instruct:together" ,
        "Qwen 3 VL": "Qwen/Qwen3-VL-30B-A3B-Instruct",
    }
    
    batch_sizes = [1, 2, 3, 5]
    
    # Max samples per configuration to save time/cost
    max_batches_per_config = 3

    # Load manifest
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    frames = manifest.get('frames', [])[:20] # Limit total frames loaded for safety
    
    if not frames:
        print("No frames found.")
        sys.exit(1)

    # API Setup
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("Error: HF_TOKEN not set")
        sys.exit(1)
        
    client = OpenAI(base_url="https://router.huggingface.co/v1", api_key=hf_token)

    experiment_data = []

    print(f"Starting experiment on {len(frames)} frames...")
    print(f"Models: {list(models_config.keys())}")
    print(f"Batch Sizes: {batch_sizes}")

    for model_alias, model_id in models_config.items():
        print(f"--- Testing Model: {model_alias} ({model_id}) ---")
        
        for b_size in batch_sizes:
            print(f"  Testing Batch Size: {b_size}")
            
            # Create batches
            batches_run = 0
            for i in range(0, len(frames), b_size):
                if batches_run >= max_batches_per_config:
                    break
                    
                batch_frames = frames[i : i + b_size]
                # Skip if we don't have a full batch
                if len(batch_frames) < b_size:
                    continue

                stats = run_single_batch(client, model_id, batch_frames, task_description)
                
                if stats:
                    stats["model_alias"] = model_alias
                    stats["model_id"] = model_id
                    experiment_data.append(stats)
                    print(f"Batch {batches_run+1}: {stats['total_tokens']} tokens ({stats['latency_seconds']:.2f}s)")
                
                batches_run += 1
                time.sleep(1)

    if not experiment_data:
        print("No data collected. Check API keys or Model IDs.")
        sys.exit(1)

    # Create DataFrame and Save
    df = pd.DataFrame(experiment_data)
    results_path = Path("token_experiment_results.csv")
    df.to_csv(results_path, index=False)
    print(f"Raw data saved to {results_path}")

    # Run Analysis
    analyze_results(df, "token_experiment_plots")

if __name__ == "__main__":
    main()