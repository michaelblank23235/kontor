const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  shell,
  session,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Vault, atomicWrite } = require("./vault.cjs");
const { optionalStartup } = require("./startup.cjs");
const { log, fatal } = global.kontorStartup;
log.record("main.loaded");
// Packaged Store apps use the identity assigned by Windows.
if (process.platform === "win32" && !process.windowsStore)
  app.setAppUserModelId("de.kontor.windows");
const base = path.join(__dirname, "..");
const indexFile = path.join(base, "dist/index.html");
let win,
  quick,
  tray,
  vault,
  quitting = false,
  settings,
  settingsFile,
  quittingPending = false;
let flushCounter = 0;
async function flushEditors() {
  const windows = BrowserWindow.getAllWindows().filter(
    (w) =>
      !w.isDestroyed() &&
      w.webContents.getURL().split("#")[0] === pathToFileURL(indexFile).href,
  );
  await Promise.all(
    windows.map(
      (w) =>
        new Promise((resolve, reject) => {
          const id = ++flushCounter;
          const timeout = setTimeout(() => done(false), 5000);
          const listener = (e, key, ok) => {
            if (e.sender === w.webContents && key === id) done(ok);
          };
          function done(ok) {
            clearTimeout(timeout);
            ipcMain.removeListener("kontor:flushed", listener);
            ok
              ? resolve()
              : reject(
                  Error(
                    "Eine Notiz konnte nicht gespeichert werden. Bitte den Editor prüfen.",
                  ),
                );
          }
          ipcMain.on("kontor:flushed", listener);
          w.webContents.send("kontor:flush", id);
        }),
    ),
  );
}
async function lockVault() {
  await flushEditors();
  vault.lock();
  quick?.hide();
  notify();
}
const testMode = process.env.KONTOR_TEST === "1" && !app.isPackaged;
function createWindow(capture = false) {
  const w = new BrowserWindow({
    width: capture ? 480 : 1280,
    height: capture ? 340 : 820,
    minWidth: capture ? 420 : 980,
    minHeight: capture ? 300 : 620,
    show: true,
    title: capture ? "Kontor · Schnellerfassung" : "Kontor",
    backgroundColor: "#16141a",
    icon: path.join(base, "resources/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  log.record("window.created", { capture });
  w.webContents.on(
    "did-fail-load",
    (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3)
        fatal("window.load.failed", Error(`${description} (${code})`));
    },
  );
  w.webContents.on("preload-error", (_event, _file, error) =>
    fatal("window.preload.failed", error),
  );
  w.webContents.on("render-process-gone", (_event, details) => {
    if (!quitting)
      fatal(
        "window.renderer.failed",
        Error(`${details.reason} (${details.exitCode})`),
      );
  });
  w.loadFile(indexFile, { hash: capture ? "capture" : "" })
    .then(() => {
      log.record("window.loaded", { capture });
    })
    .catch((error) => fatal("window.load.failed", error));
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  if (!capture) {
    let closing = false;
    w.on("close", (e) => {
      if (!quitting && !closing) {
        e.preventDefault();
        flushEditors()
          .then(() => {
            closing = true;
            w.close();
          })
          .catch((error) =>
            dialog.showErrorBox("Speichern fehlgeschlagen", error.message),
          );
      }
    });
  }
  if (capture)
    w.on("close", (e) => {
      if (!quitting) {
        e.preventDefault();
        w.hide();
      }
    });
  return w;
}
function showMain() {
  if (!app.isReady()) {
    app.whenReady().then(showMain);
    return;
  }
  if (!win || win.isDestroyed()) win = createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function capture() {
  if (!vault.repo) {
    showMain();
    return;
  }
  if (!quick || quick.isDestroyed()) quick = createWindow(true);
  quick.show();
  quick.focus();
}
function notify() {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send("kontor:changed");
}
function registerHotkey(value) {
  const previous = settings.hotkey;
  globalShortcut.unregisterAll();
  if (!globalShortcut.register(value, capture)) {
    if (previous) globalShortcut.register(previous, capture);
    throw Error("Dieses Tastenkürzel ist bereits belegt oder ungültig.");
  }
}
function allowed(event) {
  const u = event.senderFrame?.url?.split("#")[0];
  if (u !== pathToFileURL(indexFile).href)
    throw Error("Nicht erlaubter Zugriff.");
}
function unlocked() {
  if (!vault.repo) throw Error("Kontor ist gesperrt.");
  return vault.repo;
}
function handle(name, fn) {
  ipcMain.handle("kontor:" + name, async (e, ...args) => {
    try {
      allowed(e);
      return { ok: true, value: await fn(e, ...args) };
    } catch (error) {
      return {
        ok: false,
        error: error.message || "Die Aktion konnte nicht abgeschlossen werden.",
      };
    }
  });
}
function parent(e) {
  return BrowserWindow.fromWebContents(e.sender) || win;
}
function safeName(s) {
  return (s || "Kontor").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 100);
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function printContent(kind, key) {
  const r = unlocked();
  const section = (title, body) => `<h1>${esc(title)}</h1>${body}`;
  const p = (s) => `<div class="text">${esc(s)}</div>`;
  if (kind === "person") {
    const entries = r
      .all("entry")
      .filter((x) => x.participants.includes(key))
      .sort((a, b) => b.date.localeCompare(a.date));
    const notes = r.all("note").filter((x) => x.persons.includes(key));
    return section(
      "Personenakte: " + key,
      entries
        .map((x) =>
          section(
            x.subject,
            `<p>${esc(new Date(x.date).toLocaleString("de-DE"))}</p>` +
              p(x.body),
          ),
        )
        .join("") + notes.map((x) => section(x.title, p(x.body))).join(""),
    );
  }
  if (!["entry", "note", "todo"].includes(kind))
    throw Error("Ungültiger Export.");
  const x = r.require(kind, key);
  return section(
    x.subject || x.title || "Ohne Titel",
    (x.date
      ? `<p>${esc(new Date(x.date).toLocaleString("de-DE"))} · ${esc(x.type)} · ${esc(x.confidentiality)}</p>`
      : "") +
      ((x.participants || x.persons)?.length
        ? `<p>${esc((x.participants || x.persons).join(", "))}</p>`
        : "") +
      (x.updatedAt
        ? `<p>Stand: ${esc(new Date(x.updatedAt).toLocaleString("de-DE"))}</p>`
        : "") +
      (x.tags?.length
        ? `<p>Schlagworte: ${esc(x.tags.map((t) => "#" + t).join(" "))}</p>`
        : "") +
      (x.status
        ? `<p>Status: ${esc(x.status)} · Frist: ${x.dueDate ? esc(new Date(x.dueDate).toLocaleDateString("de-DE")) : "Ohne Frist"} · Wiederholung: ${esc(x.recurrence)}</p>`
        : "") +
      p(x.body || x.note) +
      ((x.agreements || []).length
        ? "<h2>Vereinbarungen</h2>" +
          x.agreements
            .map(
              (a) =>
                `<p><strong>${esc(a.text)}</strong><br>${esc(a.responsible)} ${a.dueDate ? "· " + esc(new Date(a.dueDate).toLocaleDateString("de-DE")) : ""}</p>`,
            )
            .join("")
        : ""),
  );
}
app
  .whenReady()
  .then(() => {
    log.record("app.ready");
    vault = new Vault(path.join(app.getPath("userData"), "kontor.kontorvault"));
    settingsFile = path.join(app.getPath("userData"), "settings.json");
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch {
      settings = {};
    }
    settings = { theme: "dark", hotkey: "Control+Alt+K", ...settings };
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) =>
      cb(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_d, cb) => cb({ cancel: true }),
    );
    let rendererConnected = false;
    handle("status", () => {
      if (!rendererConnected) {
        log.record("renderer.connected");
        rendererConnected = true;
      }
      return { exists: vault.exists, unlocked: !!vault.repo, settings };
    });
    handle("unlock", async (_e, password) => {
      await vault.unlock(password);
      notify();
      return vault.repo.snapshot();
    });
    handle("changePin", (_e, current, pin) => vault.changePin(current, pin));
    handle("lock", () => lockVault());
    handle("snapshot", () => unlocked().snapshot());
    handle("command", (_e, c, a) => {
      unlocked();
      const result = vault.command(c, a);
      notify();
      return result;
    });
    handle("settings", (_e, values) => {
      if (!["dark", "light", "system"].includes(values.theme))
        throw Error("Ungültiges Erscheinungsbild.");
      if (typeof values.hotkey !== "string" || values.hotkey.length > 100)
        throw Error("Ungültiges Tastenkürzel.");
      if (values.hotkey !== settings.hotkey) registerHotkey(values.hotkey);
      settings = { theme: values.theme, hotkey: values.hotkey };
      atomicWrite(settingsFile, Buffer.from(JSON.stringify(settings)));
      notify();
      return settings;
    });
    handle("addAttachments", async (e, noteId) => {
      unlocked().require("note", noteId);
      const result = await dialog.showOpenDialog(parent(e), {
        title: "Bilder oder PDF anhängen",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Bilder und PDF",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
          },
        ],
      });
      if (result.canceled) return;
      const files = result.filePaths.map((file) => {
        if (fs.statSync(file).size > 30 * 1024 * 1024)
          throw Error("Anhänge dürfen höchstens 30 MB groß sein.");
        const ext = path.extname(file).toLowerCase();
        const mime = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".gif": "image/gif",
          ".pdf": "application/pdf",
        }[ext];
        return {
          filename: path.basename(file),
          mime,
          bytes: fs.readFileSync(file),
        };
      });
      const r = unlocked();
      r.transaction(
        () =>
          files.forEach((f) =>
            r.attachment(noteId, f.filename, f.mime, f.bytes),
          ),
        () => vault.persist(),
      );
      notify();
    });
    handle("attachment", (_e, key) => {
      const a = unlocked().query("SELECT * FROM attachment WHERE id=?", [
        key,
      ])[0];
      if (!a) throw Error("Anhang nicht gefunden.");
      return {
        filename: a.filename,
        mime: a.mime,
        data: Buffer.from(a.data).toString("base64"),
      };
    });
    handle("saveAttachment", async (e, key) => {
      const a = unlocked().query("SELECT * FROM attachment WHERE id=?", [
        key,
      ])[0];
      if (!a) throw Error("Anhang nicht gefunden.");
      const d = await dialog.showSaveDialog(parent(e), {
        defaultPath: safeName(a.filename),
      });
      if (!d.canceled) atomicWrite(d.filePath, Buffer.from(a.data));
    });
    handle("backup", async (e) => {
      unlocked();
      const d = await dialog.showSaveDialog(parent(e), {
        defaultPath: `Kontor-${new Date().toISOString().slice(0, 10)}.kontorbackup`,
        filters: [
          { name: "Kontor-Windows-Sicherung", extensions: ["kontorbackup"] },
        ],
      });
      if (d.canceled) return false;
      vault.backup(d.filePath);
      return true;
    });
    handle("restore", async (e, password) => {
      const choice = await dialog.showMessageBox(parent(e), {
        type: "warning",
        message: "Aktuelle Daten durch eine Sicherung ersetzen?",
        detail:
          "Vor dem Import wird die aktuelle Datenbank automatisch gesichert. Verwenden Sie die Passphrase der Sicherung.",
        buttons: ["Abbrechen", "Sicherung wählen"],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response !== 1) return false;
      const d = await dialog.showOpenDialog(parent(e), {
        properties: ["openFile"],
        filters: [
          { name: "Kontor-Windows-Sicherung", extensions: ["kontorbackup"] },
        ],
      });
      if (d.canceled) return false;
      await vault.restore(d.filePaths[0], password);
      notify();
      return true;
    });
    handle("exportPDF", async (e, kind, key) => {
      const content = printContent(kind, key);
      const d = await dialog.showSaveDialog(parent(e), {
        defaultPath: "Kontor.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (d.canceled) return false;
      const report = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      try {
        await report.loadURL(
          "data:text/html;charset=utf-8," +
            encodeURIComponent(
              `<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:12px system-ui;color:#24202c;line-height:1.6}h1{font-size:23px;margin-top:24px}h2{font-size:17px}.text{white-space:pre-wrap;overflow-wrap:anywhere}p{break-inside:avoid}</style><header>KONTOR · Dokumentation</header>${content}</html>`,
            ),
        );
        const bytes = await report.webContents.printToPDF({
          pageSize: "A4",
          printBackground: true,
          margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
        });
        atomicWrite(d.filePath, bytes);
        return true;
      } finally {
        report.destroy();
      }
    });
    handle("external", async (_e, url) => {
      const u = new URL(url);
      if (!["https:", "http:", "mailto:"].includes(u.protocol))
        throw Error("Dieser Linktyp wird nicht unterstützt.");
      await shell.openExternal(u.href);
    });
    handle("capture", () => capture());
    handle("hideCapture", () => quick?.hide());
    handle("showMain", () => showMain());
    const menu = [
      {
        label: "Kontor",
        submenu: [
          {
            label: "Schnellerfassung",
            accelerator: "CmdOrCtrl+Alt+K",
            click: capture,
          },
          {
            label: "Sperren",
            accelerator: "CmdOrCtrl+Shift+L",
            click: () =>
              lockVault().catch((e) =>
                dialog.showErrorBox("Speichern fehlgeschlagen", e.message),
              ),
          },
          { type: "separator" },
          { role: "quit", label: "Beenden" },
        ],
      },
      {
        label: "Bearbeiten",
        submenu: [
          { role: "undo", label: "Rückgängig" },
          { role: "redo", label: "Wiederholen" },
          { type: "separator" },
          { role: "cut", label: "Ausschneiden" },
          { role: "copy", label: "Kopieren" },
          { role: "paste", label: "Einfügen" },
          { role: "selectAll", label: "Alles auswählen" },
        ],
      },
      {
        label: "Ansicht",
        submenu: [
          { role: "resetZoom", label: "Originalgröße" },
          { role: "zoomIn", label: "Vergrößern" },
          { role: "zoomOut", label: "Verkleinern" },
          { role: "togglefullscreen", label: "Vollbild" },
        ],
      },
    ];
    win = createWindow();
    optionalStartup(
      "menu",
      () => Menu.setApplicationMenu(Menu.buildFromTemplate(menu)),
      log,
    );
    if (!testMode || process.env.KONTOR_TEST_NATIVE === "1") {
      try {
        registerHotkey(settings.hotkey);
      } catch (e) {
        settings.hotkeyError = e.message;
      }
      optionalStartup(
        "tray",
        () => {
          tray = new Tray(
            nativeImage
              .createFromPath(path.join(base, "resources/icon.png"))
              .resize({ width: 20, height: 20 }),
          );
          tray.setToolTip("Kontor · Schnellerfassung");
          tray.setContextMenu(
            Menu.buildFromTemplate([
              { label: "Kontor öffnen", click: showMain },
              { label: "Schnellerfassung", click: capture },
              { label: "Beenden", click: () => app.quit() },
            ]),
          );
          tray.on("click", capture);
        },
        log,
      );
    }
    log.record("app.started");
  })
  .catch((error) => fatal("app.start.failed", error));
app.on("second-instance", showMain);
app.on("activate", showMain);
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
app.on("before-quit", (e) => {
  if (quitting) {
    globalShortcut.unregisterAll();
    vault?.lock();
    return;
  }
  e.preventDefault();
  if (quittingPending) return;
  quittingPending = true;
  flushEditors()
    .then(() => {
      quitting = true;
      app.quit();
    })
    .catch((error) => {
      quittingPending = false;
      dialog.showErrorBox("Speichern fehlgeschlagen", error.message);
    });
});
