const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-native-start-"));
  let app;
  try {
    app = await electron.launch({
      args: [process.env.KONTOR_APP_PATH || "."],
      env: {
        ...process.env,
        KONTOR_TEST: "1",
        KONTOR_TEST_DIR: dir,
        KONTOR_TEST_NATIVE: "1",
      },
    });
    const page = await app.firstWindow();
    await page.getByLabel(/^PIN(?: oder bisherige Passphrase)?$/).waitFor();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
      true,
    );
    assert.equal(await page.locator("#boot-status").isVisible(), false);
    const logs = fs
      .readFileSync(path.join(dir, "start.log"), "utf8")
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s).stage);
    assert.ok(logs.includes("bootstrap"));
    assert.ok(logs.includes("renderer.connected"));
    assert.ok(logs.includes("tray.ready"));
    assert.ok(logs.indexOf("window.created") < logs.indexOf("tray.ready"));
    // Native second-instance activation should also restore a minimized window.
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].minimize();
      app.emit("second-instance", {}, [], process.cwd());
    });
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMinimized(),
      ),
      false,
    );
    console.log(
      "Native startup passed: visible window, tray, startup log, preload/renderer, minimized-window restore.",
    );
  } finally {
    await app?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
