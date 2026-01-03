import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
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

// --- Process Notes (Combined Clarify + Structure) ---

const processNotes = async (state) => {
  const transcriptText = (state.transcript ?? [])
    .map((t) => {
      const start = t.start ?? t.startTime ?? 0;
      const speaker = t.speaker ?? "Unknown";
      const text = t.transcript ?? t.text ?? "";

      return `[${start.toFixed(1)}s - ${speaker}]: ${text}`;
    })
    .join("\n");

  const systemPrompt = `You are an expert editor. Process the RAW NOTES into a clear, structured Markdown document.

RULES:
1. CLARITY & GRAMMAR: Rewrite for professional grammar and clarity.
2. STRUCTURE: Organize into clear sections starting with '## Sections'.
3. ACCURACY: Do not add new facts. Only clarify what is present in the notes.
4. CONTEXT & SPEAKER CORRECTION: Use the TRANSCRIPT to resolve ambiguities. IF a sentence is split between speakers or attributed to the wrong person, CORRECT it by merging or reassigning it to the correct speaker based on the flow.
5. LANGUAGE: Output MUST match the input language (e.g. Hindi -> Hindi).

TRANSCRIPT (Context):
${transcriptText.slice(0, 50000)}...`;

  const inputContent = state.rawNotes || "No notes provided.";

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`RAW NOTES:\n${inputContent}\n\nPROCESSED MARKDOWN:`),
  ]);

  // We populate 'structuredNotes' for the next step (Extraction) and 'clarifiedNotes' for legacy compatibility if needed
  const resultText = response.content.toString();
  return {
    structuredNotes: resultText,
    clarifiedNotes: resultText,
  };
};

// --- Extract Entities ---

const extractEntities = async (state) => {
  const transcriptText = (state.transcript || [])
    .map((t) => {
      const start =
        t.start !== undefined
          ? t.start
          : t.startTime !== undefined
          ? t.startTime
          : 0;
      return `[${Number(start).toFixed(1)}s]: ${t.transcript || t.text}`;
    })
    .join("\n");
  const tools = [
    {
      type: "function",
      function: {
        name: "extract_data",
        description:
          "Extracts decisions/actions with evidence. Output text in the SAME LANGUAGE as the transcript.",
        parameters: {
          type: "object",
          properties: {
            decisions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  evidence_quote: { type: "string" },
                },
                required: ["text", "evidence_quote"],
              },
            },
            actionItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  owner: { type: "string" },
                  evidence_quote: { type: "string" },
                },
                required: ["text", "evidence_quote"],
              },
            },
            summary: { type: "string" },
          },
          required: ["decisions", "actionItems", "summary"],
        },
      },
    },
  ];
  const modelWithTools = model.bindTools(tools);
  const response = await modelWithTools.invoke([
    new SystemMessage(`Extract decisions/actions. MUST include verbatim transcript quotes. Output in the SAME LANGUAGE as the transcript (e.g. Hindi/English).
TRANSCRIPT: ${transcriptText.slice(0, 50000)}`),
    new HumanMessage(`NOTES: ${state.rawNotes}`),
  ]);
  let result = { decisions: [], actionItems: [], summary: "" };
  if (response.tool_calls && response.tool_calls.length > 0) {
    const args = response.tool_calls[0].args;
    result = {
      decisions: args.decisions || [],
      actionItems: args.actionItems || [],
      summary: args.summary || "",
    };
  }
  return {
    decisions: result.decisions || [],
    actionItems: result.actionItems || [],
    summary: result.summary || "",
  };
};

// --- Verify Grounding ---

const verifyGrounding = async (state) => {
  const validDecisions = (state.decisions || []).filter(
    (d) => d.evidence_quote && d.evidence_quote.length > 5
  );
  const validActions = (state.actionItems || []).filter(
    (a) => a.evidence_quote && a.evidence_quote.length > 5
  );
  return { decisions: validDecisions, actionItems: validActions };
};

// --- Graph ---

const graph = new StateGraph(GraphState)
  .addNode("validate_inputs", validateInputs)
  .addNode("process_notes", processNotes)
  .addNode("extract_entities", extractEntities)
  .addNode("verify_grounding", verifyGrounding)
  .addEdge("validate_inputs", "process_notes")
  .addEdge("validate_inputs", "extract_entities")
  .addEdge("process_notes", END)
  .addEdge("extract_entities", "verify_grounding")
  .addEdge("verify_grounding", END)
  .setEntryPoint("validate_inputs");

export const enhanceNotesGraph = graph.compile();
