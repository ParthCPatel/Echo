const { spawn } = require("child_process");
const path = require("path");

let recordProcess = null;
const RECORD_FILE = "test_app.wav";

function startRecording() {
  if (recordProcess) {
    console.log("Recording already in progress.");
    return false;
  }

  console.log("Starting recording...");
  // parecord -d VirtualSink.monitor --file-format=wav test_app.wav
  recordProcess = spawn("parecord", [
    "-d", "VirtualSink.monitor",
    "--file-format=wav",
    RECORD_FILE
  ]);

  recordProcess.stdout.on("data", (data) => {
    // parecord usually doesn't output much to stdout, but we can log it
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
    return false;
  }

  console.log("Stopping recording...");
  recordProcess.kill("SIGINT"); // SIGINT allows parecord to finalize the WAV header
  recordProcess = null;
  return true;
}

function playRecording() {
  if (recordProcess) {
    console.log("Cannot play while recording.");
    return false;
  }

  console.log("Playing recording...");
  // aplay test_app.wav
  const playProcess = spawn("aplay", [RECORD_FILE]);

  playProcess.on("close", (code) => {
    console.log(`aplay finished with code ${code}`);
  });
  
  return true;
}

function getRecordingStatus() {
    return { isRecording: !!recordProcess };
}

module.exports = { startRecording, stopRecording, playRecording, getRecordingStatus };
