const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("audioAPI", {
  getMode: () => ipcRenderer.invoke("get-audio-mode")
});

contextBridge.exposeInMainWorld("recorderAPI", {
  start: () => ipcRenderer.invoke("start-recording"),
  stop: () => ipcRenderer.invoke("stop-recording"),
  play: () => ipcRenderer.invoke("play-recording"),
  getStatus: () => ipcRenderer.invoke("get-recording-status"),
  transcribe: (notes) => ipcRenderer.invoke("transcribe-recording", notes)
});

const { marked } = require("marked");
contextBridge.exposeInMainWorld("utilsAPI", {
  renderMarkdown: (text) => marked.parse(text)
});
