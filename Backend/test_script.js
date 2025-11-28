const { VideoProcessor } = require("./routes/video_processor");
const path = require("path");
const fs = require("fs");

/**
 * Simple test script for video analysis pipeline
 * Usage: node test_pipeline.js <video_filename> [user_instruction]
 */

async function testVideoPipeline() {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.log(
			"Usage: node test_pipeline.js <video_filename> [user_instruction]"
		);
		console.log("\nExamples:");
		console.log("  node test_pipeline.js 0075.mp4");
		console.log(
			'  node test_pipeline.js video.mp4 "detect when people are smiling"'
		);
		console.log(
			'  node test_pipeline.js test.mp4 "identify confused or happy people"'
		);
		process.exit(1);
	}

	const videoFilename = args[0];
	const userInstruction = args[1] || "Detect people and their emotions";

	const videoPath = path.join(__dirname, "uploads", videoFilename);

	if (!fs.existsSync(videoPath)) {
		console.error(`Error: Video not found at ${videoPath}`);
		console.log("\nMake sure your video is in the uploads/ folder");
		process.exit(1);
	}

	console.log("Starting Video Analysis Pipeline");
	console.log("=".repeat(60));
	console.log(`Video: ${videoFilename}`);
	console.log(`Instruction: "${userInstruction}"`);
	console.log("=".repeat(60));

	const processor = new VideoProcessor({
		frameInterval: 90, // Extract every 90th frame (~3 seconds at 30fps)
		batchSize: 1, // Process 1 frame at a time
		maxFrames: 3, // Only analyze 3 frames for fast testing
		keepIntermediateFiles: true, // Keep files so we can inspect them
		workDir: "./work",
		skipAnnotation: false, // Set to true to skip video creation for even faster testing
	});

	try {
		const startTime = Date.now();

		// Run the complete pipeline
		const result = await processor.processVideo(videoPath, userInstruction);

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		if (result.success) {
			console.log("\nSUCCESS!");
			console.log("=".repeat(60));
			console.log(`Total time: ${duration} seconds`);
			console.log(
				`Frames analyzed: ${result.detections?.total_frames || "N/A"}`
			);
			console.log(
				`Total people detected: ${
					result.detections?.total_people_detected || "N/A"
				}`
			);
			console.log(
				`Annotated video: ${result.annotatedVideoPath || "N/A"}`
			);
			console.log(`Detections JSON: ${result.detectionsPath || "N/A"}`);

			// Show sample detections if available
			if (
				result.detections?.frame_detections &&
				result.detections.frame_detections.length > 0
			) {
				console.log("\nBODY LANGUAGE ANALYSIS:");
				console.log("=".repeat(60));
				result.detections.frame_detections.forEach((frame, idx) => {
					console.log(
						`\nFrame ${frame.frame_index || idx} (${
							frame.people_detected || 0
						} people detected):`
					);
					console.log("-".repeat(60));

					if (frame.people && frame.people.length > 0) {
						frame.people.forEach((person, personIdx) => {
							console.log(`\nPerson ${personIdx + 1}:`);
							if (person.analysis_result) {
								console.log(
									`  Emotion: ${
										person.analysis_result.emotion || "N/A"
									}`
								);
								console.log(
									`  Confidence: ${
										person.analysis_result.confidence ||
										"N/A"
									}`
								);
								if (person.analysis_result.intensity) {
									console.log(
										`  Intensity: ${person.analysis_result.intensity}`
									);
								}
							}
							if (person.visual_description) {
								console.log(
									`  Description: ${person.visual_description}`
								);
							}
							console.log(
								`  Detection Confidence: ${
									person.bbox_confidence || "N/A"
								}`
							);
						});
					} else {
						console.log("(No people detected in this frame)");
					}
					console.log("-".repeat(60));
				});
			}
		} else {
			console.log("\nFAILED");
			console.log("=".repeat(60));
			console.log(`Error: ${result.error}`);
		}
	} catch (error) {
		console.error("\nFatal Error:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

// Run the test
testVideoPipeline().catch((error) => {
	console.error("Unhandled error:", error);
	process.exit(1);
});
