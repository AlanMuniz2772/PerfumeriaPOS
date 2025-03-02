const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    sendLoginSuccess: () => ipcRenderer.send("login-success")
});
