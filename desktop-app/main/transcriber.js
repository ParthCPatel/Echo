const fs = require("fs");
const axios = require("axios");
const path = require("path");
const { app } = require("electron");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function transcribeFile(filePath, language = "auto") {
    // Default to last recording if filePath is null, but we usually should pass it or handle currentRecordingPath logic in main
    // For now we assume the flow uses the default test_app.wav OR the main.js should have passed the correct path.
    // BUT we didn't update main.js to pass the currentRecordingPath to transcribeFile. main.js calls transcribeFile(null, language).
    // Let's stick to the current logic where it defaults to test_app.wav or we must fix main.js to use recorder.getRecordingStatus().lastFilePath
    // Wait, let's just use the logic as is for the path, but fix the URL.

    const { getRecordingStatus } = require("./recorder");
    const status = getRecordingStatus();
    const fileToTranscribe = filePath || status.lastFilePath || path.join(app.getPath("userData"), "test_app.wav");

    if (!fs.existsSync(fileToTranscribe)) {
        throw new Error(`File not found: ${fileToTranscribe}`);
    }

    // HARDCODED FOR PRODUCTION BUILD
    const apiKey = "622eced7b80a70bba9d33b3a57fe8466d7321e20";

    console.log(`Transcribing file: ${fileToTranscribe} with language: ${language}`);

    // Construct URL
    let deepgramUrl = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true";

    if (language === "auto") {
        deepgramUrl += "&detect_language=true";
    } else if (language) {
        deepgramUrl += `&language=${language}`;
    }

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
                deepgramUrl,
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

            // Extract detected language
            const detectedLanguage = result?.channels[0]?.alternatives[0]?.detected_language ||
                result?.channels[0]?.detected_language ||
                language;

            // If utterances exist, return them. Otherwise fallback to plain transcript.
            if (result && result.utterances) {
                return { type: "diarization", content: result.utterances, language: detectedLanguage };
            }

            const transcript = result?.channels[0]?.alternatives[0]?.transcript;
            return { type: "text", content: transcript || "No transcription available.", language: detectedLanguage };

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
