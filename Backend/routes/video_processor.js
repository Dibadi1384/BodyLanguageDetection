const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

/**
 * Main video processing pipeline
 * Extracts frames, analyzes them, and creates annotated video
 */
class VideoProcessor {
	constructor(options = {}) {
		this.workDir = options.workDir || "./work";
		this.frameInterval = options.frameInterval || 1;
		this.batchSize = options.batchSize || 4;
		this.maxFrames = options.maxFrames || 8;
		this.keepIntermediateFiles = options.keepIntermediateFiles || false;
		this.skipAnnotation = options.skipAnnotation || false;
		this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
		
		// Model information
		this.models = {
			promptRefinement: "gemini-2.0-flash",  // Used for refining prompts
			frameAnalysis: "Qwen/Qwen2.5-VL-7B-Instruct"  // Used for analyzing video frames
		};
		
		// Status callback for external status updates
		this.statusCallback = options.statusCallback || null;
		
		console.log("[VIDEO PROCESSOR] Initialized with workDir:", this.workDir);
		console.log("[VIDEO PROCESSOR] Models configured:", this.models);
	}
	
	/**
	 * Update status and notify callback if available
	 */
	updateStatus(status, stage, details = {}) {
		const statusInfo = {
			status,
			stage,
			timestamp: new Date().toISOString(),
			...details
		};
		
		console.log(`[VIDEO PROCESSOR STATUS] ${status} - Stage ${stage}:`, details);
		
		if (this.statusCallback && typeof this.statusCallback === 'function') {
			try {
				this.statusCallback(statusInfo);
			} catch (error) {
				console.error("[VIDEO PROCESSOR] Status callback error:", error);
			}
		}
		
		return statusInfo;
	}

	/**
	 * Refine task description using Gemini
	 */
	async refineTaskDescription(userInstruction) {
		this.updateStatus('refining_prompt', 0, {
			model: this.models.promptRefinement,
			action: 'Refining prompt with Gemini'
		});
		
		console.log("\n=== Refining Task with Gemini ===");
		console.log(`Model: ${this.models.promptRefinement}`);
		console.log(`User instruction: ${userInstruction}`);

		try {
			const model = this.genAI.getGenerativeModel({
				model: this.models.promptRefinement,
			});
			const prompt = `Take the following user instruction and rewrite it as a short, clear detection prompt that a video analysis model can understand. Focus on the importance of using bounding boxes to detect people as well as their corresponding emotions. Respond only with the rewritten prompt (no explanation):\n\nUser input: ${userInstruction}`;
			const result = await model.generateContent(prompt);
			const refinedPrompt = result.response.text().trim();

			console.log(`Refined prompt: ${refinedPrompt}`);
			this.updateStatus('refining_prompt', 0, {
				model: this.models.promptRefinement,
				action: 'Prompt refinement completed',
				refinedPrompt
			});
			
			return refinedPrompt;
		} catch (error) {
			console.error(
				"Gemini refinement failed, using original instruction:",
				error.message
			);
			this.updateStatus('refining_prompt', 0, {
				model: this.models.promptRefinement,
				action: 'Prompt refinement failed, using original',
				error: error.message
			});
			return userInstruction;
		}
	}

