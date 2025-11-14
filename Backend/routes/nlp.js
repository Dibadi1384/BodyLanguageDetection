const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { analyzeFrame } = require("../frame_analyzer");
require("dotenv").config();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/", async (req, res) => {
	const { text, framePath } = req.body;
	if (!text) return res.status(400).json({ error: "Missing 'text' field" });

	try {
		const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
		const prompt = `Take the following user instruction and rewrite it as a short, clear detection prompt that a video analysis model can understand. Focus on the importance of using bounding boxes to detect people as well as their corresponding emotions. Respond only with the rewritten prompt (no explanation):\n\nUser input: ${text}`;
		const result = await model.generateContent(prompt);
		const detectionPrompt = result.response.text().trim();

		if (framePath) {
			// analyze frame with
			const analysisResult = await analyzeFrame(
				framePath,
				detectionPrompt
			);
			res.json({ improved: detectionPrompt, analysis: analysisResult });
		} else {
			res.json({ improved: detectionPrompt });
		}
	} catch (error) {
		console.error("NLP API error:", error);
		res.status(500).json({ error: "Failed to generate text" });
	}
});

module.exports = router;
