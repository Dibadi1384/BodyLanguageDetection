const { HfInference } = require("@huggingface/inference");
const { Blob } = require("buffer");
require("dotenv").config();

const client = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function analyzeFrame(framePath, detectionPrompt) {
	try {
		const fs = require("fs");
		const path = require("path");
		const imageBuffer = fs.readFileSync(framePath);
		const imageBlob = new Blob([imageBuffer]);

		const response = await client.chatCompletion({
			model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: detectionPrompt },
						{ type: "image", image: imageBlob },
					],
				},
			],
			temperature: 0.1,
			max_tokens: 200,
			top_p: 0.9,
		});

		return {
			frame: path.basename(framePath),
			result: response.choices[0].message.content[0]?.text ?? null,
			success: true,
		};
	} catch (error) {
		return {
			frame: require("path").basename(framePath),
			error: error.message,
			success: false,
		};
	}
}

module.exports = { analyzeFrame };
