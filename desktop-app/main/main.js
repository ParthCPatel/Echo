const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const axios = require("axios");
const { initAudio, getCurrentMode } = require("./audioManager");
const { startRecording, stopRecording, playRecording, getRecordingStatus } = require("./recorder");
const { transcribeFile } = require("./transcriber");
const { connectDB, saveTranscript } = require("./db"); // Import DB module
require("dotenv").config();

let win;

// ... (existing code handles window creation)

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("renderer/index.html");
}

app.whenReady().then(async () => {
  // Initialize Database
  await connectDB();

  // Initialize audio subsystem
  initAudio();
  
  createWindow();

  // Poll for audio hardware changes every 5 seconds
  setInterval(() => {
      const { checkAudioChanges } = require("./audioManager");
      checkAudioChanges();
  }, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Audio Mode IPC
ipcMain.handle("get-audio-mode", () => {
  return getCurrentMode();
});

// Recorder IPC
ipcMain.handle("start-recording", () => startRecording());
ipcMain.handle("stop-recording", () => stopRecording());
ipcMain.handle("play-recording", () => playRecording());
ipcMain.handle("get-recording-status", () => getRecordingStatus());

// Transcriber IPC
ipcMain.handle("transcribe-recording", async (event, notes) => {
  try {
    const result = await transcribeFile();
    
    // Save to MongoDB with notes
    if (result) {
        saveTranscript(result, notes).catch(err => console.error("Async save failed:", err));
    }

    // Result is now an object { type: "diarization"|"text", content: ... }
    
    // --- SAFE BACKEND INTEGRATION ---
    // Try to get enhanced notes from local backend, but don't fail if it's down
    let enhancementData = null;
    try {
        console.log("Attempting to fetch enhanced notes from backend...");
        const response = await axios.post('http://localhost:3000/enhance', {
            transcript: result.content, // Pass the structured content
            rawNotes: notes
        });
        if (response.data.success) {
            enhancementData = response.data.data;
            console.log("Enhanced notes received:", enhancementData);
        }
    } catch (apiError) {
        console.warn("Backend API not available or failed:", apiError.message);
        // We continue without enhancement data
    }

    return { 
        success: true, 
        data: result,
        enhancement: enhancementData // return this to renderer
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
