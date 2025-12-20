const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { analyzeFrame } = require("../frame_analyzer");
require("dotenv").config();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/", async (req, res) => {
	const { text, framePath } = req.body;
	console.log("[NLP DEBUG] Received request to refine prompt");
	console.log("[NLP DEBUG] User input text:", text);
	
	if (!text) return res.status(400).json({ error: "Missing 'text' field" });

	try {
		console.log("[NLP DEBUG] Calling Gemini to refine prompt...");
		const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
		const prompt = `Take the following user instruction and rewrite it as a short, clear detection prompt that a video analysis model can understand. Focus on the importance of using bounding boxes to detect people as well as their corresponding emotions. Respond only with the rewritten prompt (no explanation):\n\nUser input: ${text}`;
		const result = await model.generateContent(prompt);
		const detectionPrompt = result.response.text().trim();
		console.log("[NLP DEBUG] Refined prompt received from Gemini:", detectionPrompt);

		if (framePath) {
			console.log("[NLP DEBUG] Frame path provided, analyzing frame...");
			// analyze frame with
			const analysisResult = await analyzeFrame(
				framePath,
				detectionPrompt
			);
			console.log("[NLP DEBUG] Frame analysis complete");
			res.json({ improved: detectionPrompt, analysis: analysisResult });
		} else {
			console.log("[NLP DEBUG] No frame path, returning refined prompt only");
			res.json({ improved: detectionPrompt });
		}
		console.log("[NLP DEBUG] Request completed successfully");
	} catch (error) {
		console.error("[NLP ERROR] Failed to refine prompt:", error);
		res.status(500).json({ error: "Failed to generate text" });
	}
});

module.exports = router;