	/**
	 * Run a Python script and capture output
	 */
	async runPythonScript(scriptPath, args = []) {
		return new Promise((resolve, reject) => {
			// Detect Python command based on OS
			const isWindows = process.platform === 'win32';
			
			// Try virtual environment Python first
			let venvPython;
			if (isWindows) {
				// Windows: venv\Scripts\python.exe
				venvPython = path.join(
					__dirname,
					"..",
					"venv",
					"Scripts",
					"python.exe"
				);
			} else {
				// Unix/Linux/Mac: venv/bin/python3
				venvPython = path.join(
					__dirname,
					"..",
					"venv",
					"bin",
					"python3"
				);
			}
			
			// Determine Python command to use
			let pythonCmd;
			if (fs.existsSync(venvPython)) {
				pythonCmd = venvPython;
				console.log(`[PYTHON] Using venv Python: ${pythonCmd}`);
			} else {
				// Fallback: try 'python' first (Windows), then 'python3' (Unix)
				pythonCmd = isWindows ? "python" : "python3";
				console.log(`[PYTHON] Using system Python: ${pythonCmd}`);
			}

			const childProcess = spawn(pythonCmd, [scriptPath, ...args]);

			let stdout = "";
			let stderr = "";

			childProcess.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			childProcess.stderr.on("data", (data) => {
				const output = data.toString();
				stderr += output;
				// Log stderr output (Python scripts often use stderr for status messages)
				const lines = output.trim().split('\n');
				lines.forEach(line => {
					if (line.trim()) {
						console.log(line.trim());
					}
				});
			});

			childProcess.on("error", (error) => {
				// Handle spawn errors (e.g., Python not found)
				if (error.code === 'ENOENT') {
					reject(
						new Error(
							`Python not found. Please ensure Python is installed and available in PATH.\n` +
							`Tried command: ${pythonCmd}\n` +
							`On Windows, use 'python'. On Unix/Linux/Mac, use 'python3'.\n` +
							`Original error: ${error.message}`
						)
					);
				} else {
					reject(error);
				}
			});

			childProcess.on("close", (code) => {
				if (code !== 0) {
					reject(
						new Error(
							`Python script failed with code ${code}\nCommand: ${pythonCmd}\nScript: ${scriptPath}\n${stderr}`
						)
					);
				} else {
					resolve({ stdout: stdout.trim(), stderr });
				}
			});
		});
	}

