import 'dotenv/config'; // Load env vars BEFORE other imports
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { enhanceNotesGraph } from './brain/graph.js';
import { Session } from './models/Session.js';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/echo";

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- Routes ---

// 1. Get History
app.get('/sessions', async (req, res) => {
    try {
        const sessions = await Session.find().sort({ createdAt: -1 });
        res.json({ success: true, data: sessions });
    } catch (error) {
        console.error("Error fetching sessions:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Get Single Session
app.get('/sessions/:id', async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, error: "Session not found" });
        res.json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Save Session (Called after recording/transcription/enhancement)
app.post('/sessions', async (req, res) => {
    try {
        const { audioPath, transcript, rawNotes, enhancement, language } = req.body;

        // enhancement object contains { summary, structuredNotes, actionItems, decisions, english* }
        const newSession = new Session({
            audioPath,
            rawNotes,
            transcript: transcript || [],
            language: language || "en",

            // Original
            summary: enhancement?.summary || "",
            structuredNotes: enhancement?.structuredNotes || "",
            actionItems: enhancement?.actionItems || [],
            decisions: enhancement?.decisions || [],

            // Translated
            englishSummary: enhancement?.englishSummary || "",
            englishStructuredNotes: enhancement?.englishStructuredNotes || "",
            englishActionItems: enhancement?.englishActionItems || [],
            englishDecisions: enhancement?.englishDecisions || [],
            englishTranscript: enhancement?.englishTranscript || [] // Save translated transcript
        });

        await newSession.save();
        console.log("✅ Session saved:", newSession._id);
        res.json({ success: true, data: newSession });
    } catch (error) {
        console.error("Error saving session:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.post('/enhance', async (req, res) => {
    try {
        const { transcript, rawNotes, language } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: "Missing transcript data" });
        }

        console.log("Received request for enhancement...");
        console.log("Raw Notes:", rawNotes);
        console.log("Language:", language);

        // Invoke the LangGraph
        // Result has { summary, structuredNotes, ..., englishStructuredNotes, englishTranscript, ... }
        const result = await enhanceNotesGraph.invoke({
            rawNotes,
            transcript: transcript || [], // Check for existing transcript or empty
            language: language || "en"
        });

        console.log("LangGraph execution complete.");

        // Save (if this endpoint was responsible for saving, but here it just enhances)
        // We just return it.

        res.json({
            success: true,
            data: { // Wrap in 'data' object to match main.js expectation
                summary: result.summary,
                structuredNotes: result.structuredNotes,
                actionItems: result.actionItems,
                decisions: result.decisions,
                englishSummary: result.englishSummary,
                englishStructuredNotes: result.englishStructuredNotes,
                englishActionItems: result.englishActionItems,
                englishDecisions: result.englishDecisions,
                englishTranscript: result.englishTranscript
            }
        });

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Endpoint: POST http://localhost:${PORT}/enhance`);
    console.log(`Endpoint: GET http://localhost:${PORT}/sessions`);
});
