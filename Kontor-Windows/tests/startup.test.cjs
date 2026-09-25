const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const {
  createStartupLog,
  optionalStartup,
} = require("../electron/startup.cjs");

test("Optionaler Startfehler wird protokolliert und verhindert das Hauptfenster nicht", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-start-log-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = createStartupLog(path.join(dir, "start.log"));
  let shown = false;
  shown = true;
  log.record("window.created");
  assert.equal(
    optionalStartup(
      "tray",
      () => {
        throw Error("Symbol nicht verfügbar");
      },
      log,
    ),
    false,
  );
  assert.equal(shown, true);
  assert.deepEqual(
    fs
      .readFileSync(log.file, "utf8")
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s).stage),
    ["window.created", "tray.failed"],
  );
});

function bootstrap({ lock = true, failMain = false } = {}) {
  const events = [],
    handlers = {};
  const app = {
    isPackaged: true,
    getVersion: () => "0.1.1",
    requestSingleInstanceLock: () => lock,
    quit: () => events.push("quit"),
    exit: (code) => events.push(["exit", code]),
  };
  const electron = {
    app,
    dialog: {
      showErrorBox: (title, message) => events.push(["dialog", title, message]),
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../electron/bootstrap.cjs"), "utf8"),
    {
      require: (name) => {
        if (name === "electron") return electron;
        if (name === "./startup.cjs")
          return {
            createStartupLog: () => ({
              file: "start.log",
              record: (stage) => events.push(stage),
            }),
          };
        if (name === "./main.cjs") {
          events.push("main");
          if (failMain) throw Error("Modul fehlt");
          return;
        }
        throw Error("Unexpected module " + name);
      },
      process: {
        env: {},
        argv: [],
        platform: "win32",
        arch: "x64",
        versions: { electron: "44.2.0" },
        on: (event, fn) => (handlers[event] = fn),
      },
      global: {},
    },
  );
  return { events, handlers };
}

test("Zweiter Programmstart beendet sich ohne weitere Initialisierung", () => {
  const { events } = bootstrap({ lock: false });
  assert.deepEqual(events, ["bootstrap", "instance.forwarded", "quit"]);
});

test("Fehlendes Startmodul erzeugt eine Fehlermeldung mit Logpfad", () => {
  const { events } = bootstrap({ failMain: true });
  assert.ok(events.includes("bootstrap.failed"));
  const d = events.find((e) => Array.isArray(e) && e[0] === "dialog");
  assert.match(d[2], /Modul fehlt/);
  assert.match(d[2], /start.log/);
  assert.ok(
    events.some((e) => Array.isArray(e) && e[0] === "exit" && e[1] === 1),
  );
});

test("Nicht behandelte Start-Promise wird sichtbar statt lautlos beendet", () => {
  const { events, handlers } = bootstrap();
  handlers.unhandledRejection(Error("Start abgebrochen"));
  assert.ok(events.includes("main.rejection"));
  assert.ok(events.some((e) => Array.isArray(e) && e[0] === "dialog"));
});
