const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("audioAPI", {
  getMode: () => ipcRenderer.invoke("get-audio-mode")
});

contextBridge.exposeInMainWorld("recorderAPI", {
  start: () => ipcRenderer.invoke("start-recording"),
  stop: () => ipcRenderer.invoke("stop-recording"),
  play: (filePath) => ipcRenderer.invoke("play-recording", filePath),
  playPath: (path) => ipcRenderer.invoke("play-recording-path", path), // New for history
  getStatus: () => ipcRenderer.invoke("get-recording-status"),
  transcribe: (notes, language) => ipcRenderer.invoke("transcribe-recording", notes, language)
});

contextBridge.exposeInMainWorld("historyAPI", {
  fetchSessions: () => ipcRenderer.invoke("fetch-sessions"),
  fetchSession: (id) => ipcRenderer.invoke("fetch-session", id),
  saveSession: (data) => ipcRenderer.invoke("save-session", data)
});

console.log("Preload script finished setup.");
