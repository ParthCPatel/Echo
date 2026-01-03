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
  // Translation Support
  language: Annotation,
  englishStructuredNotes: Annotation,
  englishSummary: Annotation,
  englishActionItems: Annotation,
  englishDecisions: Annotation,
  englishTranscript: Annotation, // New field for translated transcript
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
  const isEnglish = state.language === 'en';

  const tools = [
    {
      type: "function",
      function: {
        name: "extract_data",
        description:
          "Extracts decisions/actions with evidence. If language is not English, also provide English translations.",
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
            // Translation Fields
            englishSummary: { type: "string" },
            englishActionItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  owner: { type: "string" },
                  status: { type: "string" }
                }
              }
            },
            englishDecisions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" }
                }
              }
            }
          },
          required: ["decisions", "actionItems", "summary"],
        },
      },
    },
  ];
  const modelWithTools = model.bindTools(tools);
  const systemPrompt = isEnglish
    ? `Extract decisions/actions. MUST include verbatim transcript quotes.`
    : `Extract decisions/actions in the ORIGINAL LANGUAGE (${state.language}). ALSO provide English translations for summary, actions, and decisions in the corresponding 'english*' fields.`;

  const response = await modelWithTools.invoke([
    new SystemMessage(`${systemPrompt}\nTRANSCRIPT: ${transcriptText.slice(0, 50000)}`),
    new HumanMessage(`NOTES: ${state.rawNotes}`),
  ]);
  let result = { decisions: [], actionItems: [], summary: "" };
  let englishResult = { englishDecisions: [], englishActionItems: [], englishSummary: "" };

  if (response.tool_calls && response.tool_calls.length > 0) {
    const args = response.tool_calls[0].args;
    result = {
      decisions: args.decisions || [],
      actionItems: args.actionItems || [],
      summary: args.summary || "",
    };
    // Populate English fields (fallback to original if missing/english)
    englishResult = {
      englishSummary: args.englishSummary || result.summary,
      englishActionItems: args.englishActionItems || result.actionItems,
      englishDecisions: args.englishDecisions || result.decisions
    };
  }

  return {
    ...result,
    ...englishResult
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

const translateNotes = async (state) => {
  // If English or missing, skip translation (just copy)
  if (!state.language || state.language === 'en' || !state.structuredNotes) {
    return { englishStructuredNotes: state.structuredNotes };
  }

  const response = await model.invoke([
    new SystemMessage("You are a professional translator. Translate the following Markdown notes into English. Maintain all formatting, headers, and structure exactly. Output ONLY the translated markdown."),
    new HumanMessage(state.structuredNotes),
  ]);

  return { englishStructuredNotes: response.content.toString() };
};

// --- Translate Transcript Node ---
const translateTranscript = async (state) => {
  // 1. Check if translation is needed
  if (!state.language || state.language === 'en' || !state.transcript || state.transcript.length === 0) {
    return { englishTranscript: state.transcript };
  }

  // 2. Prepare transcript chunks to avoid token limits (Basic chunking for now)
  // For MVP, we'll try to translate the whole thing if it's small.

  const transcriptJSON = JSON.stringify(state.transcript);

  const systemPrompt = `You are a transcript translator.
  You will receive a JSON array of transcript utterances.
  Translate the 'text' (or 'transcript') field of each object into English.
  Do NOT change 'speaker', 'start', 'end', or any other fields.
  Output ONLY the valid JSON array.`;

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(transcriptJSON),
    ]);

    // Clean up code blocks if the model adds them
    let cleanJson = response.content.toString().replace(/```json/g, '').replace(/```/g, '').trim();
    const translatedTranscript = JSON.parse(cleanJson);

    return { englishTranscript: translatedTranscript };
  } catch (e) {
    console.warn("Transcript translation failed:", e);
    // Fallback to original
    return { englishTranscript: state.transcript };
  }
};

// --- Graph ---

const graph = new StateGraph(GraphState)
  .addNode("validate_inputs", validateInputs)
  .addNode("process_notes", processNotes)
  .addNode("translate_notes", translateNotes)
  .addNode("translate_transcript", translateTranscript) // New Node
  .addNode("extract_entities", extractEntities)
  .addNode("verify_grounding", verifyGrounding)
  .addEdge("validate_inputs", "process_notes")
  .addEdge("validate_inputs", "extract_entities")
  .addEdge("validate_inputs", "translate_transcript") // Parallel branch
  .addEdge("process_notes", "translate_notes")
  .addEdge("translate_notes", END)
  .addEdge("translate_transcript", END)
  .addEdge("extract_entities", "verify_grounding")
  .addEdge("verify_grounding", END)
  .setEntryPoint("validate_inputs");

export const enhanceNotesGraph = graph.compile();
