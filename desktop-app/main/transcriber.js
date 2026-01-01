const fs = require("fs");
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function transcribeFile(filePath) {
    // If no path provided, default to test_app.wav in current directory
    const fileToTranscribe = filePath || "test_app.wav";

    if (!fs.existsSync(fileToTranscribe)) {
        throw new Error(`File not found: ${fileToTranscribe}`);
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        throw new Error("DEEPGRAM_API_KEY is not set in .env file");
    }

    console.log(`Transcribing file: ${fileToTranscribe}`);
    
    // Read file once before retries
    const fileBuffer = fs.readFileSync(fileToTranscribe);
    console.log(`Read file size: ${fileBuffer.length} bytes`);

    // Retry logic
    const MAX_RETRIES = 3;
    let attempt = 0;
    
    while (attempt < MAX_RETRIES) {
        attempt++;
        try {
            console.log(`Attempting transcription ${attempt}/${MAX_RETRIES}...`);
            const response = await axios.post(
                "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true",
                fileBuffer,
                {
                    headers: {
                        "Authorization": `Token ${apiKey}`,
                        "Content-Type": "audio/wav"
                    },
                    timeout: 60000 // 60 seconds timeout
                }
            );

            // Return the full result so the renderer can process utterances for diarization
            const result = response.data.results;
            
            // If utterances exist, return them. Otherwise fallback to plain transcript.
            if (result && result.utterances) {
                 return { type: "diarization", content: result.utterances };
            }

            const transcript = result?.channels[0]?.alternatives[0]?.transcript;
            return { type: "text", content: transcript || "No transcription available." };

        } catch (error) {
            console.error(`Deepgram attempt ${attempt} failed:`, error.message);
            
            const isRetryable = 
                error.code === 'ETIMEDOUT' || 
                error.code === 'ECONNRESET' ||
                (error.response && error.response.status >= 500);

            if (isRetryable && attempt < MAX_RETRIES) {
                console.log("Retrying in 2 seconds...");
                await new Promise(res => setTimeout(res, 2000));
                continue;
            }

            // If not retryable or max retries reached, throw
            console.error("Deepgram Error Details:", error.response ? error.response.data : error.message);
            throw new Error(`Failed to transcribe audio after ${attempt} attempts.`);
        }
    }


}

module.exports = { transcribeFile };
