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
		this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
	}

	/**
	 * Refine task description using Gemini
	 */
	async refineTaskDescription(userInstruction) {
		console.log("\n=== Refining Task with Gemini ===");
		console.log(`User instruction: ${userInstruction}`);

		try {
			const model = this.genAI.getGenerativeModel({
				model: "gemini-2.0-flash",
			});
			const prompt = `Take the following user instruction and rewrite it as a short, clear detection prompt that a video analysis model can understand. Focus on the importance of using bounding boxes to detect people as well as their corresponding emotions. Respond only with the rewritten prompt (no explanation):\n\nUser input: ${userInstruction}`;
			const result = await model.generateContent(prompt);
			const refinedPrompt = result.response.text().trim();

			console.log(`Refined prompt: ${refinedPrompt}`);
			return refinedPrompt;
		} catch (error) {
			console.error(
				"Gemini refinement failed, using original instruction:",
				error.message
			);
			return userInstruction;
		}
	}

	/**
	 * Run a Python script and capture output
	 */
	async runPythonScript(scriptPath, args = []) {
		return new Promise((resolve, reject) => {
			// Use virtual environment Python if it exists
			const venvPython = path.join(
				__dirname,
				"..",
				"venv",
				"bin",
				"python3"
			);
			const pythonCmd = fs.existsSync(venvPython)
				? venvPython
				: "python3";

			const process = spawn(pythonCmd, [scriptPath, ...args]);

			let stdout = "";
			let stderr = "";

			process.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			process.stderr.on("data", (data) => {
				stderr += data.toString();
				console.log(data.toString().trim());
			});

			process.on("close", (code) => {
				if (code !== 0) {
					reject(
						new Error(
							`Python script failed with code ${code}\n${stderr}`
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

		const result = await this.runPythonScript(
			"routes/src/video_extractor.py",
			args
		);

		const manifestPath = path.join(framesDir, "manifest.json");

		if (!fs.existsSync(manifestPath)) {
			throw new Error("Frame extraction failed: manifest.json not found");
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

		console.log(`Extracted ${manifest.saved_count} frames to ${framesDir}`);

		return { manifestPath, framesDir, manifest };
	}

	/**
	 * Step 2: Analyze frames with vision model
	 */
	async analyzeFrames(manifestPath, taskDescription) {
		console.log("\n=== Step 2: Analyzing Frames ===");
		console.log(`Task: ${taskDescription}`);

		const args = [manifestPath, taskDescription, this.batchSize.toString()];

		const result = await this.runPythonScript(
			"routes/src/frame_analyzer.py",
			args
		);

		// The script outputs the detections path as the last line
		const detectionsPath = result.stdout.split("\n").pop();

		if (!fs.existsSync(detectionsPath)) {
			throw new Error("Frame analysis failed: detections.json not found");
		}

		const detections = JSON.parse(fs.readFileSync(detectionsPath, "utf8"));

		console.log(
			`✓ Analyzed ${
				detections.frame_detections.length
			} frames, detected ${detections.frame_detections.reduce(
				(sum, f) => sum + f.people_detected,
				0
			)} people total`
		);

		return { detectionsPath, detections };
	}

	/**
	 * Step 3: Create annotated video
	 */
	async annotateVideo(videoPath, detectionsPath, outputPath = null) {
		console.log("\n=== Step 3: Creating Annotated Video ===");

		// If no output path specified, save to work directory (not frames directory)
		if (!outputPath) {
			const videoStem = path.basename(videoPath, path.extname(videoPath));
			outputPath = path.join(this.workDir, `${videoStem}_annotated.mp4`);
		}

		const args = [videoPath, detectionsPath, outputPath];

		const result = await this.runPythonScript(
			"routes/src/video_annotator.py",
			args
		);

		// The script outputs the annotated video path as the last line
		const annotatedVideoPath = result.stdout.split("\n").pop();

		if (!fs.existsSync(annotatedVideoPath)) {
			throw new Error("Video annotation failed: output video not found");
		}

		const stats = fs.statSync(annotatedVideoPath);
		console.log(
			`Created annotated video: ${annotatedVideoPath} (${(
				stats.size /
				1024 /
				1024
			).toFixed(2)} MB)`
		);

		return annotatedVideoPath;
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
	async processVideo(videoPath, taskDescription, outputPath = null) {
		console.log("=".repeat(60));
		console.log("VIDEO PROCESSING PIPELINE");
		console.log("=".repeat(60));
		console.log(`Video: ${videoPath}`);
		console.log(`Original Task: ${taskDescription}`);
		console.log(`Frame Interval: ${this.frameInterval}`);
		console.log(`Batch Size: ${this.batchSize}`);
		console.log("=".repeat(60));

		try {
			const refinedTask = await this.refineTaskDescription(
				taskDescription
			);

			// Step 1: Extract frames
			const { manifestPath, framesDir, manifest } =
				await this.extractFrames(videoPath);

			// Step 2: Analyze frames with refined task
			const { detectionsPath, detections } = await this.analyzeFrames(
				manifestPath,
				refinedTask
			);

			// Step 3: Annotate video
			const annotatedVideoPath = await this.annotateVideo(
				videoPath,
				detectionsPath,
				outputPath
			);

			// Cleanup
			this.cleanup(framesDir);

			console.log("\n" + "=".repeat(60));
			console.log("PROCESSING COMPLETE");
			console.log("=".repeat(60));
			console.log(`Original Task: ${taskDescription}`);
			console.log(`Refined Task: ${refinedTask}`);
			console.log(`Annotated Video: ${annotatedVideoPath}`);
			console.log(`Detections JSON: ${detectionsPath}`);

			return {
				success: true,
				annotatedVideoPath,
				detectionsPath,
				detections,
				videoInfo: manifest,
				originalTask: taskDescription,
				refinedTask: refinedTask,
			};
		} catch (error) {
			console.error("\n" + "=".repeat(60));
			console.error("ERROR");
			console.error("=".repeat(60));
			console.error(error.message);

			return {
				success: false,
				error: error.message,
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
