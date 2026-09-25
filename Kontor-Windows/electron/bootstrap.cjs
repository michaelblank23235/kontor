// Keep this entry point independent of the database and renderer dependencies.
const { app, dialog } = require("electron");
const { createStartupLog } = require("./startup.cjs");
const testMode = process.env.KONTOR_TEST === "1" && !app.isPackaged;
if (testMode) {
  app.setPath("userData", process.env.KONTOR_TEST_DIR);
  // Keep automatic test backups out of the real Documents folder.
  app.setPath(
    "documents",
    require("node:path").join(process.env.KONTOR_TEST_DIR, "Dokumente"),
  );
}
const log = createStartupLog(
  testMode
    ? require("node:path").join(process.env.KONTOR_TEST_DIR, "start.log")
    : undefined,
);
let failed = false;
function fatal(stage, error) {
  if (failed) return;
  failed = true;
  log.record(stage, {
    message: String(error?.message || error),
    stack: error?.stack,
  });
  dialog.showErrorBox(
    "Kontor konnte nicht gestartet werden",
    `Beim Öffnen ist ein Fehler aufgetreten:\n\n${error?.message || error}\n\nDas Startprotokoll liegt hier:\n${log.file}\n\nBitte diese Meldung und das Startprotokoll zur Fehlersuche weitergeben.`,
  );
  app.exit(1);
}
process.on("uncaughtException", (error) => fatal("main.uncaught", error));
process.on("unhandledRejection", (error) => fatal("main.rejection", error));
log.record("bootstrap", {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  packaged: app.isPackaged,
});
// Optional troubleshooting switch; no antivirus, sandbox or other protections are disabled.
if (process.argv.includes("--software-rendering")) {
  app.disableHardwareAcceleration();
  log.record("graphics.software");
}
try {
  if (!app.requestSingleInstanceLock()) {
    log.record("instance.forwarded");
    app.quit();
  } else {
    global.kontorStartup = { log, fatal };
    require("./main.cjs");
  }
} catch (error) {
  fatal("bootstrap.failed", error);
}
