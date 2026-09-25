const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Bedingung wurde nicht erfüllt.");
}
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-integration-"));
  let app;
  const errors = [];
  try {
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, KONTOR_TEST: "1", KONTOR_TEST_DIR: dir },
    });
    const p = await app.firstWindow();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.getByLabel(/^PIN(?: oder bisherige Passphrase)?$/).fill("0123");
    await p.getByLabel("PIN wiederholen").fill("0123");
    await p.getByRole("button", { name: "Arbeitsplatz einrichten" }).click();
    await p.getByRole("heading", { name: "Alles im Blick." }).waitFor();
    // Autosave on editing and flush before locking (without a Save button).
    await p.getByRole("button", { name: "Notizen", exact: true }).click();
    await p.getByRole("button", { name: "Neue Notiz", exact: true }).click();
    await p.getByLabel("Titel", { exact: true }).fill("Automatische Sicherung");
    await p
      .getByRole("textbox", { name: "Notiztext", exact: true })
      .fill(
        "# Wichtig\n\n- [ ] Eine Aufgabe\n\n[[Wochenplan]]\n\n`[[Kein Link]]`\n\n<script>window.compromised=true</script>",
      );
    await until(async () => {
      const d = await p.evaluate(() => window.kontor.snapshot());
      return d.note[0]?.body.includes("Wochenplan");
    });
    await p.screenshot({ path: "test-results/editor.png" });
    await p
      .getByRole("textbox", { name: "Notiztext", exact: true })
      .press("End");
    await p
      .getByRole("textbox", { name: "Notiztext", exact: true })
      .press("Enter");
    await p
      .getByRole("textbox", { name: "Notiztext", exact: true })
      .pressSequentially("Letzte Ergänzung");
    await p.evaluate(() => window.kontor.lock());
    await p.getByRole("button", { name: "Kontor entsperren" }).waitFor();
    await p.getByLabel(/^PIN(?: oder bisherige Passphrase)?$/).fill("0123");
    await p.getByRole("button", { name: "Kontor entsperren" }).click();
    await p
      .getByRole("button")
      .filter({ hasText: "Automatische Sicherung" })
      .first()
      .click();
    await p.getByRole("heading", { name: "Automatische Sicherung" }).waitFor();
    assert.equal(await p.evaluate(() => window.compromised), undefined);
    assert.equal(await p.getByRole("link", { name: "Kein Link" }).count(), 0);
    let d = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(d.note.length, 1);
    assert.ok(d.note[0].body.includes("Letzte Ergänzung"));
    const id = d.note[0].id;
    // Checkbox writes Markdown, not just visual state.
    await p.locator(".markdown input[type=checkbox]").check();
    await until(async () => {
      const s = await p.evaluate(() => window.kontor.snapshot());
      return s.note[0].body.includes("- [x]");
    });
    // Folder CRUD in the UI.
    await p
      .getByRole("button", { name: "Ordner verwalten", exact: true })
      .click();
    await p.getByLabel("Ordnername", { exact: true }).fill("Konferenzen");
    await p.getByRole("button", { name: "Ordner anlegen" }).click();
    await p.getByRole("button", { name: "Konferenzen bearbeiten" }).waitFor();
    await p.getByRole("button", { name: "Fertig", exact: true }).click();
    // Archive/reactivate and pin.
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.getByRole("button", { name: "Loslösen", exact: true }).waitFor();
    await p.getByRole("button", { name: "Archivieren", exact: true }).click();
    await p.getByRole("button", { name: "Archiv", exact: true }).click();
    await p
      .getByRole("button")
      .filter({ hasText: "Automatische Sicherung" })
      .first()
      .click();
    await p.getByRole("button", { name: "Reaktivieren", exact: true }).click();
    await p.getByRole("button", { name: "Aktiv", exact: true }).click();
    await p
      .getByRole("button")
      .filter({ hasText: "Automatische Sicherung" })
      .first()
      .click();
    // Native attachment picker and preview against a test-only fixture.
    const png = path.join(dir, "bild.png");
    fs.copyFileSync("resources/icon.png", png);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, png);
    await p.getByRole("button", { name: "Hinzufügen", exact: true }).click();
    await p.getByRole("button").filter({ hasText: "bild.png" }).click();
    await p.getByRole("img", { name: "bild.png" }).waitFor();
    await p.getByRole("button", { name: "Fertig", exact: true }).click();
    // Export PDF using the real renderer and filesystem path chosen by a stubbed native dialog.
    const pdf = path.join(dir, "test.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pdf);
    assert.equal(
      await p.evaluate((id) => window.kontor.exportPDF("note", id), id),
      true,
    );
    assert.equal(fs.readFileSync(pdf).subarray(0, 4).toString(), "%PDF");
    assert.ok(fs.statSync(pdf).size > 1000);
    // Backup, delete, restore, including attachment.
    const backup = path.join(dir, "test.kontorbackup");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, backup);
    assert.equal(await p.evaluate(() => window.kontor.backup()), true);
    await p.evaluate(
      (id) => window.kontor.command("delete", { kind: "note", id }),
      id,
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showMessageBox = async () => ({ response: 1 });
    }, backup);
    assert.equal(await p.evaluate(() => window.kontor.restore("0123")), true);
    d = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(d.note.length, 1);
    assert.equal(d.attachments.length, 1);
    // Renderer cannot access Node; content has no network access.
    assert.equal(await p.evaluate(() => typeof window.require), "undefined");
    assert.equal(await p.evaluate(() => typeof window.process), "undefined");
    assert.equal(
      await p.evaluate(() =>
        fetch("https://example.com")
          .then(() => true)
          .catch(() => false),
      ),
      false,
    );
    // Postpone a task via the quick buttons and the date picker.
    const task = await p.evaluate(() =>
      window.kontor.command("save", {
        kind: "todo",
        item: { title: "Elternbrief verschicken", dueDate: new Date().toISOString() },
      }),
    );
    await p.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await p
      .getByRole("button")
      .filter({ hasText: "Elternbrief verschicken" })
      .first()
      .click();
    const dueOf = () =>
      p.evaluate(
        async (id) => {
          const t = (await window.kontor.snapshot()).todo.find((x) => x.id === id);
          const d = new Date(t.dueDate);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        },
        task.id,
      );
    const localDay = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    await p.getByRole("button", { name: "Morgen", exact: true }).click();
    await until(async () => (await dueOf()) === localDay(1));
    await p.getByLabel("Auf Datum verschieben").fill(localDay(30));
    await p.getByRole("button", { name: "OK", exact: true }).click();
    await until(async () => (await dueOf()) === localDay(30));
    await p.screenshot({ path: "test-results/postpone.png" });
    await p.getByRole("button", { name: "Einstellungen", exact: true }).click();
    // Morning show: opt-in, only on the first wake of a new day.
    const morningToggle = p.getByLabel("Kontor morgens anzeigen", { exact: true });
    assert.equal(await morningToggle.isChecked(), false);
    await morningToggle.click();
    await until(async () =>
      p.evaluate(async () => (await window.kontor.status()).settings.morningShow === true),
    );
    await p.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const wake = (event, day) =>
      app.evaluate(
        ({ BrowserWindow, powerMonitor }, [event, day]) => {
          if (day) process.env.KONTOR_TEST_DAY = day;
          BrowserWindow.getAllWindows()[0].hide();
          powerMonitor.emit(event);
          return new Promise((r) =>
            setTimeout(() => r(BrowserWindow.getAllWindows()[0].isVisible()), 300),
          );
        },
        [event, day],
      );
    assert.equal(await wake("resume"), false, "same day stays in background");
    assert.equal(await wake("unlock-screen", "2099-01-01"), true, "new day shows Kontor");
    await p.getByRole("heading", { name: "Alles im Blick." }).waitFor();
    assert.equal(await wake("resume"), false, "only once per day");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await p.getByRole("button", { name: "Einstellungen", exact: true }).click();
    // Conversation types: rename, add with template, template fills new entries.
    await p.getByLabel("Name von Gesprächstyp 5").fill("Vorfallsprotokoll");
    await p.getByRole("button", { name: "Typ hinzufügen" }).click();
    await p.getByLabel("Name von Gesprächstyp 7").fill("Klassenkonferenz");
    await p
      .getByLabel("Vorlage für Klassenkonferenz")
      .fill("## Tagesordnung\n\n## Beschlüsse\n");
    await p.getByRole("button", { name: "Typen speichern" }).click();
    await p.getByText("Gespeichert.", { exact: true }).waitFor();
    await p.screenshot({ path: "test-results/types.png" });
    assert.deepEqual(
      (await p.evaluate(() => window.kontor.snapshot())).types
        .slice(4)
        .map((t) => t.name),
      ["Vorfallsprotokoll", "Sonstiges", "Klassenkonferenz"],
    );
    await p.getByRole("button", { name: "Gespräche", exact: true }).click();
    await p.getByRole("button", { name: "Neues Gespräch" }).click();
    const protocol = p.getByRole("textbox", { name: "Protokoll", exact: true });
    await until(async () => (await protocol.innerText()).includes("Anlass"));
    await p
      .locator(".modal")
      .getByLabel(/^Gesprächstyp/)
      .selectOption("Klassenkonferenz");
    await until(async () => (await protocol.innerText()).includes("Tagesordnung"));
    await p.getByLabel("Betreff", { exact: true }).fill("Konferenz 7b");
    await p.getByLabel("Beteiligte", { exact: true }).fill("Max M.");
    await p.getByLabel("Beteiligte", { exact: true }).press("Enter");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.getByRole("heading", { name: "Konferenz 7b", exact: true }).waitFor();
    // Merge two spellings of the same person.
    await p.evaluate(() =>
      window.kontor.command("save", {
        kind: "note",
        item: { title: "Beobachtung", persons: ["Max Müller"] },
      }),
    );
    await p.getByRole("button", { name: "Personen", exact: true }).click();
    await p.getByRole("button").filter({ hasText: /^M?MMax M\.$/ }).first().click();
    await p
      .getByRole("button", { name: "Umbenennen / zusammenführen" })
      .click();
    await p.getByLabel("Neuer Name").fill("Max Müller");
    await p.getByRole("button", { name: "Übernehmen", exact: true }).click();
    await p.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await p.getByRole("heading", { name: "Max Müller", exact: true }).waitFor();
    await p.screenshot({ path: "test-results/person-merged.png" });
    const merged = await p.evaluate(() => window.kontor.snapshot());
    const konferenz = merged.entry.find((e) => e.subject === "Konferenz 7b");
    assert.equal(konferenz.type, "Klassenkonferenz");
    assert.ok(konferenz.body.includes("Tagesordnung"));
    assert.deepEqual(konferenz.participants, ["Max Müller"]);
    await p.getByRole("button", { name: "Einstellungen", exact: true }).click();
    await p.getByLabel("Farbschema").selectOption("light");
    await p
      .getByRole("button", { name: "Einstellungen speichern", exact: true })
      .click();
    await until(() =>
      p.evaluate(() => document.documentElement.dataset.theme === "light"),
    );
    await p.screenshot({ path: "test-results/settings-light.png" });
    // Automatic backup lands in the (test) Documents folder and can be switched off.
    const autoDir = path.join(dir, "Dokumente", "Kontor-Sicherungen");
    const autoFiles = fs.readdirSync(autoDir);
    assert.equal(autoFiles.length, 1);
    assert.match(autoFiles[0], /^Kontor-Auto-\d{4}-\d{2}-\d{2}\.kontorbackup$/);
    const toggle = p.getByLabel("Automatische Sicherung", { exact: true });
    assert.equal(await toggle.isChecked(), true);
    await p.getByText(autoDir, { exact: false }).waitFor();
    await toggle.click();
    await until(async () =>
      p.evaluate(async () => (await window.kontor.status()).settings.autoBackup === false),
    );
    assert.equal(
      await p.evaluate(async () => (await window.kontor.status()).settings.theme),
      "light",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Integration passed: autosave + lock flush, Markdown safety, checkbox, folders, archive, pin, attachments, PDF, backup/restore, automatic backup, postpone, morning show, types and templates, person merge, theme, IPC isolation.",
    );
  } finally {
    await app?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
