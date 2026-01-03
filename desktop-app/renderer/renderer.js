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
window.switchView = function (viewId) {
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

    // Auto-focus editor if switching to Home
    if (viewId === 'home') {
        const editor = document.getElementById("notes-input");
        if (editor) setTimeout(() => editor.focus(), 50);
    } else if (viewId === 'history') {
        loadHistory();
    }
};

// --- History Logic ---
async function loadHistory() {
    const listContainer = document.getElementById("history-list");
    listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Loading history...</p>';

    try {
        const result = await window.historyAPI.fetchSessions();
        if (result && result.success && result.data.length > 0) {
            listContainer.innerHTML = ""; // Clear loader
            result.data.forEach(session => {
                const date = new Date(session.createdAt);

                const item = document.createElement("div");
                item.className = "history-item";
                item.onclick = () => loadSessionIntoView(session);

                const header = document.createElement("div");
                header.className = "history-header";
                header.innerHTML = `
                    <div class="history-date">${date.toLocaleDateString()}</div>
                    <div class="history-time">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                `;

                const preview = document.createElement("div");
                preview.className = "history-preview";
                // Show summary if exists, else first part of notes/transcript
                preview.innerText = session.summary || session.rawNotes || "No summary available.";

                item.appendChild(header);
                item.appendChild(preview);
                listContainer.appendChild(item);
            });
        } else {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">No history found.</p>';
        }
    } catch (err) {
        console.error("Failed to load history:", err);
        listContainer.innerHTML = '<p style="color:var(--danger); text-align:center; padding:20px;">Failed to load history.</p>';
    }
}

// Global State for Session
let sessionDataGlobal = null;
let isTranslated = false;

function loadSessionIntoView(session) {
    console.log("Loading session:", session);
    sessionDataGlobal = session;
    isTranslated = false; // Reset to original language by default

    // Update Global Audio Path
    currentSessionAudioPath = session.audioPath;

    // Render Raw Notes (Fixed)
    document.getElementById("content-raw-notes").innerText = session.rawNotes || "No raw notes.";

    // Render Transcript (Fixed)
    renderTranscriptView(session);

    // Render Enhanced Content (Variable)
    renderSessionContent();

    // Enable Nav Buttons
    enableNavButtons(true);

    // Show Enhanced View
    switchView("enhanced");
}

function renderTranscriptView(session) {
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = "";

    const transcriptData = session.transcript;
    if (Array.isArray(transcriptData)) {
        renderChat(transcriptData);
    } else if (transcriptData && transcriptData.content) {
        if (transcriptData.type === "diarization" && Array.isArray(transcriptData.content)) {
            renderChat(transcriptData.content);
        } else {
            renderMessage(transcriptData.content, "right");
        }
    } else {
        renderMessage("No transcript data available.", "left");
    }
}

function toggleTranslation() {
    isTranslated = !isTranslated;
    renderSessionContent();
    updateToggleUI();
}

function updateToggleUI() {
    const btn = document.getElementById("btn-translate-toggle");
    if (btn) {
        btn.innerHTML = isTranslated ? "🌐 Show Original" : "🇬🇧 Translate to English";
        btn.classList.toggle("active", isTranslated);
    }
}

