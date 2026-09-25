const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-ui-"));
  let app;
  const errors = [];
  fs.mkdirSync("test-results", { recursive: true });
  try {
    app = await electron.launch({
      args: [process.env.KONTOR_APP_PATH || "."],
      env: { ...process.env, KONTOR_TEST: "1", KONTOR_TEST_DIR: dir },
    });
    const p = await app.firstWindow();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.getByLabel(/^PIN(?: oder bisherige Passphrase)?$/).fill("0123");
    await p.getByLabel("PIN wiederholen").fill("0123");
    await p.getByRole("button", { name: "Arbeitsplatz einrichten" }).click();
    await p.getByRole("heading", { name: "Alles im Blick." }).waitFor();
    await p.screenshot({ path: "test-results/dashboard-empty.png" });
    await p.getByRole("button", { name: "Gespräche", exact: true }).click();
    await p.getByRole("button", { name: "Neues Gespräch" }).click();
    await p
      .getByLabel("Betreff", { exact: true })
      .fill("Gespräch zur Lernentwicklung");
    await p.getByLabel("Beteiligte", { exact: true }).fill("Frau Petersen");
    await p.getByLabel("Beteiligte", { exact: true }).press("Enter");
    await p
      .getByRole("textbox", { name: "Protokoll", exact: true })
      .fill("Die nächsten Schritte wurden gemeinsam besprochen.");
    await p.getByRole("button", { name: "Vereinbarung hinzufügen" }).click();
    await p.getByLabel("Vereinbarung 1").fill("Rückmeldung vorbereiten");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "Gespräch zur Lernentwicklung",
        exact: true,
      })
      .waitFor();
    await p.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Protokoll", exact: true })
      .fill("Ergänzt: nächste Woche Rückmeldung.");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p
      .getByText("Ergänzt: nächste Woche Rückmeldung.", { exact: true })
      .last()
      .waitFor();
    let data = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(data.entry.length, 1);
    assert.equal(data.todo.length, 1);
    assert.equal(data.entry[0].body, "Ergänzt: nächste Woche Rückmeldung.");
    await p.getByRole("button", { name: "Notizen", exact: true }).click();
    await p.getByRole("button", { name: "Neue Notiz", exact: true }).click();
    await p.getByLabel("Titel", { exact: true }).fill("Schulleitungsrunde");
    await p
      .getByRole("textbox", { name: "Notiztext", exact: true })
      .fill(
        "# Themen\n\n- [ ] Raumplanung abstimmen\n\nSiehe [[Wochenplanung]].",
      );
    await p.getByLabel("Schlagworte", { exact: true }).fill("Organisation");
    await p.getByLabel("Schlagworte", { exact: true }).press("Enter");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p
      .getByRole("heading", { name: "Schulleitungsrunde", exact: true })
      .waitFor();
    await p.screenshot({ path: "test-results/note.png" });
    await p.getByRole("link", { name: "Wochenplanung", exact: true }).click();
    await p
      .getByRole("heading", { name: "Wochenplanung", exact: true })
      .waitFor();
    data = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(data.note.length, 2);
    await p.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await p
      .getByRole("button")
      .filter({ hasText: "Rückmeldung vorbereiten" })
      .first()
      .click();
    await p.getByRole("button", { name: "Erledigen", exact: true }).click();
    await p
      .locator(".detail-meta")
      .getByText("Erledigt", { exact: true })
      .waitFor();
    data = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(data.todo[0].status, "Erledigt");
    await p.getByRole("button", { name: "Inbox", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Schnellnotiz", exact: true })
      .fill("Material für Montag besorgen");
    await p.getByRole("button", { name: "Festhalten", exact: true }).click();
    await p.getByRole("button", { name: "Als Aufgabe", exact: true }).click();
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "Material für Montag besorgen",
        exact: true,
      })
      .waitFor();
    await p.getByRole("button", { name: "Suche", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Globale Suche" })
      .fill("Frau Petersen");
    await p
      .getByRole("button")
      .filter({ hasText: "Gespräch zur Lernentwicklung" })
      .click();
    await p
      .getByRole("heading", {
        name: "Gespräch zur Lernentwicklung",
        exact: true,
      })
      .waitFor();
    await p.getByRole("button", { name: "Übersicht", exact: true }).click();
    await p.screenshot({ path: "test-results/dashboard-populated.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(980, 620),
    );
    await p.screenshot({ path: "test-results/dashboard-small.png" });
    assert.ok(
      await p
        .getByRole("button", { name: "Kontor sperren", exact: true })
        .isVisible(),
    );
    assert.ok(
      await p
        .getByRole("button", { name: "Kontor sperren", exact: true })
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    );
    await p.getByRole("button", { name: "Einstellungen", exact: true }).click();
    await p.getByLabel("Bisherige PIN oder Passphrase", {exact: true}).fill("0123");
    await p.getByLabel("Neue PIN", {exact: true}).fill("0042");
    await p.getByLabel("Neue PIN wiederholen", {exact: true}).fill("0042");
    await p.getByRole("button", {name: "PIN speichern", exact: true}).click();
    await p.getByText(/PIN gespeichert/).waitFor();
    await p.getByRole("button", {name: "Übersicht", exact: true}).click();
    await p
      .getByRole("button", { name: "Kontor sperren", exact: true })
      .click();
    await p.getByLabel(/^PIN(?: oder bisherige Passphrase)?$/).fill("0042");
    await p
      .getByRole("button", { name: "Kontor entsperren", exact: true })
      .click();
    await p.getByRole("heading", { name: "Alles im Blick." }).waitFor();
    data = await p.evaluate(() => window.kontor.snapshot());
    assert.equal(data.entry.length, 1);
    assert.equal(data.inbox.length, 0);
    assert.equal(data.note.length, 2);
    assert.equal(data.todo.length, 2);
    assert.deepEqual(errors, []);
    console.log(
      "UI smoke passed: unlock, CRUD, edit, agreements, notes, wikilinks, tasks, inbox, search, lock/reopen.",
    );
  } finally {
    await app?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
