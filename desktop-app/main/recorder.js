const { spawn } = require("child_process");
const path = require("path");
const { app } = require("electron");
const fs = require("fs");

let recordProcess = null;
let currentRecordingPath = null;

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function startRecording() {
  if (recordProcess) {
    console.log("Recording already in progress.");
    return false;
  }

  // Generate unique filename: recording_TIMESTAMP.wav
  const filename = `recording_${Date.now()}.wav`;
  currentRecordingPath = path.join(RECORDINGS_DIR, filename);

  console.log(`Starting recording to ${currentRecordingPath}...`);
  // parecord -d RecordingMixSink.monitor --file-format=wav /path/to/unique_file.wav
  recordProcess = spawn("parecord", [
    "-d", "RecordingMixSink.monitor",
    "--file-format=wav",
    currentRecordingPath
  ]);

  recordProcess.stdout.on("data", (data) => {
    // console.log(`parecord stdout: ${data}`);
  });

  recordProcess.stderr.on("data", (data) => {
    console.error(`parecord stderr: ${data}`);
  });

  recordProcess.on("close", (code) => {
    console.log(`parecord exited with code ${code}`);
    recordProcess = null;
  });

  return true;
}

function stopRecording() {
  if (!recordProcess) {
    console.log("No recording to stop.");
    return { success: false };
  }

  console.log("Stopping recording...");
  recordProcess.kill("SIGINT"); 
  recordProcess = null;
  
  // Return the path so we can save it to DB later
  return { success: true, filePath: currentRecordingPath };
}

function playRecording(customPath = null) {
  if (recordProcess) {
    console.log("Cannot play while recording.");
    return false;
  }
  
  // Use custom path if provided (for history), otherwise play last recording
  const fileToPlay = customPath || currentRecordingPath;

  if (!fileToPlay) {
      console.log("No recording available to play.");
      return false;
  }

  console.log(`Playing recording: ${fileToPlay}...`);
  const playProcess = spawn("aplay", [fileToPlay]);

  playProcess.on("close", (code) => {
    console.log(`aplay finished with code ${code}`);
  });
  
  return true;
}

function getRecordingStatus() {
    return { isRecording: !!recordProcess, lastFilePath: currentRecordingPath };
}

module.exports = { startRecording, stopRecording, playRecording, getRecordingStatus };