function renderSessionContent() {
    const session = sessionDataGlobal;
    if (!session) return;

    // Check if translation is available
    const hasTranslation = session.language && session.language !== 'en' && session.englishStructuredNotes;

    // Inject Toggle Button into Headers if needed
    document.querySelectorAll('.notes-header').forEach(header => {
        // Remove existing toggle if any
        const existing = header.querySelector('#btn-translate-toggle');
        if (existing) existing.remove();

        if (hasTranslation) {
            const btn = document.createElement("button");
            btn.id = "btn-translate-toggle";
            btn.className = "btn secondary small";
            btn.style.marginLeft = "auto";
            btn.innerText = isTranslated ? "🌐 Show Original" : "🇬🇧 Translate to English";
            btn.onclick = toggleTranslation;
            header.appendChild(btn);
        }
    });

    // Prepare Data Source
    const data = (isTranslated && hasTranslation) ? {
        summary: session.englishSummary || session.summary, // Fallback
        structuredNotes: session.englishStructuredNotes || session.structuredNotes,
        actionItems: session.englishActionItems || session.actionItems,
        decisions: session.englishDecisions || session.decisions
    } : {
        summary: session.summary,
        structuredNotes: session.structuredNotes,
        actionItems: session.actionItems,
        decisions: session.decisions
    };

    // Render Views
    document.getElementById("content-enhanced").innerHTML = parseMarkdown(data.structuredNotes || "No notes generated.");
    document.getElementById("content-summary").innerHTML = parseMarkdown(data.summary || "No summary available.");

    const decisionsHtml = data.decisions && data.decisions.length > 0
        ? data.decisions.map(d => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px;"><strong>${d.text}</strong>${d.evidence_quote ? `<div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">"${d.evidence_quote}"</div>` : ''}</div>`).join("")
        : "<p style='color:#666'>No key decisions detected.</p>";
    document.getElementById("content-decisions").innerHTML = decisionsHtml;

    const actionsHtml = data.actionItems && data.actionItems.length > 0
        ? data.actionItems.map(a => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px; display:flex; justify-content:space-between;"><span><strong>${a.text}</strong></span><span style="color:#00d9ff; font-size:0.9em;">${a.owner || 'Unassigned'}</span></div>`).join("")
        : "<p style='color:#666'>No action items detected.</p>";
    document.getElementById("content-actions").innerHTML = actionsHtml;
}



// Global recording path to track current session file
let currentSessionAudioPath = null;

function updateRecordingState(recording) {
    if (recording) {
        btnRecordToggle.innerText = "End Recording";
        btnRecordToggle.classList.remove("primary");
        btnRecordToggle.classList.add("danger");

        btnPlay.disabled = true;
        btnTranscribe.disabled = true;
    } else {
        btnRecordToggle.innerText = "Start Recording";
        btnRecordToggle.classList.remove("danger");
        btnRecordToggle.classList.add("primary");

        btnPlay.disabled = false;
        btnTranscribe.disabled = false;
    }
}

btnRecordToggle.addEventListener("click", async () => {
    if (!isRecording) {
        // Start Recording
        const success = await window.recorderAPI.start();
        if (success) {
            isRecording = true;
            updateRecordingState(true);
        }
    } else {
        // Stop Recording
        const result = await window.recorderAPI.stop(); // Now returns { success, filePath }
        if (result && result.success) {
            isRecording = false;
            currentSessionAudioPath = result.filePath; // Store path
            console.log("Recording saved to:", currentSessionAudioPath);

            updateButtons(false);
            updateRecordingState(false);
        }
    }
});

btnPlay.addEventListener("click", async () => {
    console.log("Play button clicked. Playing:", currentSessionAudioPath);
    await window.recorderAPI.play(currentSessionAudioPath);
});

btnTranscribe.addEventListener("click", async () => {
    try {
        console.log("Transcribe button clicked");
        // Switch to transcript view to show progress
        switchView("transcript");
        enableNavButtons(false); // Disable nav until done

        chatBox.innerHTML = "<div style='padding:20px; text-align:center'>Transcribing and Analyzing...</div>";
        btnTranscribe.disabled = true;

        // Grab text from the contenteditable div (innerText gives us clean text for analysis)
        const notesDiv = document.getElementById("notes-input");
        const notes = notesDiv ? notesDiv.innerText : "";
        currentRawNotes = notes; // Save for display

        const langEl = document.getElementById("language-select");
        const language = langEl ? langEl.value : "auto";
        console.log(`Requesting transcription in language: ${language}`);

        // Clear previous results to avoid confusion if this fails
        currentResults = null;
        document.getElementById("content-enhanced").innerHTML = "";
        document.getElementById("content-summary").innerHTML = "";
        document.getElementById("content-decisions").innerHTML = "";
        document.getElementById("content-actions").innerHTML = "";

        const result = await window.recorderAPI.transcribe(notes, language);


        if (result.success) {
            console.log("Deepgram Result:", result.data);
            chatBox.innerHTML = ""; // Clear loader

            // 1. Render Chat
            if (result.data.type === "diarization") {
                renderChat(result.data.content);
            } else {
                renderMessage(result.data.content, "right");
            }

            enableNavButtons(true);

            // 2. Handle AI Enhancement & SAVE SESSION
            if (result.enhancement) {
                currentResults = result.enhancement;

                // Populate Views locally
                document.getElementById("content-raw-notes").innerText = currentRawNotes || "No raw notes taken.";
                // ... (Rendering logic reused in loadSessionIntoView, but repeated here for immediate view)
                // Ideally we refactor rendering, but for now:
                document.getElementById("content-enhanced").innerHTML = parseMarkdown(currentResults.structuredNotes);
                document.getElementById("content-summary").innerHTML = parseMarkdown(currentResults.summary);

                // Save to History Backend
                const sessionData = {
                    audioPath: currentSessionAudioPath,
                    transcript: result.data, // Should be the full object or content
                    rawNotes: currentRawNotes,
                    enhancement: currentResults
                };

                console.log("Saving session...", sessionData);
                window.historyAPI.saveSession(sessionData)
                    .then(res => {
                        console.log("Session saved successfully!", res);
                        // Refresh History List in Sidebar
                        loadHistory();
                    })
                    .catch(err => console.error("Failed to save session:", err));

                // Decisions & Actions Rendering (simplified for update)
                const decisionsHtml = currentResults.decisions.length > 0
                    ? currentResults.decisions.map(d => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px;"><strong>${d.text}</strong><div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">"${d.evidence_quote}"</div></div>`).join("")
                    : "<p style='color:#666'>No key decisions detected.</p>";
                document.getElementById("content-decisions").innerHTML = decisionsHtml;

                const actionsHtml = currentResults.actionItems.length > 0
                    ? currentResults.actionItems.map(a => `<div style="margin-bottom:10px; padding:10px; background:#262626; border-radius:6px; border-left: 3px solid #22c55e;"><strong>${a.text}</strong><div style="font-size:0.85em; color:#22c55e;">Owner: ${a.owner || "Unassigned"}</div></div>`).join("")
                    : "<p style='color:#666'>No action items detected.</p>";
                document.getElementById("content-actions").innerHTML = actionsHtml;

                switchView("enhanced");
            } else {
                switchView("transcript");
            }

        } else {
            chatBox.innerHTML = `<p style="color:red; padding:20px;">Error: ${result.error}</p>`;
        }
        btnTranscribe.disabled = false;
    } catch (err) {
        console.error("Transcribe Error:", err);
        alert("Error in Transcribe Button: " + err.message);
        btnTranscribe.disabled = false;
    }
});

// Simple Markdown Parser (No external dependencies)
function parseMarkdown(text) {
    if (!text) return "";

    // Escape HTML first to prevent XSS (basic)
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Headers (## Header -> <h2>Header</h2>)
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Blockquote (> text)
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Lists (- item)
    // Wrap lists in <ul> is harder with simple regex, so we just style the lines
    html = html.replace(/^\- (.*$)/gim, '<li style="margin-left:20px;">$1</li>');

    // Newlines to <br> (but not inside tags roughly)
    html = html.replace(/\n/gim, '<br>');

    return html;
}

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

function updateDownloadButton() {
    if (!btnDownload) return;

    // Show download button for text-heavy views
    const downloadableViews = ["transcript", "enhanced", "summary", "raw-notes", "decisions", "actions"];
    if (downloadableViews.includes(currentView)) {
        btnDownload.classList.remove("hidden");
    } else {
        btnDownload.classList.add("hidden");
    }
}

btnDownload.addEventListener("click", () => {
    let content = "";
    let filename = `echo_export_${Date.now()}.txt`;

    if (currentView === "transcript") {
        // Extract text from chat bubbles
        const bubbles = document.querySelectorAll("#chat-box .message-bubble");
        bubbles.forEach(b => {
            content += b.innerText + "\n\n";
        });
        filename = "transcript.txt";
    } else if (currentView === "enhanced") {
        content = currentResults ? currentResults.structuredNotes : "";
        filename = "enhanced_notes.md";
    } else if (currentView === "summary") {
        content = currentResults ? currentResults.summary : "";
        filename = "summary.md";
    } else if (currentView === "raw-notes") {
        content = currentRawNotes;
        filename = "raw_notes.txt";
    } else if (currentView === "decisions") {
        content = currentResults && currentResults.decisions ? currentResults.decisions.map(d => `- ${d.text} ("${d.evidence_quote}")`).join("\n") : "";
        filename = "decisions.txt";
    } else if (currentView === "actions") {
        content = currentResults && currentResults.actionItems ? currentResults.actionItems.map(a => `- [ ] ${a.text} (Owner: ${a.owner})`).join("\n") : "";
        filename = "actions.txt";
    }

    if (content) {
        downloadTextFile(filename, "Echo Export", content);
    } else {
        alert("Nothing to download in this view.");
    }
});


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

// --- Rich Text Editor Logic ---
window.formatDoc = function (cmd, value = null) {
    if (value) {
        document.execCommand(cmd, false, value);
    } else {
        document.execCommand(cmd);
    }

    // Ensure editor keeps focus
    const editor = document.getElementById("notes-input");
    if (editor) editor.focus();
};
