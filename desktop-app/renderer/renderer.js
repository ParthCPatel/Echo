const modeElement = document.getElementById("mode");
const indicatorElement = document.getElementById("indicator");

async function updateStatus() {
  try {
    const mode = await window.audioAPI.getMode();
    
    // Update text
    modeElement.innerText = mode;
    
    // Update indicator color based on content
    indicatorElement.className = "indicator"; // reset
    if (mode.includes("USB")) {
        indicatorElement.classList.add("active");
    } else if (mode.includes("Internal")) {
        indicatorElement.classList.add("no-mic"); // Use orange/warning for internal
    } else {
        indicatorElement.classList.add("system-only");
    }
    
  } catch (error) {
    console.error("Failed to get audio mode:", error);
    modeElement.innerText = "Error checking status";
  }
}

// Initial check
updateStatus();

// Poll every 3 seconds to detect changes (plugging in headphones)
setInterval(updateStatus, 3000);

// --- Recorder Controls ---
// --- Recorder Controls ---
const btnRecordToggle = document.getElementById("btn-record-toggle");
const btnPlay = document.getElementById("btn-play");

// Recording State
let isRecording = false;

const btnTranscribe = document.getElementById("btn-transcribe");
// const transcriptContainer = document.getElementById("transcript-container"); // REMOVED
/* const transcriptText = document.getElementById("transcript-text"); // Removed from HTML */
const chatBox = document.getElementById("chat-box");
const btnDownload = document.getElementById("btn-download");

// Global State for Results
let currentResults = null;
let currentRawNotes = ""; // Store raw notes
let currentView = "home";

// View Switcher Logic
window.switchView = function(viewId) {
    // Hide all views
    document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));
    
    // Show selected view
    document.getElementById(`view-${viewId}`).classList.add("active");
    if (document.getElementById(`nav-${viewId}`)) {
        document.getElementById(`nav-${viewId}`).classList.add("active");
    }
    
    currentView = viewId;
    updateDownloadButton();
};

function updateDownloadButton() {
    if (!currentResults && !currentRawNotes) {
        btnDownload.classList.add("hidden");
        return;
    }

    // Determine content based on view
    let show = false;
    btnDownload.onclick = null; // Clear previous listener

    if (currentView === "raw-notes") {
        show = !!currentRawNotes;
        btnDownload.onclick = () => downloadTextFile("raw_notes.txt", "Raw Session Notes", currentRawNotes);
    } else if (currentView === "enhanced") {
        show = true;
        btnDownload.onclick = () => downloadTextFile("enhanced_notes.txt", "Enhanced Notes", cleanMarkdown(currentResults.structuredNotes));
    } else if (currentView === "summary") {
        show = true;
        btnDownload.onclick = () => downloadTextFile("summary.txt", "Session Summary", cleanMarkdown(currentResults.summary));
    } else if (currentView === "decisions") {
        show = true;
        btnDownload.onclick = () => {
             const content = currentResults.decisions.length > 0 ? currentResults.decisions.map(d => `• ${d.text}`).join("\n") : "No decisions.";
             downloadTextFile("decisions.txt", "Key Decisions", cleanMarkdown(content));
        };
    } else if (currentView === "actions") {
        show = true;
        btnDownload.onclick = () => {
             const content = currentResults.actionItems.length > 0 ? currentResults.actionItems.map(a => `• ${a.text} (Owner: ${a.owner || "Unassigned"})`).join("\n") : "No actions.";
             downloadTextFile("action_items.txt", "Action Items", cleanMarkdown(content));
        };
    }

    if (show) btnDownload.classList.remove("hidden");
    else btnDownload.classList.add("hidden");
}

/* Initialize Home View */
switchView("home");


btnRecordToggle.addEventListener("click", async () => {
  if (!isRecording) {
      // Start Recording
      const success = await window.recorderAPI.start();
      if (success) {
        isRecording = true;
        updateRecordingState(true);
        // transcriptContainer.style.display = "none"; // If we had it
      }
  } else {
      // Stop Recording
      const success = await window.recorderAPI.stop();
      if (success) {
        isRecording = false;
        updateButtons(false); // Enable Play/Transcribe
        updateRecordingState(false);
      }
  }
});

function updateRecordingState(recording) {
    if (recording) {
        btnRecordToggle.innerText = "End Recording";
        btnRecordToggle.classList.remove("primary");
        btnRecordToggle.classList.add("danger");
        
        btnPlay.disabled = true;
        btnTranscribe.disabled = true;
        // Navigation Disabled during recording? Maybe not strictly necessary but cleaner
    } else {
        btnRecordToggle.innerText = "Start Recording";
        btnRecordToggle.classList.remove("danger");
        btnRecordToggle.classList.add("primary");
        
        btnPlay.disabled = false;
        btnTranscribe.disabled = false;
    }
}

btnPlay.addEventListener("click", async () => {
  await window.recorderAPI.play();
});

// ... (listeners)

