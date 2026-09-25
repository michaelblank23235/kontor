const { test } = require("node:test");
const assert = require("node:assert/strict");
const init = require("sql.js");
const { Repository, nextDue } = require("../electron/repository.cjs");
async function setup() {
  const SQL = await init();
  return new Repository(new SQL.Database());
}
test("Gesprächstypen: Standard, Umbenennen zieht Gespräche mit, entfernte Typen bleiben erhalten", async () => {
  const r = await setup();
  assert.equal(r.types()[0].name, "Elterngespräch");
  assert.match(r.types()[4].template, /Was ist passiert/);
  const e = r.save("entry", { subject: "Streit", type: "Vorfall" });
  const t = r.save("entry", { subject: "Anruf", type: "Telefonat" });
  r.saveTypes([
    { name: "Vorfallsprotokoll", template: "## Hergang\n", previous: "Vorfall" },
    { name: "Klassenkonferenz", template: "" },
  ]);
  assert.deepEqual(
    r.types().map((x) => x.name),
    ["Vorfallsprotokoll", "Klassenkonferenz"],
  );
  assert.equal(r.get("entry", e.id).type, "Vorfallsprotokoll");
  // "Telefonat" no longer exists, but the old entry keeps it and stays editable.
  assert.equal(r.save("entry", { ...t, body: "Neu" }).type, "Telefonat");
  assert.throws(() => r.save("entry", { subject: "X", type: "Telefonat" }));
  assert.equal(r.save("entry", { subject: "Y" }).type, "Vorfallsprotokoll");
  assert.throws(() => r.saveTypes([]), /mindestens einen/);
  assert.throws(() => r.saveTypes([{ name: " " }]), /Namen/);
  assert.throws(
    () => r.saveTypes([{ name: "A" }, { name: "a" }]),
    /doppelt/,
  );
});
test("Person umbenennen und zusammenführen", async () => {
  const r = await setup();
  const e = r.save("entry", {
    subject: "Elternabend",
    participants: ["Max M.", "Frau Meyer", "Max Müller"],
    agreements: [{ text: "Rückmeldung", responsible: "Max M." }],
  });
  const n = r.save("note", { title: "Beobachtung", persons: ["Max M."] });
  assert.equal(r.renamePerson("Max M.", "Max Müller"), 2);
  const after = r.get("entry", e.id);
  assert.deepEqual(after.participants, ["Max Müller", "Frau Meyer"]);
  assert.equal(after.agreements[0].responsible, "Max Müller");
  assert.match(r.get("todo", after.agreements[0].taskId).note, /Verantwortlich: Max Müller/);
  assert.deepEqual(r.get("note", n.id).persons, ["Max Müller"]);
  assert.throws(() => r.renamePerson("Niemand", "X"), /nicht gefunden/);
  assert.throws(() => r.renamePerson("Frau Meyer", " "), /Namen/);
});
test("Verschieben: ohne Datum eine Woche, mit Datum genau dorthin", async () => {
  const r = await setup();
  const t = r.save("todo", {
    title: "Zeugnisnoten",
    dueDate: "2026-09-15T12:00:00.000Z",
  });
  const week = r.command("postpone", { id: t.id });
  assert.equal(week.dueDate, "2026-09-22T12:00:00.000Z");
  const fixed = r.command("postpone", {
    id: t.id,
    dueDate: "2026-10-05T10:00:00.000Z",
  });
  assert.equal(fixed.dueDate, "2026-10-05T10:00:00.000Z");
  assert.equal(fixed.status, "Offen");
  assert.throws(
    () => r.command("postpone", { id: t.id, dueDate: "kein Datum" }),
    /Ungültiges Datum/,
  );
});
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
