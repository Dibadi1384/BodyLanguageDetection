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
    const prompt = `Take the input "${text}" and rewrite it as a short question that uses the word naturally.
    Respond **only** with the rewritten sentence, nothing else.`;
    const result = await model.generateContent(prompt);
    const output = result.response.text();
    res.json({ improved: output });
  } catch (error) {
    console.error("NLP API error:", error);
    res.status(500).json({ error: "Failed to generate text" });
  }
});

module.exports = router;
