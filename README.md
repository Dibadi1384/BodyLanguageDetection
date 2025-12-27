## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Python 3.x
- pip (Python package manager)

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd BodyLanguageDetection
```

### 2. Create a Virtual Environment

Create and activate a Python virtual environment:

**On Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**On macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Requirements

Install the required Python packages:

```bash
pip install -r requirements.txt
```

### 4. Backend Setup

1. Navigate to the Backend directory:
   ```bash
   cd Backend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the Backend directory with the following API keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   HF_TOKEN=your_huggingface_token_here
   OPEN_ROUTER_API_KEY=your_openrouter_api_key_here
   ```
   
   **Note:** 
   - `GEMINI_API_KEY` - Required for prompt refinement using Gemini 2.0 Flash
   - `HF_TOKEN` - Required for the primary LLM model (Hugging Face token)
   - `OPEN_ROUTER_API_KEY` - Optional, used as a fallback API. If you don't have this API key, you'll be limited to a certain number of tokens and detection might not be included for the whole video. You need to pay for Open Router API access to use it as a fallback.

4. Start the backend server:
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

The backend server will run on a port specified by the environment variable `PORT` if provided. If not provided, the backend will ask the OS for an available port and write the chosen port to `Backend/.backend-port` so other tools (like the frontend dev server) can discover it.

### 5. Frontend Setup

1. Navigate to the Frontend directory (in a new terminal):
   ```bash
   cd Frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`

### Important Notes

#### Upload and Work Folders

When you start the backend server, two folders will be automatically created in the `Backend` directory:

- **`uploads/`** - This folder contains all the video files you upload through the application. Each uploaded video is stored here with a unique filename.

- **`work/`** - This folder contains the results from the LLM model processing. It includes:
  - Processed frame data
  - Detection results
  - Annotated video outputs
  - Intermediate processing files

Both folders are automatically created when needed and are excluded from version control (see `.gitignore`).

#### LLM Models

This project uses the following LLM models:

- **Primary Model**: `Qwen/Qwen2.5-VL-7B-Instruct` - A vision-language model accessed via Hugging Face API. This is the main model used for video frame analysis and body language detection.

- **Prompt Refinement**: `gemini-2.0-flash` - Used for refining user prompts into detection instructions that the video analysis model can understand.

- **Fallback Model**: The same `Qwen/Qwen2.5-VL-7B-Instruct` model is available via Open Router API as a fallback option. This is useful when you hit rate limits or token limits on the primary Hugging Face API.

### Demo Videos

To test the model with example inputs, you can download all demo video clips here:
```bash
https://drive.google.com/drive/folders/1ovj5GqcfMnLB3oHrqJtHkMqxrixgbc6Z?usp=drive_link
```


