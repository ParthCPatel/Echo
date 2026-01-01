import 'dotenv/config'; // Load env vars BEFORE other imports
import express from 'express';
import cors from 'cors';
import { enhanceNotesGraph } from './brain/graph.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large transcripts

app.post('/enhance', async (req, res) => {
    try {
        const { transcript, rawNotes } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: "Missing transcript data" });
        }

        console.log("Received request for enhancement...");
        console.log("Raw Notes:", rawNotes);
        console.log("Transcript items:", transcript.length);

        // Invoke the LangGraph
        const result = await enhanceNotesGraph.invoke({
            transcript: transcript,
            rawNotes: rawNotes || ""
        });

        console.log("LangGraph execution complete.");
        
        // Extract relevant outputs
        const responseData = {
            summary: result.summary,
            actionItems: result.actionItems,
            decisions: result.decisions,
            structuredNotes: result.structuredNotes
        };

        res.json({ success: true, data: responseData });

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Endpoint: POST http://localhost:${PORT}/enhance`);
});