// --- Rich Text Editor Logic ---
window.formatDoc = function(cmd, value = null) {
    if (value) {
        document.execCommand(cmd, false, value);
    } else {
        document.execCommand(cmd);
    }
    // Keep focus
    document.getElementById("notes-input").focus();
};

btnTranscribe.addEventListener("click", async () => {
  // Switch to transcript view to show progress
  switchView("transcript");
  enableNavButtons(false); // Disable nav until done

  chatBox.innerHTML = "<div style='padding:20px; text-align:center'>Transcribing and Analyzing...</div>";
  btnTranscribe.disabled = true;

  // Grab text from the contenteditable div (innerText gives us clean text for analysis)
  const notesDiv = document.getElementById("notes-input");
  const notes = notesDiv.innerText; 
  currentRawNotes = notes; // Save for display
  
  const result = await window.recorderAPI.transcribe(notes);
  
  if (result.success) {
    console.log("Deepgram Result:", result.data);
    chatBox.innerHTML = ""; // Clear loader
    
    // 1. Render Chat (Transcript)
    if (result.data.type === "diarization") {
        renderChat(result.data.content);
    } else {
        renderMessage(result.data.content, "right"); 
    }

    // 2. Handle AI Enhancement
    if (result.enhancement) {
        currentResults = result.enhancement;
        
        // Populate Views
        document.getElementById("content-raw-notes").innerText = currentRawNotes || "No raw notes taken.";
        
        // Use markdown parser for rich text fields
        document.getElementById("content-enhanced").innerHTML = window.utilsAPI.renderMarkdown(currentResults.structuredNotes || "No notes generated.");
        document.getElementById("content-summary").innerHTML = window.utilsAPI.renderMarkdown(currentResults.summary || "No summary available.");
        
        // Decisions List
        const decisionsHtml = currentResults.decisions.length > 0 
            ? currentResults.decisions.map(d => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px;"><strong>${d.text}</strong><div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">"${d.evidence_quote}"</div></div>`).join("")
            : "<p style='color:#666'>No key decisions detected.</p>";
        document.getElementById("content-decisions").innerHTML = decisionsHtml;

        // Actions List
        const actionsHtml = currentResults.actionItems.length > 0
            ? currentResults.actionItems.map(a => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px; border-left: 3px solid #22c55e;"><strong>${a.text}</strong><div style="font-size:0.85em; color:#22c55e;">Owner: ${a.owner || "Unassigned"}</div></div>`).join("")
            : "<p style='color:#666'>No action items detected.</p>";
        document.getElementById("content-actions").innerHTML = actionsHtml;

        // Enable Navigation
        enableNavButtons(true);
        
        // Switch to Enhanced Notes automatically to wow user
        switchView("enhanced");
    }

  } else {
    chatBox.innerHTML = `<p style="color:red; padding:20px;">Error: ${result.error}</p>`;
  }
  btnTranscribe.disabled = false;
});

function enableNavButtons(enable) {
    const ids = ["nav-transcript", "nav-raw-notes", "nav-enhanced", "nav-summary", "nav-decisions", "nav-actions"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (enable) {
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    });
}


function renderChat(utterances) {
    utterances.forEach(u => {
        // Heuristic: Speaker 0 is usually the first one or system. 
        // Speaker 1 is usually the second one or user.
        // We will map Speaker 0 -> Left, Speaker 1 -> Right
        const side = u.speaker === 0 ? "left" : "right";
        const label = side === "left" ? "System / Speaker 0" : "Me / Speaker 1";
        renderMessage(u.transcript, side, label);
    });
}

function renderMessage(text, side, label) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble message-${side}`;
    
    if (label) {
        const lbl = document.createElement("div");
        lbl.className = "speaker-label";
        lbl.innerText = label;
        bubble.appendChild(lbl);
    }
    
    const txt = document.createElement("div");
    txt.innerText = text;
    bubble.appendChild(txt);
    
    chatBox.appendChild(bubble);
    // Scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateButtons(isRecording) {
  // Maintained for compatibility if called elsewhere, but logic moved to updateRecordingState mostly
  // If meant to enable/disable transcribe/play:
  btnPlay.disabled = isRecording;
  btnTranscribe.disabled = isRecording;
}


function downloadTextFile(filename, title, content) {
    const fullText = `${title}\n\n${content}`;
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Append to body to ensure visibility (required in some browsers)
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function cleanMarkdown(text) {
    if (!text) return "";
    return text
        // Remove headers (e.g. ## Header -> Header)
        .replace(/^#+\s+/gm, '') 
        // Remove bold (**text** -> text)
        .replace(/\*\*(.*?)\*\*/g, '')
        .replace(/__(.*?)__/g, '')
        // Remove italic (*text* -> text) - careful with lists
        .replace(/(\*|_)(.*?)\1/g, '')
        // Remove links ([text](url) -> text)
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '')
        // Remove blockquotes (> text -> text)
        .replace(/^>\s+/gm, '')
        // Remove code ticks
        .replace(/`/g, '');
}
