
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";



const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",
    temperature: 0,
});


// --- State ---

const GraphState = Annotation.Root({
    rawNotes: Annotation,
    transcript: Annotation,
    clarifiedNotes: Annotation,
    structuredNotes: Annotation,
    summary: Annotation,
    actionItems: Annotation,
    decisions: Annotation,
    validationErrors: Annotation,
    retryCount: Annotation,
});


// --- Nodes ---

// --- Validate Inputs ---

const validateInputs = async (state) => {
    const { rawNotes, transcript } = state;
    if (!rawNotes || rawNotes.trim().length === 0) {
        return { validationErrors: ["Raw notes cannot be empty"] };
    }
    if (!transcript || !Array.isArray(transcript)) {
        return { validationErrors: ["Invalid transcript format"] };
    }
    return { validationErrors: [] };
};


// --- Clarify Notes ---

const clarifyNotes = async (state) => {
    const transcriptText = (state.transcript || [])
        .map((t) => {
            const start = t.start !== undefined ? t.start : (t.startTime !== undefined ? t.startTime : 0);
            return `[${Number(start).toFixed(1)}s - ${t.speaker || 'Unknown'}]: ${t.transcript || t.text}`;
        })
        .join("\n");
    const systemPrompt = `You are a sub-editor. Rewrite for grammar/clarity.
RULES:
1. ONLY clarify what is written.
2. NO new facts.
3. Use TRANSCRIPT for context.

TRANSCRIPT:
${transcriptText.slice(0, 50000)}...`;
    const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`RAW NOTES:\n${state.rawNotes}\n\nCLARIFIED:`)
    ]);
    return { clarifiedNotes: response.content.toString() };
};


// --- Structure Notes ---

const structureNotes = async (state) => {
    const response = await model.invoke([
        new SystemMessage(`Structure into Markdown (## Sections). Preserve content.`),
        new HumanMessage(state.clarifiedNotes || state.rawNotes)
    ]);
    return { structuredNotes: response.content.toString() };
};


// --- Extract Entities ---

const extractEntities = async (state) => {
    const transcriptText = (state.transcript || [])
        .map((t) => {
            const start = t.start !== undefined ? t.start : (t.startTime !== undefined ? t.startTime : 0);
            return `[${Number(start).toFixed(1)}s]: ${t.transcript || t.text}`;
        })
        .join("\n");
    const tools = [{
            type: "function",
            function: {
                name: "extract_data",
                description: "Extracts decisions/actions with evidence.",
                parameters: {
                    type: "object",
                    properties: {
                        decisions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, evidence_quote: { type: "string" } }, required: ["text", "evidence_quote"] } },
                        actionItems: { type: "array", items: { type: "object", properties: { text: { type: "string" }, owner: { type: "string" }, evidence_quote: { type: "string" } }, required: ["text", "evidence_quote"] } },
                        summary: { type: "string" }
                    },
                    required: ["decisions", "actionItems", "summary"]
                }
            }
        }];
    const modelWithTools = model.bindTools(tools);
    const response = await modelWithTools.invoke([
        new SystemMessage(`Extract decisions/actions. MUST include verbatim transcript quotes.
TRANSCRIPT: ${transcriptText.slice(0, 50000)}`),
        new HumanMessage(`NOTES: ${state.structuredNotes}`)
    ]);
    let result = { decisions: [], actionItems: [], summary: "" };
    if (response.tool_calls && response.tool_calls.length > 0) {
        const args = response.tool_calls[0].args;
        result = {
            decisions: args.decisions || [],
            actionItems: args.actionItems || [],
            summary: args.summary || ""
        };
    }
    return {
        decisions: result.decisions || [],
        actionItems: result.actionItems || [],
        summary: result.summary || ""
    };
};



// --- Verify Grounding ---

const verifyGrounding = async (state) => {
    const validDecisions = (state.decisions || []).filter((d) => d.evidence_quote && d.evidence_quote.length > 5);
    const validActions = (state.actionItems || []).filter((a) => a.evidence_quote && a.evidence_quote.length > 5);
    return { decisions: validDecisions, actionItems: validActions };
};


// --- Graph ---

const graph = new StateGraph(GraphState)
    .addNode("validate_inputs", validateInputs)
    .addNode("clarify_notes", clarifyNotes)
    .addNode("structure_notes", structureNotes)
    .addNode("extract_entities", extractEntities)
    .addNode("verify_grounding", verifyGrounding)
    .addEdge("validate_inputs", "clarify_notes")
    .addEdge("clarify_notes", "structure_notes")
    .addEdge("structure_notes", "extract_entities")
    .addEdge("extract_entities", "verify_grounding")
    .addEdge("verify_grounding", END)
    .setEntryPoint("validate_inputs");

export const enhanceNotesGraph = graph.compile();
