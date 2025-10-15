const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' field" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Take the following user instruction and rewrite it as a short, clear detection prompt that a video analysis model can understand. Respond only with the rewritten prompt (no explanation):\n\nUser input: ${text}`;
    const result = await model.generateContent(prompt);
    const output = (result.response && typeof result.response.text === 'function')
      ? result.response.text()
      : String(result);

    res.json({ improved: output.trim() });
  } catch (error) {
    console.error("NLP API error:", error);
    res.status(500).json({ error: "Failed to generate text" });
  }
});

module.exports = router;
