const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function testConnection() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    const filePath = "test_app.wav";
    
    if (!apiKey) {
        console.error("API Key missing!");
        return;
    }

    try {
        console.log(`Reading ${filePath}...`);
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`File size: ${fileBuffer.length} bytes`);

        console.log("Sending request to Deepgram...");
        const response = await axios.post(
            "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true",
            fileBuffer,
            {
                headers: {
                    "Authorization": `Token ${apiKey}`,
                    "Content-Type": "audio/wav"
                },
                timeout: 30000 // 30s timeout
            }
        );
        console.log("Success! Status:", response.status);
        console.log("Data:", JSON.stringify(response.data, null, 2).substring(0, 200) + "...");
    } catch (error) {
        console.error("Error:", error.message);
        if (error.code) console.error("Code:", error.code);
        if (error.response) console.error("Response:", error.response.status, error.response.data);
    }
}

testConnection();
