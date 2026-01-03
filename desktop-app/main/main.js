const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const axios = require("axios");
const { initAudio, getCurrentMode } = require("./audioManager");
const { startRecording, stopRecording, playRecording, getRecordingStatus } = require("./recorder");
const { transcribeFile } = require("./transcriber");
const { connectDB, saveTranscript } = require("./db"); // Import DB module
require("dotenv").config();

// PRODUCTION API CONFIGURATION
const API_BASE_URL = app.isPackaged
  ? "https://echo-backend-6fok.onrender.com"
  : "https://echo-backend-6fok.onrender.com"; // User requested Prod URL for dev

console.log(`[Main] Running in ${app.isPackaged ? "PRODUCTION" : "DEVELOPMENT"} mode`);
console.log(`[Main] API Endpoint: ${API_BASE_URL}`);

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

app.on("will-quit", () => {
  console.log("App quitting, restoring audio...");
  const { restoreAudio } = require("./audioManager");
  restoreAudio();
});

// Audio Mode IPC
ipcMain.handle("get-audio-mode", () => {
  return getCurrentMode();
});

// Recorder IPC
ipcMain.handle("start-recording", () => startRecording());
ipcMain.handle("stop-recording", () => stopRecording());
ipcMain.handle("play-recording", async (event, filePath) => {
  console.log("Requesting playback for:", filePath || "Last Recording");
  if (filePath) {
    return await playRecording(filePath); // Assuming playRecording is from recorder.js
  }
  // Fallback to last recorded session if no path provided
  return await playRecording(); // Assuming playRecording is from recorder.js
});
ipcMain.handle("get-recording-status", () => getRecordingStatus());

// History IPC
ipcMain.handle("fetch-sessions", async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sessions`);
    return response.data;
  } catch (error) {
    console.error("Error fetching sessions:", error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fetch-session", async (event, id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sessions/${id}`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("save-session", async (event, data) => {
  try {
    console.log("Saving session to backend...");
    const response = await axios.post(`${API_BASE_URL}/sessions`, data);
    return response.data;
  } catch (error) {
    console.error("Error saving session:", error.message);
    return { success: false, error: error.message };
  }
});

// Transcriber IPC
ipcMain.handle("transcribe-recording", async (event, notes, language) => {
  try {
    console.log(`[IPC] Received transcribe request. Language: ${language}`);
    console.log(`[IPC] Calling transcribeFile...`);

    const result = await transcribeFile(null, language);
    console.log(`[IPC] Transcription complete. Result type: ${result?.type}`);

    // Save to MongoDB with notes - LEGACY Local DB (Optional, keeping for safety)
    if (result) {
      saveTranscript(result, notes).catch(err => console.error("Async save failed:", err));
    }

    // Result is now an object { type: "diarization"|"text", content: ... }

    // --- SAFE BACKEND INTEGRATION ---
    // Try to get enhanced notes from local backend, but don't fail if it's down
    let enhancementData = null;
    try {
      console.log(`[IPC] Attempting to fetch enhanced notes from backend (${API_BASE_URL}/enhance)...`);
      const response = await axios.post(`${API_BASE_URL}/enhance`, {
        transcript: result.content, // Pass the structured content
        rawNotes: notes,
        language: language // Pass language context to backend
      });

      console.log(`[IPC] Backend response status: ${response.status}`);
      if (response.data.success) {
        enhancementData = response.data.data;
        console.log("Enhanced notes received:", enhancementData);
      }
    } catch (apiError) {
      console.warn("[IPC] Backend API not available or failed:", apiError.message);
      if (apiError.response) {
        console.error("[IPC] Backend error data:", apiError.response.data);
      }
      // We continue without enhancement data
    }

    return {
      success: true,
      data: result,
      enhancement: enhancementData // return this to renderer
    };
  } catch (error) {
    console.error("[IPC] Error in transcribe-recording handler:", error);
    return { success: false, error: error.message };
  }
});
