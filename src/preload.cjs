const { contextBridge, ipcRenderer } = require("electron");
const channels = new Set([
  "state",
  "computer.access",
  "project.create",
  "project.open",
  "project.policy",
  "grant.add",
  "grant.remove",
  "files.list",
  "files.open",
  "hardware.probe",
  "models.cancel",
  "models.download",
  "models.select",
  "chat.send",
  "chat.create",
  "chat.attach",
  "chat.cancel",
  "approval.respond",
  "update.check",
  "update.download",
  "update.install",
]);
contextBridge.exposeInMainWorld("companion", {
  call: (name, args) => {
    if (!channels.has(name)) return Promise.reject(Error("Unknown operation."));
    return ipcRenderer.invoke("companion:request", name, args);
  },
  onEvent: (listener) => {
    ipcRenderer.on("companion:event", (_e, event) => listener(event));
  },
});