	/**
	 * Step 1: Extract frames from video
	 */
	async extractFrames(videoPath) {
		this.updateStatus('extracting_frames', 1, {
			action: 'Starting frame extraction',
			videoPath,
			frameInterval: this.frameInterval,
			maxFrames: this.maxFrames
		});
		
		console.log("\n=== Step 1: Extracting Frames ===");

		const sessionId = uuidv4().split("-")[0];
		const framesDir = path.join(this.workDir, `frames_${sessionId}`);

		// Ensure work directory exists
		if (!fs.existsSync(this.workDir)) {
			fs.mkdirSync(this.workDir, { recursive: true });
		}

		const args = [
			videoPath,
			framesDir,
			this.frameInterval.toString(),
			...(this.maxFrames ? [this.maxFrames.toString()] : []),
		];

		// Resolve python script absolute path relative to this routes folder
		const extractorScript = path.join(__dirname, "src", "video_extractor.py");
		const result = await this.runPythonScript(extractorScript, args);

		const manifestPath = path.join(framesDir, "manifest.json");

		if (!fs.existsSync(manifestPath)) {
			this.updateStatus('extracting_frames', 1, {
				action: 'Frame extraction failed',
				error: 'manifest.json not found'
			});
			throw new Error("Frame extraction failed: manifest.json not found");
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

		console.log(`Extracted ${manifest.saved_count} frames to ${framesDir}`);
		
		this.updateStatus('extracting_frames', 1, {
			action: 'Frame extraction completed',
			framesExtracted: manifest.saved_count,
			framesDir,
			manifestPath
		});

		return { manifestPath, framesDir, manifest };
	}

	/**
	 * Step 2: Analyze frames with vision model
	 */
	async analyzeFrames(manifestPath, taskDescription) {
		this.updateStatus('analyzing_frames', 2, {
			action: 'Starting frame analysis',
			model: this.models.frameAnalysis,
			taskDescription,
			batchSize: this.batchSize
		});
		
		console.log("\n=== Step 2: Analyzing Frames ===");
		console.log(`[LLM CONNECTION] Preparing to connect to vision model: ${this.models.frameAnalysis}`);
		console.log(`[LLM CONNECTION] Endpoint: HuggingFace Router (https://router.huggingface.co/v1)`);
		console.log(`Task: ${taskDescription}`);

		// Cap batch size to avoid oversized requests hitting router limits
		const safeBatchSize = Math.min(this.batchSize, 2);
		const args = [manifestPath, taskDescription, safeBatchSize.toString()];

		const analyzerScript = path.join(__dirname, "src", "frame_analyzer.py");
		console.log(`[LLM CONNECTION] Calling frame analyzer script: ${analyzerScript}`);
		console.log(`[LLM CONNECTION] Script arguments: ${args.join(', ')}`);
		
		// Check if HF_TOKEN is set (required for HuggingFace Router connection)
		if (!process.env.HF_TOKEN) {
			console.warn(`[LLM CONNECTION] ⚠ Warning: HF_TOKEN environment variable not set - connection may fail`);
		} else {
			console.log(`[LLM CONNECTION] ✓ HF_TOKEN environment variable is set`);
		}
		
		console.log(`[LLM CONNECTION] Starting Python script execution...`);
		console.log(`[LLM CONNECTION] Waiting for LLM connection confirmation from Python script...`);
		
		const result = await this.runPythonScript(analyzerScript, args);
		
		console.log(`[LLM CONNECTION] Python script execution completed`);

		// Parse stderr for connection confirmation messages
		if (result.stderr) {
			const stderrLines = result.stderr.split('\n');
			stderrLines.forEach(line => {
				if (line.includes('Using model:') || line.includes('model:')) {
					console.log(`[LLM CONNECTION] ✓ ${line.trim()}`);
				}
				if (line.includes('Fallback configured') || line.includes('Warning:')) {
					console.log(`[LLM CONNECTION] ${line.trim()}`);
				}
				if (line.includes('Loaded') && line.includes('frames')) {
					console.log(`[LLM CONNECTION] ${line.trim()}`);
				}
			});
		}

		// The script outputs the detections path as the last line
		const detectionsPath = result.stdout.split("\n").pop();

		if (!fs.existsSync(detectionsPath)) {
			console.error(`[LLM CONNECTION] ✗ Connection failed: detections.json not found`);
			this.updateStatus('analyzing_frames', 2, {
				action: 'Frame analysis failed',
				model: this.models.frameAnalysis,
				error: 'detections.json not found'
			});
			throw new Error("Frame analysis failed: detections.json not found");
		}

		console.log(`[LLM CONNECTION] ✓ Detections file created: ${detectionsPath}`);
		console.log(`[LLM CONNECTION] ✓ Successfully received results from vision model`);
		
		const detections = JSON.parse(fs.readFileSync(detectionsPath, "utf8"));
		
		const totalPeople = detections.frame_detections.reduce(
			(sum, f) => sum + f.people_detected,
			0
		);

		console.log(
			`[LLM CONNECTION] ✓ Successfully processed ${detections.frame_detections.length} frames`
		);
		console.log(
			`✓ Analyzed ${detections.frame_detections.length} frames, detected ${totalPeople} people total`
		);
		console.log(`[LLM CONNECTION] ✓ Vision model connection and processing confirmed successful`);
		
		this.updateStatus('analyzing_frames', 2, {
			action: 'Frame analysis completed',
			model: this.models.frameAnalysis,
			framesAnalyzed: detections.frame_detections.length,
			totalPeopleDetected: totalPeople,
			detectionsPath,
			llmConnectionConfirmed: true
		});

		return { detectionsPath, detections };
	}

	/**
	 * Step 3: Create annotated video
	 */
	async annotateVideo(videoPath, detectionsPath, outputPath = null) {
		this.updateStatus('annotating_video', 3, {
			action: 'Starting video annotation',
			videoPath,
			detectionsPath
		});
		
		console.log("\n=== Step 3: Creating Annotated Video ===");

		// If no output path specified, save to work directory (not frames directory)
		if (!outputPath) {
			const videoStem = path.basename(videoPath, path.extname(videoPath));
			outputPath = path.join(this.workDir, `${videoStem}_annotated.mp4`);
		}

		const args = [videoPath, detectionsPath, outputPath];

		const annotatorScript = path.join(__dirname, "src", "video_annotator.py");
		
		// Track annotation progress by parsing stderr
		let annotationProgress = { frameIdx: 0, totalFrames: 0, percentage: 0 };
		
		// Override runPythonScript to capture progress in real-time for annotation
		const result = await new Promise((resolve, reject) => {
			const isWindows = process.platform === 'win32';
			let venvPython;
			if (isWindows) {
				venvPython = path.join(__dirname, "..", "venv", "Scripts", "python.exe");
			} else {
				venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
			}
			const pythonCmd = fs.existsSync(venvPython) ? venvPython : (isWindows ? "python" : "python3");
			
			const childProcess = spawn(pythonCmd, [annotatorScript, ...args], {
				cwd: path.dirname(annotatorScript),
			});
			
			let stdout = "";
			let stderr = "";
			
			childProcess.stdout.on("data", (data) => {
				stdout += data.toString();
			});
			
			childProcess.stderr.on("data", (data) => {
				const output = data.toString();
				stderr += output;
				// Parse progress lines like "Progress: 52.6% (100/190 frames)"
				const lines = output.trim().split('\n');
				lines.forEach(line => {
					if (line.trim()) {
						console.log(line.trim());
						// Match: Progress: X.X% (frame_idx/total_frames frames)
						const progressMatch = line.match(/Progress:\s*([\d.]+)%\s*\((\d+)\/(\d+)\s*frames\)/);
						if (progressMatch) {
							const percentage = parseFloat(progressMatch[1]);
							const frameIdx = parseInt(progressMatch[2]);
							const totalFrames = parseInt(progressMatch[3]);
							annotationProgress = { frameIdx, totalFrames, percentage };
							// Update status with progress
							this.updateStatus('annotating_video', 3, {
								action: 'Annotating video frames',
								frameIdx,
								totalFrames,
								percentage
							});
						}
					}
				});
			});
			
			childProcess.on("error", (error) => {
				if (error.code === 'ENOENT') {
					reject(new Error(`Python not found. Tried: ${pythonCmd}`));
				} else {
					reject(error);
				}
			});
			
			childProcess.on("close", (code) => {
				if (code !== 0) {
					reject(new Error(`Annotation failed with code ${code}\n${stderr}`));
				} else {
					resolve({ stdout: stdout.trim(), stderr });
				}
			});
		});

		// The script outputs the annotated video path as the last line
		const annotatedVideoPath = result.stdout.split("\n").pop();

		if (!fs.existsSync(annotatedVideoPath)) {
			this.updateStatus('annotating_video', 3, {
				action: 'Video annotation failed',
				error: 'output video not found'
			});
			throw new Error("Video annotation failed: output video not found");
		}

		const stats = fs.statSync(annotatedVideoPath);
		const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
		
		console.log(
			`Created annotated video: ${annotatedVideoPath} (${fileSizeMB} MB)`
		);
		
		// Try to re-encode to H.264 for browser compatibility using ffmpeg
		// This ensures the video works in HTML5 video elements
		try {
			const reencodedPath = await this.reencodeToH264(annotatedVideoPath);
			if (reencodedPath && fs.existsSync(reencodedPath)) {
				// Replace original with re-encoded version
				fs.unlinkSync(annotatedVideoPath);
				fs.renameSync(reencodedPath, annotatedVideoPath);
				const newStats = fs.statSync(annotatedVideoPath);
				const newSizeMB = (newStats.size / 1024 / 1024).toFixed(2);
				console.log(`Re-encoded video to H.264: ${annotatedVideoPath} (${newSizeMB} MB)`);
			}
		} catch (reencodeError) {
			console.warn('Could not re-encode video to H.264 (ffmpeg may not be available):', reencodeError.message);
			console.warn('Video may not play in browsers if codec is not browser-compatible');
		}
		
		this.updateStatus('annotating_video', 3, {
			action: 'Video annotation completed',
			annotatedVideoPath,
			fileSizeMB: parseFloat(fileSizeMB)
		});

		return annotatedVideoPath;
	}

	/**
	 * Re-encode video to H.264 for browser compatibility using ffmpeg
	 */
	async reencodeToH264(inputPath) {
		const tempPath = inputPath.replace(/\.mp4$/, '_h264_temp.mp4');
		
		return new Promise((resolve, reject) => {
			// Check if ffmpeg is available
			const isWindows = process.platform === 'win32';
			const ffmpegCmd = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
			
			const args = [
				'-i', inputPath,
				'-c:v', 'libx264',           // H.264 video codec
				'-preset', 'medium',          // Encoding speed/quality balance
				'-crf', '23',                 // Quality (18-28, lower is better)
				'-c:a', 'aac',                // AAC audio codec
				'-movflags', '+faststart',    // Optimize for web streaming
				'-y',                         // Overwrite output file
				tempPath
			];
			
			const ffmpegProcess = spawn(ffmpegCmd, args);
			
			let stderr = '';
			ffmpegProcess.stderr.on('data', (data) => {
				stderr += data.toString();
			});
			
			ffmpegProcess.on('error', (error) => {
				if (error.code === 'ENOENT') {
					reject(new Error('ffmpeg not found. Install ffmpeg for browser-compatible video encoding.'));
				} else {
					reject(error);
				}
			});
			
			ffmpegProcess.on('close', (code) => {
				if (code === 0 && fs.existsSync(tempPath)) {
					resolve(tempPath);
				} else {
					reject(new Error(`ffmpeg re-encoding failed with code ${code}`));
				}
			});
		});
	}

	/**
	 * Clean up intermediate files
	 */
	cleanup(framesDir) {
		if (!this.keepIntermediateFiles && fs.existsSync(framesDir)) {
			console.log(`Cleaning up intermediate files: ${framesDir}`);
			fs.rmSync(framesDir, { recursive: true, force: true });
		}
	}

	/**
	 * Process entire video pipeline
	 */
	async processVideo(videoPath, taskDescription, outputPath = null, skipRefinement = false) {
		this.updateStatus('initializing', 0, {
			action: 'Initializing video processing pipeline',
			videoPath,
			taskDescription,
			skipRefinement,
			models: this.models
		});
		
		console.log("=".repeat(60));
		console.log("VIDEO PROCESSING PIPELINE");
		console.log("=".repeat(60));
		console.log(`Video: ${videoPath}`);
		console.log(`Task Description: ${taskDescription}`);
		console.log(`Skip Refinement: ${skipRefinement}`);
		console.log(`Frame Interval: ${this.frameInterval}`);
		console.log(`Batch Size: ${this.batchSize}`);
		console.log(`Models:`, this.models);
		console.log("=".repeat(60));

		try {
			let refinedTask;
			if (skipRefinement) {
				console.log("[VIDEO PROCESSOR] Using provided prompt as-is (already refined via NLP)");
				refinedTask = taskDescription;
			} else {
				console.log("[VIDEO PROCESSOR] Refining prompt with Gemini...");
				refinedTask = await this.refineTaskDescription(
					taskDescription
				);
			}

			// Step 1: Extract frames
			const { manifestPath, framesDir, manifest } =
				await this.extractFrames(videoPath);

			// Step 2: Analyze frames with refined task
			const { detectionsPath, detections } = await this.analyzeFrames(
				manifestPath,
				refinedTask
			);

			// Step 3: Annotate video (optional, skip for faster testing)
			let annotatedVideoPath = null;
			if (!this.skipAnnotation) {
				annotatedVideoPath = await this.annotateVideo(
					videoPath,
					detectionsPath,
					outputPath
				);
			} else {
				console.log(
					"\nSkipping video annotation (skipAnnotation=true)"
				);
				this.updateStatus('annotating_video', 3, {
					action: 'Video annotation skipped',
					reason: 'skipAnnotation flag is true'
				});
			}

			// Cleanup
			this.updateStatus('cleaning_up', 4, {
				action: 'Cleaning up intermediate files',
				framesDir
			});
			this.cleanup(framesDir);

			console.log("\n" + "=".repeat(60));
			console.log("PROCESSING COMPLETE");
			console.log("=".repeat(60));
			console.log(`Original Task: ${taskDescription}`);
			console.log(`Refined Task: ${refinedTask}`);
			console.log(`Work Directory: ${this.workDir}`);
			console.log(`Annotated Video: ${annotatedVideoPath}`);
			console.log(`Detections JSON: ${detectionsPath}`);
			console.log(`[VIDEO PROCESSOR DEBUG] Results saved in work folder: ${this.workDir}`);

			const result = {
				success: true,
				annotatedVideoPath,
				detectionsPath,
				detections,
				videoInfo: manifest,
				originalTask: taskDescription,
				refinedTask: refinedTask,
				models: this.models,
				processingStages: {
					refinement: skipRefinement ? 'skipped' : 'completed',
					frameExtraction: 'completed',
					frameAnalysis: 'completed',
					videoAnnotation: this.skipAnnotation ? 'skipped' : 'completed',
					cleanup: 'completed'
				}
			};
			
			this.updateStatus('completed', 5, {
				action: 'Video processing completed successfully',
				result: {
					annotatedVideoPath,
					detectionsPath,
					framesExtracted: manifest.saved_count,
					totalPeopleDetected: detections.frame_detections.reduce(
						(sum, f) => sum + f.people_detected,
						0
					)
				}
			});

			return result;
		} catch (error) {
			console.error("\n" + "=".repeat(60));
			console.error("ERROR");
			console.error("=".repeat(60));
			console.error(error.message);
			console.error("Stack:", error.stack);

			this.updateStatus('failed', -1, {
				action: 'Video processing failed',
				error: error.message,
				stack: error.stack
			});

			return {
				success: false,
				error: error.message,
				models: this.models
			};
		}
	}
}

/**
 * Command line interface
 */
async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log(
			"Usage: node video_processor.js <video_path> <task_description> [options]"
		);
		console.log("\nOptions:");
		console.log(
			"  --output <path>          Output path for annotated video"
		);
		console.log(
			"  --frame-interval <n>     Extract every Nth frame (default: 30)"
		);
		console.log(
			"  --batch-size <n>         Process n frames per batch (default: 3)"
		);
		console.log(
			"  --max-frames <n>         Maximum frames to extract (default: all)"
		);
		console.log("  --keep-files             Keep intermediate frame files");
		console.log(
			"  --work-dir <path>        Work directory (default: ./work)"
		);
		console.log("\nExample:");
		console.log(
			'  node video_processor.js video.mp4 "Detect people and analyze their emotions"'
		);
		console.log(
			'  node video_processor.js video.mp4 "Identify people performing actions" --frame-interval 15'
		);
		process.exit(1);
	}

	const videoPath = args[0];
	const taskDescription = args[1];

	// Parse options
	const options = {
		frameInterval: 60,
		batchSize: 4,
		maxFrames: null,
		keepIntermediateFiles: false,
		workDir: "./work",
	};

	let outputPath = null;

	for (let i = 2; i < args.length; i++) {
		switch (args[i]) {
			case "--output":
				outputPath = args[++i];
				break;
			case "--frame-interval":
				options.frameInterval = parseInt(args[++i]);
				break;
			case "--batch-size":
				options.batchSize = parseInt(args[++i]);
				break;
			case "--max-frames":
				options.maxFrames = parseInt(args[++i]);
				break;
			case "--keep-files":
				options.keepIntermediateFiles = true;
				break;
			case "--work-dir":
				options.workDir = args[++i];
				break;
		}
	}

	// Validate video exists
	if (!fs.existsSync(videoPath)) {
		console.error(`Error: Video file not found: ${videoPath}`);
		process.exit(1);
	}

	// Create processor and run pipeline
	const processor = new VideoProcessor(options);
	const result = await processor.processVideo(
		videoPath,
		taskDescription,
		outputPath
	);

	// Exit with appropriate code
	process.exit(result.success ? 0 : 1);
}

// Export for use as module
module.exports = { VideoProcessor };

// Run if called directly
if (require.main === module) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
