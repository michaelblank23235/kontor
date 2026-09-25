const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const init = require("sql.js");
const JSZip = require("jszip");
const { Repository } = require("../electron/repository.cjs");
const { markdownFor, docxFor, exportAll } = require("../electron/exporter.cjs");
async function setup() {
  const SQL = await init();
  const r = new Repository(new SQL.Database());
  const e = r.save("entry", {
    subject: "Lernentwicklung Tim",
    type: "Elterngespräch",
    date: "2026-09-10T08:30:00.000Z",
    confidentiality: "Sensibel",
    participants: ["Frau Petersen", "Tim"],
    body: "## Anlass\n\nNoten **deutlich** schlechter.\n\n- [x] Hausaufgaben besprochen\n- Förderplan",
    agreements: [
      { text: "Rückmeldung", responsible: "Klassenleitung", dueDate: "2026-09-20T12:00:00.000Z" },
    ],
  });
  const f = r.save("folder", { name: "Konferenzen" });
  const n = r.save("note", {
    title: "Notizen: 7b?",
    body: "# Punkte\n\nText",
    folderId: f.id,
    tags: ["Klasse"],
    persons: ["Tim"],
  });
  r.attachment(n.id, "plan.pdf", "application/pdf", Buffer.from("%PDF-1"));
  r.save("todo", { title: "Zeugnisse", dueDate: "2026-09-30T12:00:00.000Z" });
  r.save("inbox", { text: "Idee für den Elternabend\nmehr Text" });
  return { r, e, n };
}
test("Markdown enthält Metadaten, Protokoll und Vereinbarungen", async () => {
  const { r, e, n } = await setup();
  const md = markdownFor(r, "entry", e.id);
  assert.match(md, /^# Lernentwicklung Tim/);
  assert.match(md, /\*\*Typ:\*\* Elterngespräch/);
  assert.match(md, /\*\*Vertraulichkeit:\*\* Sensibel/);
  assert.match(md, /\*\*Beteiligte:\*\* Frau Petersen, Tim/);
  // Body headings stay below the title level.
  assert.match(md, /^## Anlass$/m);
  assert.match(markdownFor(r, "note", n.id), /^## Punkte$/m);
  assert.match(md, /- Rückmeldung · Klassenleitung · bis 20\.9\.2026/);
  assert.match(markdownFor(r, "note", n.id), /\*\*Ordner:\*\* Konferenzen/);
  const person = markdownFor(r, "person", "Tim");
  assert.match(person, /^# Personenakte: Tim/);
  assert.match(person, /^### Lernentwicklung Tim$/m);
  assert.match(person, /^#### Anlass$/m);
  assert.match(person, /^### Notizen: 7b\?$/m);
  assert.match(person, /^#### Punkte$/m);
});
test("Word-Datei ist gültig und enthält den Text", async () => {
  const { r, e } = await setup();
  const bytes = await docxFor(markdownFor(r, "entry", e.id));
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  const xml = await (await JSZip.loadAsync(bytes))
    .file("word/document.xml")
    .async("string");
  for (const s of ["Lernentwicklung Tim", "Anlass", "deutlich", "☑ ", "Förderplan", "Vereinbarungen"])
    assert.ok(xml.includes(s), s);
  assert.ok(!xml.includes("**"), "Markdown-Sternchen bleiben nicht stehen");
});
test("Gesamtexport schreibt lesbare Ordnerstruktur samt Anhängen", async (t) => {
  const { r } = await setup();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-export-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, "Kontor-Export");
  // Entry, note, inbox and two tasks (one created by the agreement).
  assert.equal(exportAll(r, target), 5);
  const files = fs
    .readdirSync(target, { recursive: true })
    .map((f) => f.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(files, [
    "Anhänge",
    "Anhänge/Notizen- 7b-",
    "Anhänge/Notizen- 7b-/plan.pdf",
    "Aufgaben.md",
    "Gespräche",
    "Gespräche/2026-09-10 Lernentwicklung Tim.md",
    "Inbox",
    "Inbox/Idee für den Elternabend.md",
    "Notizen",
    "Notizen/Konferenzen",
    "Notizen/Konferenzen/Notizen- 7b-.md",
  ]);
  assert.equal(
    fs.readFileSync(path.join(target, "Anhänge/Notizen- 7b-/plan.pdf"), "utf8"),
    "%PDF-1",
  );
  assert.throws(() => exportAll(r, target), /existiert bereits/);
});
