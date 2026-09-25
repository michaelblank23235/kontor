const { test } = require("node:test");
const assert = require("node:assert/strict");
const init = require("sql.js");
const { Repository, nextDue } = require("../electron/repository.cjs");
async function setup() {
  const SQL = await init();
  return new Repository(new SQL.Database());
}
test("Gespräch bearbeiten erhält ID und aktualisiert Aufgabe ohne Duplikate", async () => {
  const r = await setup();
  const e = r.save("entry", {
    subject: "Fehlzeiten",
    body: "Erstfassung",
    participants: [" Frau Meyer ", "Frau Meyer"],
    agreements: [
      {
        text: "Rückruf",
        responsible: "Leitung",
        dueDate: "2026-09-15T12:00:00.000Z",
      },
    ],
  });
  const task = r.all("todo")[0];
  const edit = r.save("entry", {
    ...e,
    body: "**Ergänzt**",
    participants: ["Herr Müller"],
    agreements: [{ ...e.agreements[0], text: "Termin abstimmen" }],
  });
  assert.equal(edit.id, e.id);
  assert.equal(r.all("entry").length, 1);
  assert.equal(r.all("todo").length, 1);
  assert.equal(r.all("todo")[0].id, task.id);
  assert.equal(r.all("todo")[0].title, "Termin abstimmen");
  assert.deepEqual(edit.participants, ["Herr Müller"]);
});
test("Entfernte Vereinbarung entfernt offene Aufgabe und Verknüpfungen", async () => {
  const r = await setup();
  const e = r.save("entry", { subject: "A", agreements: [{ text: "B" }] });
  const n = r.save("note", { title: "C" });
  const tid = e.agreements[0].taskId;
  r.link("note", n.id, "todo", tid, true);
  r.save("entry", { ...e, agreements: [] });
  assert.equal(r.all("todo").length, 0);
  assert.equal(r.snapshot().links.length, 0);
});
test("Löschen des Gesprächs erhält erledigte Aufgaben ohne Personenbezug", async () => {
  const r = await setup();
  const e = r.save("entry", {
    subject: "Privat",
    agreements: [{ text: "Nachweis" }],
  });
  r.complete(e.agreements[0].taskId);
  r.remove("entry", e.id);
  const t = r.all("todo")[0];
  assert.equal(t.status, "Erledigt");
  assert.equal(t.entryId, null);
  assert.equal(t.agreementId, null);
  assert.equal(r.all("entry").length, 0);
});
test("Wiederholung ist idempotent und berücksichtigt Monatsende", async () => {
  const r = await setup();
  const t = r.save("todo", {
    title: "Monatsbericht",
    dueDate: "2026-01-31T12:00:00.000Z",
    recurrence: "Monatlich",
  });
  r.complete(t.id);
  r.complete(t.id);
  assert.equal(r.all("todo").length, 2);
  assert.equal(
    r
      .all("todo")
      .find((x) => x.status === "Offen")
      .dueDate.slice(0, 10),
    "2026-02-28",
  );
  assert.equal(
    nextDue("2024-02-29T12:00:00.000Z", "Jährlich").slice(0, 10),
    "2025-02-28",
  );
});
test("Erledigen im Editor erzeugt ebenfalls nur eine Folgeaufgabe", async () => {
  const r = await setup();
  const t = r.save("todo", {
    title: "Woche",
    dueDate: "2026-09-08T12:00:00.000Z",
    recurrence: "Wöchentlich",
  });
  r.save("todo", { ...t, status: "Erledigt" });
  r.save("todo", { ...t, status: "Erledigt" });
  assert.equal(r.all("todo").length, 2);
});
test("Ordnerzyklen verhindert, Löschen erhält Inhalt und Unterordner", async () => {
  const r = await setup();
  const a = r.save("folder", { name: "A" }),
    b = r.save("folder", { name: "B", parentId: a.id });
  const n = r.save("note", { title: "Notiz", folderId: b.id });
  assert.throws(
    () => r.save("folder", { ...a, parentId: b.id }),
    /sich selbst/,
  );
  r.remove("folder", b.id);
  assert.equal(r.get("note", n.id).folderId, a.id);
  r.remove("folder", a.id);
  assert.equal(r.get("note", n.id).folderId, null);
});
test("Verknüpfungen sind beidseitig eindeutig und werden mitgelöscht", async () => {
  const r = await setup();
  const e = r.save("entry", { subject: "A" }),
    n = r.save("note", { title: "B" });
  r.link("entry", e.id, "note", n.id, true);
  r.link("note", n.id, "entry", e.id, true);
  assert.equal(r.snapshot().links.length, 1);
  r.remove("note", n.id);
  assert.equal(r.snapshot().links.length, 0);
});
test("Inbox-Konvertierung und Speichern sind atomar", async () => {
  const r = await setup();
  const inbox = r.save("inbox", { text: "Wichtig" });
  assert.throws(() =>
    r.transaction(() =>
      r.command("convertInbox", {
        id: inbox.id,
        kind: "todo",
        item: { title: "" },
      }),
    ),
  );
  assert.equal(r.all("inbox").length, 1);
  r.transaction(() =>
    r.command("convertInbox", {
      id: inbox.id,
      kind: "todo",
      item: { title: "Rückruf" },
    }),
  );
  assert.equal(r.all("inbox").length, 0);
  assert.equal(r.all("todo").length, 1);
});
test("Fehler beim Schreiben rollt auch bereits bestätigte SQL-Änderungen zurück", async () => {
  const r = await setup();
  assert.throws(() =>
    r.transaction(
      () => r.save("entry", { subject: "A", agreements: [{ text: "B" }] }),
      () => {
        throw Error("Speicher voll");
      },
    ),
  );
  assert.equal(r.all("entry").length, 0);
  assert.equal(r.all("todo").length, 0);
});
test("Anhänge werden gespeichert und beim Notizlöschen entfernt", async () => {
  const r = await setup();
  const n = r.save("note", { title: "PDF" });
  r.attachment(n.id, "test.pdf", "application/pdf", Buffer.from("%PDF-1.7"));
  assert.equal(r.snapshot().attachments[0].byteCount, 8);
  r.remove("note", n.id);
  assert.equal(r.snapshot().attachments.length, 0);
});
