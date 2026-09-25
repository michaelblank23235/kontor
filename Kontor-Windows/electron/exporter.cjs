// Markdown is the common export format; Word files are built from it.
const fs = require("node:fs");
const path = require("node:path");
const docx = require("docx");

const dateDe = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "");
const timeDe = (d) =>
  new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const line = (label, value) => (value ? `**${label}:** ${value}` : null);
const meta = (...lines) => lines.filter(Boolean).join("  \n");
// Bodies are written below an H1 title; keep them below the title at any level.
const demote = (md, level = 1) =>
  (md || "").replace(
    /^(#{1,6}) /gm,
    (_m, h) => "#".repeat(Math.min(Math.max(h.length + level - 1, level + 1), 6)) + " ",
  );

function entryMd(e, level = 1) {
  const h = "#".repeat(level);
  return [
    `${h} ${e.subject || "Ohne Betreff"}`,
    meta(
      line("Datum", `${dateDe(e.date)}, ${timeDe(e.date)} Uhr`),
      line("Typ", e.type),
      e.confidentiality === "Sensibel" && line("Vertraulichkeit", "Sensibel"),
      line("Beteiligte", e.participants.join(", ")),
      e.archivedAt && line("Status", "Archiviert"),
    ),
    demote(e.body, level).trim(),
    e.agreements.length &&
      `${h}# Vereinbarungen\n\n` +
        e.agreements
          .map(
            (a) =>
              `- ${a.text}` +
              [a.responsible, a.dueDate && `bis ${dateDe(a.dueDate)}`]
                .filter(Boolean)
                .map((x) => ` · ${x}`)
                .join(""),
          )
          .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
function noteMd(n, level = 1, folder = "") {
  return [
    `${"#".repeat(level)} ${n.title || "Ohne Titel"}`,
    meta(
      line("Stand", dateDe(n.updatedAt)),
      line("Ordner", folder),
      line("Schlagworte", n.tags.map((t) => "#" + t).join(" ")),
      line("Personen", n.persons.join(", ")),
      n.archivedAt && line("Status", "Archiviert"),
    ),
    demote(n.body, level).trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
function todoMd(t, level = 1) {
  return [
    `${"#".repeat(level)} ${t.title}`,
    meta(
      line("Status", t.status),
      line("Frist", t.dueDate ? dateDe(t.dueDate) : "Ohne Frist"),
      t.recurrence !== "Keine" && line("Wiederholung", t.recurrence),
      t.archivedAt && line("Archiv", "Ja"),
    ),
    demote(t.note, level).trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
function folderPath(repo, id) {
  const parts = [];
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const f = repo.get("folder", id);
    if (!f) break;
    parts.unshift(f.name);
    id = f.parentId;
  }
  return parts;
}
function markdownFor(repo, kind, key) {
  if (kind === "person") {
    const entries = repo
      .all("entry")
      .filter((e) => e.participants.includes(key))
      .sort((a, b) => a.date.localeCompare(b.date));
    const notes = repo.all("note").filter((n) => n.persons.includes(key));
    return [
      `# Personenakte: ${key}`,
      entries.length && "## Gespräche",
      ...entries.map((e) => entryMd(e, 3)),
      notes.length && "## Notizen",
      ...notes.map((n) => noteMd(n, 3)),
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  const item = repo.require(kind, key);
  if (kind === "entry") return entryMd(item);
  if (kind === "note")
    return noteMd(item, 1, folderPath(repo, item.folderId).join(" / "));
  if (kind === "todo") return todoMd(item);
  throw Error("Ungültiger Export.");
}

// Inline **bold**, *italic*, `code` and [[wikilinks]]; everything else stays text.
function runs(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(new docx.TextRun(text.slice(last, m.index)));
    const t = m[0];
    if (t.startsWith("**")) out.push(new docx.TextRun({ text: t.slice(2, -2), bold: true }));
    else if (t.startsWith("`"))
      out.push(new docx.TextRun({ text: t.slice(1, -1), font: "Consolas" }));
    else if (t.startsWith("[[")) out.push(new docx.TextRun(t.slice(2, -2)));
    else out.push(new docx.TextRun({ text: t.slice(1, -1), italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new docx.TextRun(text.slice(last)));
  return out;
}
const headings = [
  docx.HeadingLevel.TITLE,
  docx.HeadingLevel.HEADING_1,
  docx.HeadingLevel.HEADING_2,
  docx.HeadingLevel.HEADING_3,
  docx.HeadingLevel.HEADING_4,
  docx.HeadingLevel.HEADING_5,
];
function paragraphs(md) {
  const out = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    // Markdown hard breaks ("  \n") become line breaks inside one paragraph.
    const children = [];
    para.forEach((l, i) => {
      if (i) children.push(new docx.TextRun({ break: 1 }));
      children.push(...runs(l.replace(/ {2}$/, "")));
    });
    out.push(new docx.Paragraph({ children, spacing: { after: 120 } }));
    para = [];
  };
  let code = false;
  for (const raw of md.split(/\r?\n/)) {
    if (/^```/.test(raw)) {
      flush();
      code = !code;
      continue;
    }
    if (code) {
      out.push(
        new docx.Paragraph({ children: [new docx.TextRun({ text: raw, font: "Consolas" })] }),
      );
      continue;
    }
    const h = raw.match(/^(#{1,6}) (.*)$/);
    const task = raw.match(/^\s*[-*] \[( |x|X)\] (.*)$/);
    const bullet = raw.match(/^(\s*)[-*+] (.*)$/);
    const number = raw.match(/^\s*(\d+)[.)] (.*)$/);
    if (!raw.trim()) flush();
    else if (h) {
      flush();
      out.push(
        new docx.Paragraph({
          heading: headings[Math.min(h[1].length - 1, 5)],
          children: runs(h[2]),
        }),
      );
    } else if (task) {
      flush();
      out.push(
        new docx.Paragraph({
          children: [new docx.TextRun(task[1] === " " ? "☐ " : "☑ "), ...runs(task[2])],
        }),
      );
    } else if (bullet) {
      flush();
      out.push(
        new docx.Paragraph({
          bullet: { level: Math.min(Math.floor(bullet[1].length / 2), 5) },
          children: runs(bullet[2]),
        }),
      );
    } else if (number) {
      flush();
      out.push(new docx.Paragraph({ children: runs(`${number[1]}. ${number[2]}`) }));
    } else para.push(raw);
  }
  flush();
  return out;
}
function docxFor(md) {
  const doc = new docx.Document({
    creator: "Kontor",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: paragraphs(md) }],
  });
  return docx.Packer.toBuffer(doc);
}

const fileSafe = (s) =>
  (s || "Ohne Titel")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/, "")
    .slice(0, 80) || "Ohne Titel";
function uniquePath(dir, name, ext, used) {
  let file = path.join(dir, name + ext);
  for (let i = 2; used.has(file.toLowerCase()); i++)
    file = path.join(dir, `${name} (${i})${ext}`);
  used.add(file.toLowerCase());
  return file;
}
// Writes everything as plain, readable files. Not encrypted by design.
function exportAll(repo, target) {
  if (fs.existsSync(target)) throw Error("Der Exportordner existiert bereits.");
  const used = new Set();
  const write = (dir, name, ext, content) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(uniquePath(dir, name, ext, used), content);
  };
  let count = 0;
  for (const e of repo.all("entry")) {
    write(
      path.join(target, "Gespräche"),
      `${e.date.slice(0, 10)} ${fileSafe(e.subject)}`,
      ".md",
      entryMd(e) + "\n",
    );
    count++;
  }
  for (const n of repo.all("note")) {
    const folders = folderPath(repo, n.folderId);
    const dir = path.join(target, "Notizen", ...folders.map(fileSafe));
    write(dir, fileSafe(n.title), ".md", noteMd(n, 1, folders.join(" / ")) + "\n");
    for (const a of repo.query(
      "SELECT filename,data FROM attachment WHERE noteId=?",
      [n.id],
    )) {
      const ext = path.extname(a.filename);
      write(
        path.join(target, "Anhänge", fileSafe(n.title)),
        fileSafe(path.basename(a.filename, ext)),
        ext,
        Buffer.from(a.data),
      );
    }
    count++;
  }
  const todos = repo
    .all("todo")
    .sort((a, b) => (a.dueDate || "z").localeCompare(b.dueDate || "z"));
  if (todos.length) {
    write(
      target,
      "Aufgaben",
      ".md",
      "# Aufgaben\n\n" + todos.map((t) => todoMd(t, 2)).join("\n\n") + "\n",
    );
    count += todos.length;
  }
  for (const i of repo.all("inbox")) {
    write(path.join(target, "Inbox"), fileSafe(i.text.split("\n")[0]), ".md", i.text + "\n");
    count++;
  }
  return count;
}
module.exports = { markdownFor, docxFor, exportAll, fileSafe };
