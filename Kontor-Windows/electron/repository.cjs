const { randomUUID } = require("node:crypto");
const kinds = ["entry", "note", "todo", "inbox", "folder"];
// Defaults until the user edits the list; stored in meta.entryTypes afterwards.
const defaultTypes = [
  {
    name: "Elterngespräch",
    template:
      "## Anlass\n\n\n## Sichtweise der Eltern\n\n\n## Sichtweise der Schule\n\n\n## Ergebnis\n\n",
  },
  {
    name: "Schülergespräch",
    template:
      "## Anlass\n\n\n## Sichtweise der Schülerin / des Schülers\n\n\n## Ergebnis\n\n",
  },
  {
    name: "Personalgespräch",
    template: "## Anlass\n\n\n## Themen\n\n\n## Ergebnis\n\n",
  },
  { name: "Telefonat", template: "## Anlass\n\n\n## Inhalt\n\n" },
  {
    name: "Vorfall",
    template:
      "## Was ist passiert?\n\n\n## Ort und Zeit\n\n\n## Beteiligte und Zeugen\n\n\n## Sofortmaßnahmen\n\n\n## Weiteres Vorgehen\n\n",
  },
  { name: "Sonstiges", template: "" },
];
const entryTypes = defaultTypes.map((t) => t.name);
const statuses = ["Offen", "Erledigt", "Verschoben"];
const recurrences = ["Keine", "Wöchentlich", "Monatlich", "Jährlich"];
const now = () => new Date().toISOString();
const id = () => randomUUID();
function text(v, limit = 2_000_000) {
  if (typeof v !== "string" || v.length > limit)
    throw Error("Ungültiger Text.");
  return v;
}
function date(v, optional = true) {
  if (optional && !v) return null;
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    throw Error("Ungültiges Datum.");
  return v;
}
function names(v = []) {
  if (!Array.isArray(v) || v.length > 1000)
    throw Error("Ungültige Namensliste.");
  return [
    ...new Map(
      v
        .map((x) => text(x, 300).trim())
        .filter(Boolean)
        .map((x) => [x.toLocaleLowerCase("de"), x]),
    ).values(),
  ];
}
function choice(v, values, fallback) {
  if (v == null) return fallback;
  if (!values.includes(v)) throw Error("Ungültige Auswahl.");
  return v;
}
function nextDue(value, rule) {
  if (!value || rule === "Keine") return null;
  const d = new Date(value);
  const day = d.getDate();
  if (rule === "Wöchentlich") d.setDate(day + 7);
  else {
    d.setDate(1);
    if (rule === "Monatlich") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d.toISOString();
}
class Repository {
  constructor(db) {
    this.db = db;
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS record (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS link (aKind TEXT NOT NULL,aId TEXT NOT NULL,bKind TEXT NOT NULL,bId TEXT NOT NULL,PRIMARY KEY(aKind,aId,bKind,bId));
      CREATE TABLE IF NOT EXISTS attachment (id TEXT PRIMARY KEY,noteId TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS attachments_note ON attachment(noteId);`);
    const version = this.query("SELECT value FROM meta WHERE key=?", [
      "version",
    ])[0]?.value;
    if (version && version !== "1")
      throw Error("Diese Datenbankversion wird nicht unterstützt.");
    db.run("INSERT OR IGNORE INTO meta VALUES ('version','1')");
  }
  query(sql, args = []) {
    const s = this.db.prepare(sql);
    try {
      s.bind(args);
      const out = [];
      while (s.step()) out.push(s.getAsObject());
      return out;
    } finally {
      s.free();
    }
  }
  get(kind, key) {
    return (
      this.query("SELECT data FROM record WHERE kind=? AND id=?", [
        kind,
        key,
      ]).map((r) => JSON.parse(r.data))[0] || null
    );
  }
  all(kind) {
    return this.query("SELECT data FROM record WHERE kind=?", [kind]).map((r) =>
      JSON.parse(r.data),
    );
  }
  put(kind, item) {
    this.db.run("INSERT OR REPLACE INTO record VALUES (?,?,?)", [
      kind,
      item.id,
      JSON.stringify(item),
    ]);
    return item;
  }
  require(kind, key) {
    const item = this.get(kind, key);
    if (!item) throw Error("Der Eintrag wurde nicht gefunden.");
    return item;
  }
  types() {
    const stored = this.query("SELECT value FROM meta WHERE key=?", [
      "entryTypes",
    ])[0]?.value;
    return stored ? JSON.parse(stored) : defaultTypes;
  }
  saveTypes(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50)
      throw Error("Bitte mindestens einen Gesprächstyp anlegen.");
    const seen = new Set();
    const list = raw.map((t) => {
      const name = text(t?.name || "", 60).trim();
      if (!name) throw Error("Jeder Gesprächstyp braucht einen Namen.");
      const key = name.toLocaleLowerCase("de");
      if (seen.has(key)) throw Error(`„${name}“ ist doppelt vorhanden.`);
      seen.add(key);
      return { name, template: text(t.template || "", 20000) };
    });
    // Renamed types carry their previous name so existing entries follow.
    raw.forEach((t, i) => {
      const previous = typeof t.previous === "string" ? t.previous : null;
      if (previous && previous !== list[i].name)
        for (const e of this.all("entry").filter((e) => e.type === previous))
          this.put("entry", { ...e, type: list[i].name });
    });
    this.db.run("INSERT OR REPLACE INTO meta VALUES ('entryTypes',?)", [
      JSON.stringify(list),
    ]);
    return list;
  }
  renamePerson(from, to) {
    from = text(from || "", 300);
    to = text(to || "", 300).trim();
    if (!to) throw Error("Bitte einen Namen eingeben.");
    const swap = (list) => names(list.map((x) => (x === from ? to : x)));
    let changed = 0;
    for (const e of this.all("entry")) {
      const hit =
        e.participants.includes(from) ||
        e.agreements.some((a) => a.responsible === from);
      if (!hit) continue;
      changed++;
      this.put("entry", {
        ...e,
        participants: swap(e.participants),
        agreements: e.agreements.map((a) =>
          a.responsible === from ? { ...a, responsible: to } : a,
        ),
      });
    }
    for (const n of this.all("note").filter((n) => n.persons.includes(from))) {
      changed++;
      this.put("note", { ...n, persons: swap(n.persons) });
    }
    // Tasks created from agreements carry the responsible person in their note.
    const line = `Verantwortlich: ${from}`;
    for (const t of this.all("todo").filter(
      (t) => t.entryId && t.note.split("\n").includes(line),
    ))
      this.put("todo", {
        ...t,
        note: t.note
          .split("\n")
          .map((l) => (l === line ? `Verantwortlich: ${to}` : l))
          .join("\n"),
      });
    if (!changed) throw Error("Diese Person wurde nicht gefunden.");
    return changed;
  }
  snapshot() {
    return {
      ...Object.fromEntries(kinds.map((k) => [k, this.all(k)])),
      types: this.types(),
      links: this.query("SELECT * FROM link"),
      attachments: this.query(
        "SELECT id,noteId,filename,mime,length(data) AS byteCount FROM attachment",
      ),
    };
  }
  transaction(work, persist = () => {}) {
    // Keep a rollback image until the durable file write succeeds.
    const before = this.db.export();
    this.db.run("BEGIN");
    try {
      const result = work();
      this.db.run("COMMIT");
      persist();
      return result;
    } catch (e) {
      try {
        this.db.run("ROLLBACK");
      } catch {}
      const restored = new this.db.constructor(before);
      this.db.close();
      this.db = restored;
      throw e;
    }
  }
  save(kind, raw) {
    if (!kinds.includes(kind) || !raw || typeof raw !== "object")
      throw Error("Ungültiger Eintrag.");
    const old = raw.id ? this.get(kind, text(raw.id, 100)) : null;
    const item = {
      id: old?.id || raw.id || id(),
      createdAt: old?.createdAt || now(),
      archivedAt: old?.archivedAt || null,
    };
    if (kind === "entry") {
      Object.assign(item, {
        subject: text(raw.subject || "", 1000),
        body: text(raw.body || ""),
        date: date(raw.date || now(), false),
        // Entries keep a type that was later removed from the list.
        type:
          raw.type && raw.type === old?.type
            ? old.type
            : choice(
                raw.type,
                this.types().map((t) => t.name),
                this.types()[0].name,
              ),
        confidentiality: choice(
          raw.confidentiality,
          ["Normal", "Sensibel"],
          "Normal",
        ),
        participants: names(raw.participants),
      });
      if (!item.subject.trim() && !item.body.trim())
        throw Error("Bitte Betreff oder Protokoll eingeben.");
      if (
        !Array.isArray(raw.agreements || []) ||
        (raw.agreements || []).length > 1000
      )
        throw Error("Ungültige Vereinbarungen.");
      const seen = new Set();
      item.agreements = (raw.agreements || [])
        .filter((a) => a.text?.trim())
        .map((a) => {
          const previous = old?.agreements?.find((x) => x.id === a.id);
          const aid = previous?.id || id();
          if (seen.has(aid)) throw Error("Doppelte Vereinbarung.");
          seen.add(aid);
          const agreement = {
            id: aid,
            text: text(a.text, 10000),
            responsible: text(a.responsible || "", 300),
            dueDate: date(a.dueDate),
            taskId: previous?.taskId || id(),
          };
          const task = this.get("todo", agreement.taskId);
          this.put("todo", {
            id: agreement.taskId,
            title: agreement.text,
            note: [
              agreement.responsible &&
                `Verantwortlich: ${agreement.responsible}`,
              item.subject && `Aus Gespräch: ${item.subject}`,
            ]
              .filter(Boolean)
              .join("\n"),
            dueDate: agreement.dueDate,
            status: task?.status || "Offen",
            recurrence: task?.recurrence || "Keine",
            createdAt: task?.createdAt || now(),
            completedAt: task?.completedAt || null,
            archivedAt: task?.archivedAt || null,
            entryId: item.id,
            agreementId: aid,
          });
          return agreement;
        });
      for (const a of old?.agreements || [])
        if (!item.agreements.some((x) => x.id === a.id)) {
          const t = this.get("todo", a.taskId);
          if (t?.status === "Offen") this.remove("todo", t.id);
          else if (t) this.put("todo", { ...t, agreementId: null });
        }
    } else if (kind === "todo") {
      Object.assign(item, {
        title: text(raw.title || "", 1000),
        note: text(raw.note || ""),
        dueDate: date(raw.dueDate),
        status: choice(raw.status, statuses, "Offen"),
        recurrence: choice(raw.recurrence, recurrences, "Keine"),
        completedAt: old?.completedAt || null,
        entryId: old?.entryId || null,
        agreementId: old?.agreementId || null,
      });
      if (!item.title.trim())
        throw Error("Bitte einen Aufgabentitel eingeben.");
      // Completion and recurrence share one path, including edits via the status picker.
      if (item.status === "Erledigt" && old?.status !== "Erledigt") {
        item.status = "Offen";
        this.put(kind, item);
        return this.complete(item.id);
      }
      if (item.status !== "Erledigt") item.completedAt = null;
    } else if (kind === "note") {
      const folderId = raw.folderId || null;
      if (folderId) this.require("folder", folderId);
      Object.assign(item, {
        title: text(raw.title || "", 1000),
        body: text(raw.body || ""),
        tags: names(raw.tags),
        persons: names(raw.persons),
        folderId,
        pinnedAt: old?.pinnedAt || null,
        updatedAt: now(),
      });
    } else if (kind === "inbox") {
      item.text = text(raw.text || "");
      if (!item.text.trim()) throw Error("Bitte eine Notiz eingeben.");
    } else {
      const parentId = raw.parentId || null;
      if (parentId) this.require("folder", parentId);
      let parent = parentId;
      const visited = new Set([item.id]);
      while (parent) {
        if (visited.has(parent))
          throw Error(
            "Ein Ordner kann nicht in sich selbst verschoben werden.",
          );
        visited.add(parent);
        parent = this.get("folder", parent)?.parentId;
      }
      Object.assign(item, { name: text(raw.name || "", 150).trim(), parentId });
      if (!item.name) throw Error("Bitte einen Ordnernamen eingeben.");
    }
    return this.put(kind, item);
  }
  complete(key) {
    const task = this.require("todo", key);
    if (task.status === "Erledigt") return task;
    this.put("todo", { ...task, status: "Erledigt", completedAt: now() });
    const dueDate = nextDue(task.dueDate, task.recurrence);
    if (dueDate)
      this.put("todo", {
        ...task,
        id: id(),
        dueDate,
        status: "Offen",
        completedAt: null,
        archivedAt: null,
        createdAt: now(),
        agreementId: null,
      });
    return this.get("todo", key);
  }
  remove(kind, key) {
    const item = this.require(kind, key);
    if (kind === "folder") {
      for (const n of this.all("note").filter((x) => x.folderId === key))
        this.put("note", { ...n, folderId: item.parentId });
      for (const f of this.all("folder").filter((x) => x.parentId === key))
        this.put("folder", { ...f, parentId: item.parentId });
    }
    if (kind === "entry")
      for (const t of this.all("todo").filter((x) => x.entryId === key))
        this.put("todo", { ...t, entryId: null, agreementId: null });
    if (kind === "todo")
      for (const e of this.all("entry")) {
        if (e.agreements.some((a) => a.taskId === key))
          this.put("entry", {
            ...e,
            agreements: e.agreements.map((a) =>
              a.taskId === key ? { ...a, taskId: null } : a,
            ),
          });
      }
    if (kind === "note")
      this.db.run("DELETE FROM attachment WHERE noteId=?", [key]);
    this.db.run(
      "DELETE FROM link WHERE (aKind=? AND aId=?) OR (bKind=? AND bId=?)",
      [kind, key, kind, key],
    );
    this.db.run("DELETE FROM record WHERE kind=? AND id=?", [kind, key]);
  }
  link(aKind, aId, bKind, bId, enabled) {
    if (
      !["entry", "note", "todo"].includes(aKind) ||
      !["entry", "note", "todo"].includes(bKind) ||
      aKind === bKind
    )
      throw Error("Ungültige Verknüpfung.");
    this.require(aKind, aId);
    this.require(bKind, bId);
    if (aKind > bKind) return this.link(bKind, bId, aKind, aId, enabled);
    this.db.run(
      enabled
        ? "INSERT OR IGNORE INTO link VALUES (?,?,?,?)"
        : "DELETE FROM link WHERE aKind=? AND aId=? AND bKind=? AND bId=?",
      [aKind, aId, bKind, bId],
    );
  }
  attachment(noteId, filename, mime, bytes) {
    this.require("note", noteId);
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "application/pdf",
      ].includes(mime)
    )
      throw Error("Bitte ein Bild oder PDF wählen.");
    if (bytes.length > 30 * 1024 * 1024)
      throw Error("Anhänge dürfen höchstens 30 MB groß sein.");
    const key = id();
    this.db.run("INSERT INTO attachment VALUES (?,?,?,?,?)", [
      key,
      noteId,
      text(filename, 255),
      mime,
      bytes,
    ]);
    return key;
  }
  command(command, args = {}) {
    switch (command) {
      case "save":
        return this.save(args.kind, args.item);
      case "delete":
        return this.remove(args.kind, args.id);
      case "archive": {
        if (!["entry", "note", "todo"].includes(args.kind))
          throw Error("Ungültiges Archiv.");
        const item = this.require(args.kind, args.id);
        return this.put(args.kind, {
          ...item,
          archivedAt: args.archived ? now() : null,
        });
      }
      case "pin": {
        const item = this.require("note", args.id);
        return this.put("note", {
          ...item,
          pinnedAt: args.pinned ? now() : null,
        });
      }
      case "complete":
        return this.complete(args.id);
      case "postpone": {
        const t = this.require("todo", args.id);
        // Without an explicit date, keep the original one-week behaviour.
        let dueDate = date(args.dueDate);
        if (!dueDate) {
          const d = new Date(t.dueDate || now());
          d.setDate(d.getDate() + 7);
          dueDate = d.toISOString();
        }
        return this.put("todo", {
          ...t,
          dueDate,
          status: "Offen",
          completedAt: null,
        });
      }
      case "link":
        return this.link(
          args.aKind,
          args.aId,
          args.bKind,
          args.bId,
          args.enabled,
        );
      case "saveTypes":
        return this.saveTypes(args.types);
      case "renamePerson":
        return this.renamePerson(args.from, args.to);
      case "removeAttachment":
        this.db.run("DELETE FROM attachment WHERE id=?", [args.id]);
        return;
      case "convertInbox": {
        const source = this.require("inbox", args.id);
        if (!["entry", "todo", "note"].includes(args.kind))
          throw Error("Ungültiges Ziel.");
        const result = this.save(
          args.kind,
          args.item || {
            subject: source.text.slice(0, 80),
            title: source.text.slice(0, 80),
            body: source.text,
            note: source.text,
          },
        );
        this.remove("inbox", source.id);
        return result;
      }
      default:
        throw Error("Unbekannte Aktion.");
    }
  }
}
module.exports = {
  Repository,
  nextDue,
  entryTypes,
  defaultTypes,
  statuses,
  recurrences,
};
