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
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnPlay = document.getElementById("btn-play");

const btnTranscribe = document.getElementById("btn-transcribe");
const transcriptContainer = document.getElementById("transcript-container");
/* const transcriptText = document.getElementById("transcript-text"); // Removed from HTML */
const chatBox = document.getElementById("chat-box");

btnStart.addEventListener("click", async () => {
  const success = await window.recorderAPI.start();
  if (success) {
    updateButtons(true);
    transcriptContainer.style.display = "none";
  }
});

btnStop.addEventListener("click", async () => {
  const success = await window.recorderAPI.stop();
  if (success) {
    updateButtons(false);
  }
});

btnPlay.addEventListener("click", async () => {
  await window.recorderAPI.play();
});

// ... (listeners)

btnTranscribe.addEventListener("click", async () => {
  chatBox.innerHTML = "<p>Transcribing...</p>";
  transcriptContainer.style.display = "block";
  btnTranscribe.disabled = true;

  const notes = document.getElementById("notes-input").value;
  const result = await window.recorderAPI.transcribe(notes);
  
  chatBox.innerHTML = ""; // Clear loading text

  if (result.success) {
    console.log("Deepgram Result:", JSON.stringify(result.data, null, 2)); // Debug log
    
    // Render Chat
    if (result.data.type === "diarization") {
        renderChat(result.data.content);
    } else {
        renderMessage(result.data.content, "right"); 
    }

    // Handle AI Enhancement
    if (result.enhancement) {
        console.log("Applying AI Enhancement to UI...", result.enhancement);
        const data = result.enhancement;
        
        // Update Footer Cards
        document.getElementById("desc-enhanced").innerText = "Ready to download";
        document.getElementById("desc-summary").innerText = data.summary ? data.summary.slice(0, 50) + "..." : "No summary generated";
        document.getElementById("desc-decisions").innerText = `${data.decisions.length} Decisions found`;
        document.getElementById("desc-actions").innerText = `${data.actionItems.length} Actions found`;

        // Add click listeners to show full details (simple alert for now)
        document.getElementById("btn-summary").onclick = () => alert("SUMMARY:\n\n" + data.summary);
        document.getElementById("btn-decisions").onclick = () => alert("DECISIONS:\n\n" + data.decisions.map(d => `• ${d.text}`).join("\n"));
        document.getElementById("btn-actions").onclick = () => alert("ACTIONS:\n\n" + data.actionItems.map(a => `• ${a.text} (Owner: ${a.owner})`).join("\n"));
        
        // Enhanced Notes (replace raw input or show separate?)
        // For now, let's update the raw notes with the structured ones from AI? 
        // Or maybe just alert/download. Let's do alert for consistency.
        document.getElementById("btn-enhanced-notes").onclick = () => {
             console.log(data.structuredNotes);
             alert("Enhanced Notes printed to Console (too large for alert)");
        };
    }

  } else {
    chatBox.innerHTML = `<p style="color:red">Error: ${result.error}</p>`;
  }
  btnTranscribe.disabled = false;
});

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
  btnStart.disabled = isRecording;
  btnStop.disabled = !isRecording;
  btnPlay.disabled = isRecording; // disable play while recording
  btnTranscribe.disabled = isRecording;
}

