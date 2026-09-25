const { contextBridge, ipcRenderer } = require("electron");
let flushHandler = async () => {};
ipcRenderer.on("kontor:flush", async (_e, id) => {
  try {
    await flushHandler();
    ipcRenderer.send("kontor:flushed", id, true);
  } catch {
    ipcRenderer.send("kontor:flushed", id, false);
  }
});
const invoke = async (name, ...args) => {
  const r = await ipcRenderer.invoke("kontor:" + name, ...args);
  if (!r.ok) throw Error(r.error);
  return r.value;
};
contextBridge.exposeInMainWorld("kontor", {
  status: () => invoke("status"),
  unlock: (p) => invoke("unlock", p),
  changePin: (current, pin) => invoke("changePin", current, pin),
  lock: () => invoke("lock"),
  snapshot: () => invoke("snapshot"),
  command: (c, a) => invoke("command", c, a),
  settings: (s) => invoke("settings", s),
  addAttachments: (id) => invoke("addAttachments", id),
  attachment: (id) => invoke("attachment", id),
  saveAttachment: (id) => invoke("saveAttachment", id),
  backup: () => invoke("backup"),
  openBackupDir: () => invoke("openBackupDir"),
  openStartupSettings: () => invoke("openStartupSettings"),
  restore: (p) => invoke("restore", p),
  exportPDF: (k, id) => invoke("exportPDF", k, id),
  external: (u) => invoke("external", u),
  capture: () => invoke("capture"),
  hideCapture: () => invoke("hideCapture"),
  showMain: () => invoke("showMain"),
  onFlush: (fn) => {
    flushHandler = fn;
    return () => {
      flushHandler = async () => {};
    };
  },
  onNavigate: (fn) => {
    const listener = (_e, section) => fn(section);
    ipcRenderer.on("kontor:navigate", listener);
    return () => ipcRenderer.removeListener("kontor:navigate", listener);
  },
  onChanged: (fn) => {
    const listener = () => fn();
    ipcRenderer.on("kontor:changed", listener);
    return () => ipcRenderer.removeListener("kontor:changed", listener);
  },
});
