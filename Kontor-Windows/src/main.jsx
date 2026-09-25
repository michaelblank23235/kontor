import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Search,
  MessagesSquare,
  NotebookPen,
  CheckCheck,
  Users,
  Inbox,
  Settings,
  Plus,
  Lock,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Archive,
  Trash2,
  Pencil,
  FileDown,
  Pin,
  Paperclip,
  Link as LinkIcon,
  Folder,
  FolderPlus,
  X,
  Check,
  CalendarDays,
  Clock,
  Sun,
  Moon,
  MoreHorizontal,
  Download,
  Upload,
  ShieldCheck,
  Keyboard,
  StickyNote,
  ArrowLeft,
  CheckCircle2,
  PanelLeft,
  Tag,
} from "lucide-react";
import { Markdown, MarkdownEditor } from "./Markdown";
import "./style.css";
const api = window.kontor;
const empty = {
  entry: [],
  note: [],
  todo: [],
  inbox: [],
  folder: [],
  links: [],
  attachments: [],
};
const types = [
  "Elterngespräch",
  "Schülergespräch",
  "Personalgespräch",
  "Telefonat",
  "Vorfall",
  "Sonstiges",
];
const recurrences = ["Keine", "Wöchentlich", "Monatlich", "Jährlich"];
const navs = [
  ["dashboard", "Übersicht", LayoutDashboard],
  ["search", "Suche", Search],
  ["entry", "Gespräche", MessagesSquare],
  ["note", "Notizen", NotebookPen],
  ["todo", "Aufgaben", CheckCheck],
  ["person", "Personen", Users],
  ["inbox", "Inbox", Inbox],
];
const fmt = (d, full = false) =>
  d
    ? new Date(d).toLocaleDateString(
        "de-DE",
        full
          ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
          : { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : "Ohne Frist";
const localDate = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const localTime = (d) => {
  const x = new Date(d || Date.now());
  return (
    localDate(x) +
    "T" +
    String(x.getHours()).padStart(2, "0") +
    ":" +
    String(x.getMinutes()).padStart(2, "0")
  );
};
const iso = (d) => (d ? new Date(d + "T12:00:00").toISOString() : null);
const title = (x) => x.subject || x.title || x.text || "Ohne Titel";
const today = () => localDate();
const overdue = (t) =>
  t.status === "Offen" && t.dueDate && localDate(t.dueDate) < today();
const words = (s) => (s || "").toLocaleLowerCase("de");
const matches = (x, q) =>
  words(
    [
      x.subject,
      x.title,
      x.body,
      x.note,
      x.text,
      ...(x.participants || []),
      ...(x.persons || []),
      ...(x.tags || []),
    ].join(" "),
  ).includes(words(q));
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={17} />
    </button>
  );
}
function Empty({ icon: Icon = NotebookPen, title: heading, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h2>{heading}</h2>
      <p>{children}</p>
    </div>
  );
}
function Modal({ title: heading, onClose, children, wide = false }) {
  const root = useRef();
  useEffect(() => {
    function key(e) {
      if ([...document.querySelectorAll(".modal")].at(-1) !== root.current)
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const elements = [
          ...root.current.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[contenteditable=true]",
          ),
        ].filter((x) => x.getClientRects().length);
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="overlay">
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{heading}</h2>
          <IconButton icon={X} label="Schließen" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [status, setStatus] = useState(null),
    [data, setData] = useState(empty),
    [section, setSection] = useState("dashboard"),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [scope, setScope] = useState("Offen"),
    [type, setType] = useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [folder, setFolder] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("updated"),
    [editor, setEditor] = useState(null),
    [linker, setLinker] = useState(null),
    [folderManager, setFolderManager] = useState(false),
    [preview, setPreview] = useState(null),
    [notice, setNotice] = useState(null),
    [confirm, setConfirm] = useState(null),
    [busy, setBusy] = useState(false);
  const refreshSeq = useRef(0);
  const captureMode = location.hash === "#capture";
  async function refresh() {
    const n = ++refreshSeq.current;
    try {
      const s = await api.status();
      const d = s.unlocked ? await api.snapshot() : empty;
      if (n !== refreshSeq.current) return;
      document.documentElement.dataset.kontorReady = "true";
      setStatus(s);
      setData(d);
      if (!s.unlocked) {
        setEditor(null);
        setPreview(null);
        setLinker(null);
        setConfirm(null);
      }
    } catch (e) {
      if (document.documentElement.dataset.kontorReady !== "true") {
        window.dispatchEvent(
          new CustomEvent("kontor-start-failed", { detail: e.message }),
        );
      }
      setNotice({ error: true, text: e.message });
    }
  }
  useEffect(() => {
    if (!api) return;
    refresh();
    return api.onChanged(refresh);
  }, []);
  useEffect(() => {
    const theme = status?.settings.theme || "dark";
    document.documentElement.dataset.theme = theme;
  }, [status?.settings.theme]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  async function run(fn, message) {
    try {
      const result = await fn();
      if (message) setNotice({ text: message });
      return result;
    } catch (e) {
      setNotice({ error: true, text: e.message });
      throw e;
    }
  }
  const action = (fn, message) => run(fn, message).catch(() => {});
  async function command(c, args) {
    return run(async () => {
      const r = await api.command(c, args);
      await refresh();
      return r;
    });
  }
  function navigate(next, item = null) {
    setSection(next);
    setSelected(item?.id || null);
    setArchived(!!item?.archivedAt);
    setQuery("");
    setType("");
    setFrom("");
    setUntil("");
    setFolder("");
    setTag("");
    setScope("Alle");
  }
  function create(kind = section, extra = {}) {
    if (!["entry", "note", "todo"].includes(kind)) kind = "entry";
    setEditor({ kind, item: extra });
  }
  function ask(text, fn) {
    setConfirm({ text, fn });
  }
  async function wiki(t) {
    let n = data.note.find((n) => words(n.title) === words(t));
    if (!n)
      n = await command("save", { kind: "note", item: { title: t, body: "" } });
    navigate("note", n);
  }
  useEffect(() => {
    function key(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "n" && !editor) {
        e.preventDefault();
        create();
      }
      if (e.key === "f" && !editor) {
        e.preventDefault();
        document.querySelector("[data-search]")?.focus();
      }
      if (/^[1-7]$/.test(e.key) && !editor) {
        e.preventDefault();
        navigate(navs[Number(e.key) - 1][0]);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!api)
    return (
      <Empty title="Bitte als Desktop-App starten">
        Kontor benötigt seine lokale Datenbankverbindung.
      </Empty>
    );
  if (!status) return <div className="loading">Kontor wird geöffnet …</div>;
  if (!status.unlocked) return <Unlock status={status} refresh={refresh} />;
  if (captureMode) return <Capture command={command} notice={notice} />;
  const people = [
    ...new Set([
      ...data.entry.flatMap((x) => x.participants),
      ...data.note.flatMap((x) => x.persons),
    ]),
  ].sort((a, b) => a.localeCompare(b, "de"));
  const item = (data[section] || []).find((x) => x.id === selected);
  const heading = navs.find((n) => n[0] === section)?.[1] || "Einstellungen";
  const filtered = (data[section] || [])
    .filter((x) => !!x.archivedAt === archived && matches(x, query))
    .filter((x) => {
      if (section === "entry")
        return (
          (!type || x.type === type) &&
          (!from || localDate(x.date) >= from) &&
          (!until || localDate(x.date) <= until)
        );
      if (section === "note") {
        let f = x.folderId;
        const parents = new Set();
        while (f && !parents.has(f)) {
          parents.add(f);
          f = data.folder.find((z) => z.id === f)?.parentId;
        }
        return (
          (!folder ||
            (folder === "none" ? !x.folderId : parents.has(folder))) &&
          (!tag || x.tags.includes(tag))
        );
      }
      if (section === "todo") {
        if (scope === "Offen") return x.status !== "Erledigt";
        if (scope === "Erledigt") return x.status === "Erledigt";
        if (scope === "Überfällig") return overdue(x);
        if (scope === "Heute")
          return (
            x.status !== "Erledigt" &&
            x.dueDate &&
            localDate(x.dueDate) === today()
          );
        if (scope === "Diese Woche") {
          const end = new Date();
          end.setDate(end.getDate() + 7);
          return (
            x.status !== "Erledigt" &&
            x.dueDate &&
            localDate(x.dueDate) >= today() &&
            localDate(x.dueDate) <= localDate(end)
          );
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (section === "note") {
        if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
        return sort === "title"
          ? title(a).localeCompare(title(b), "de")
          : b[sort === "created" ? "createdAt" : "updatedAt"].localeCompare(
              a[sort === "created" ? "createdAt" : "updatedAt"],
            );
      }
      if (section === "todo")
        return (a.dueDate || "z").localeCompare(b.dueDate || "z");
      return (b.date || b.createdAt).localeCompare(a.date || a.createdAt);
    });
  const destroy = () =>
    ask(
      "Diesen Eintrag endgültig löschen? Diese Aktion lässt sich nicht rückgängig machen. Zugehörige Aufgaben bleiben beim Löschen eines Gesprächs ohne Ursprungsverknüpfung erhalten.",
      async () => {
        await command("delete", { kind: section, id: item.id });
        setSelected(null);
      },
    );
  const tools = {
    data,
    navigate,
    command,
    action,
    create,
    wiki,
    setEditor,
    setLinker,
    setPreview,
    ask,
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>kontor</strong>
            <small>Raum für Ihren Alltag</small>
          </div>
        </div>
        <div className="workspace-label">ARBEITSPLATZ</div>
        <nav>
          {navs.map(([key, name, Icon], i) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => navigate(key)}
              title={`Strg+${i + 1}`}
            >
              <Icon size={19} />
              <span>{name}</span>
              {key === "inbox" && data.inbox.length > 0 && (
                <b className="nav-count">{data.inbox.length}</b>
              )}
              {key === "todo" &&
                data.todo.filter((x) => !x.archivedAt && overdue(x)).length >
                  0 && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="capture-button"
            onClick={() => action(() => api.capture())}
          >
            <Plus size={17} />
            <span>Schnellerfassung</span>
          </button>
          <div className="sidebar-rule" />
          <button
            className={section === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            <span>Einstellungen</span>
          </button>
          <button onClick={() => action(() => api.lock())}>
            <Lock size={17} />
            <span>Kontor sperren</span>
          </button>
          <div className="local-status">
            <span /> Lokal & privat
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Mein Kontor
            <ChevronRight size={14} />
            <span>{heading}</span>
          </div>
          <div className="top-actions">
            <span className="today-label">{fmt(new Date(), true)}</span>
            {["entry", "note", "todo"].includes(section) && (
              <button className="primary" onClick={() => create()}>
                <Plus size={16} />
                {section === "entry"
                  ? "Neues Gespräch"
                  : section === "note"
                    ? "Neue Notiz"
                    : "Neue Aufgabe"}
              </button>
            )}
          </div>
        </header>
        {section === "dashboard" ? (
          <Dashboard {...tools} />
        ) : section === "settings" ? (
          <SettingsPanel status={status} action={action} refresh={refresh} />
        ) : section === "inbox" ? (
          <InboxPanel {...tools} />
        ) : section === "person" ? (
          <Persons people={people} {...tools} />
        ) : section === "search" ? (
          <SearchPanel query={query} setQuery={setQuery} {...tools} />
        ) : (
          <div className="split">
            <section className="list-pane">
              <div className="list-heading">
                <h1>{heading}</h1>
                <span>{filtered.length}</span>
              </div>
              <div className="list-controls">
                <div className="search-input">
                  <Search size={16} />
                  <input
                    data-search
                    aria-label="Durchsuchen"
                    placeholder={`${heading} durchsuchen …`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="segments">
                  <button
                    className={!archived ? "active" : ""}
                    onClick={() => setArchived(false)}
                  >
                    Aktiv
                  </button>
                  <button
                    className={archived ? "active" : ""}
                    onClick={() => setArchived(true)}
                  >
                    Archiv
                  </button>
                </div>
                {section === "entry" && (
                  <>
                    <select
                      aria-label="Gesprächstyp filtern"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="">Alle Gesprächstypen</option>
                      {types.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <details className="filters">
                      <summary>Zeitraum eingrenzen</summary>
                      <label>
                        Von
                        <input
                          type="date"
                          value={from}
                          onChange={(e) => setFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        Bis
                        <input
                          type="date"
                          min={from}
                          value={until}
                          onChange={(e) => setUntil(e.target.value)}
                        />
                      </label>
                      <button
                        onClick={() => {
                          setFrom("");
                          setUntil("");
                        }}
                      >
                        Zurücksetzen
                      </button>
                    </details>
                  </>
                )}
                {section === "todo" && (
                  <select
                    aria-label="Aufgabenbereich"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    {[
                      "Alle",
                      "Offen",
                      "Heute",
                      "Diese Woche",
                      "Überfällig",
                      "Erledigt",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
                {section === "note" && (
                  <>
                    <div className="folder-select">
                      <select
                        aria-label="Ordner filtern"
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                      >
                        <option value="">Alle Ordner</option>
                        <option value="none">Ohne Ordner</option>
                        <FolderOptions folders={data.folder} />
                      </select>
                      <IconButton
                        icon={FolderPlus}
                        label="Ordner verwalten"
                        onClick={() => setFolderManager(true)}
                      />
                    </div>
                    <div className="two-select">
                      <select
                        aria-label="Schlagwort filtern"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                      >
                        <option value="">Alle Schlagworte</option>
                        {[...new Set(data.note.flatMap((x) => x.tags))]
                          .sort()
                          .map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                      </select>
                      <select
                        aria-label="Notizen sortieren"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="updated">Geändert</option>
                        <option value="created">Erstellt</option>
                        <option value="title">Titel</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="record-list">
                {filtered.length === 0 ? (
                  <div className="list-empty">
                    {query
                      ? "Keine passenden Einträge."
                      : "Hier ist noch Platz für Neues."}
                  </div>
                ) : (
                  filtered.map((x, i) => {
                    const month = new Date(
                      x.date || x.createdAt,
                    ).toLocaleDateString("de-DE", {
                      month: "long",
                      year: "numeric",
                    });
                    const prev = i
                      ? new Date(
                          filtered[i - 1].date || filtered[i - 1].createdAt,
                        ).toLocaleDateString("de-DE", {
                          month: "long",
                          year: "numeric",
                        })
                      : "";
                    return (
                      <React.Fragment key={x.id}>
                        {section === "entry" && month !== prev && (
                          <div className="month-label">{month}</div>
                        )}
                        <button
                          className={
                            "record " + (x.id === selected ? "selected" : "")
                          }
                          onClick={() => setSelected(x.id)}
                        >
                          <div className="record-top">
                            <span>
                              {section === "entry"
                                ? x.type
                                : section === "todo"
                                  ? x.status
                                  : fmt(x.updatedAt)}
                            </span>
                            {x.pinnedAt && <Pin size={12} />}
                            <span className={overdue(x) ? "danger" : ""}>
                              {section === "entry"
                                ? fmt(x.date)
                                : section === "todo" && x.dueDate
                                  ? fmt(x.dueDate)
                                  : ""}
                            </span>
                          </div>
                          <strong
                            className={
                              x.status === "Erledigt" ? "completed" : ""
                            }
                          >
                            {title(x)}
                          </strong>
                          <p>
                            {(x.body || x.note || "Noch kein Text")
                              .replace(/[#*`>\[\]]/g, "")
                              .slice(0, 110)}
                          </p>
                          {(x.participants || x.tags || []).length > 0 && (
                            <div className="record-tags">
                              {(x.participants || x.tags)
                                .slice(0, 3)
                                .map((t) => (
                                  <span key={t}>
                                    {section === "note" ? "#" : ""}
                                    {t}
                                  </span>
                                ))}
                            </div>
                          )}
                        </button>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </section>
            <section className="detail-pane">
              {item ? (
                <>
                  <div className="detail-actions">
                    {section === "note" && (
                      <IconButton
                        icon={Pin}
                        label={item.pinnedAt ? "Loslösen" : "Anpinnen"}
                        onClick={() =>
                          action(() =>
                            command("pin", {
                              id: item.id,
                              pinned: !item.pinnedAt,
                            }),
                          )
                        }
                      />
                    )}
                    <button onClick={() => setEditor({ kind: section, item })}>
                      <Pencil size={15} />
                      Bearbeiten
                    </button>
                    <IconButton
                      icon={FileDown}
                      label="PDF exportieren"
                      onClick={() =>
                        action(() => api.exportPDF(section, item.id))
                      }
                    />
                    <IconButton
                      icon={Archive}
                      label={item.archivedAt ? "Reaktivieren" : "Archivieren"}
                      onClick={() =>
                        action(async () => {
                          await command("archive", {
                            kind: section,
                            id: item.id,
                            archived: !item.archivedAt,
                          });
                          setSelected(null);
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="Endgültig löschen"
                      onClick={destroy}
                    />
                  </div>
                  <Detail kind={section} item={item} {...tools} />
                </>
              ) : (
                <Empty
                  icon={
                    section === "entry"
                      ? MessagesSquare
                      : section === "todo"
                        ? CheckCheck
                        : NotebookPen
                  }
                  title="Ein Moment für den Überblick"
                >
                  Wählen Sie links einen Eintrag aus oder legen Sie einen neuen
                  an.
                </Empty>
              )}
            </section>
          </div>
        )}
      </main>
      {notice && (
        <div role="status" className={"toast " + (notice.error ? "error" : "")}>
          <span>{notice.text}</span>
          <IconButton
            icon={X}
            label="Meldung schließen"
            onClick={() => setNotice(null)}
          />
        </div>
      )}
      {editor && (
        <EditDialog
          key={editor.item.id || editor.kind + "-new"}
          {...editor}
          data={data}
          onClose={() => setEditor(null)}
          autosave={!editor.inboxId}
          onPersist={(value) =>
            command("save", { kind: editor.kind, item: value })
          }
          onSave={async (value) => {
            const saved = await command(
              editor.inboxId ? "convertInbox" : "save",
              editor.inboxId
                ? { id: editor.inboxId, kind: editor.kind, item: value }
                : { kind: editor.kind, item: value },
            );
            setEditor(null);
            navigate(editor.kind, saved);
          }}
        />
      )}
      {linker && (
        <LinkDialog
          source={linker}
          {...tools}
          onClose={() => setLinker(null)}
        />
      )}
      {folderManager && (
        <FolderManager
          data={data}
          command={command}
          ask={ask}
          onClose={() => setFolderManager(false)}
        />
      )}
      {preview && (
        <AttachmentPreview
          id={preview}
          action={action}
          onClose={() => setPreview(null)}
        />
      )}
      {confirm && (
        <Modal title="Bitte bestätigen" onClose={() => setConfirm(null)}>
          <div className="modal-body">
            <p>{confirm.text}</p>
          </div>
          <footer>
            <button onClick={() => setConfirm(null)}>Abbrechen</button>
            <button
              className="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await confirm.fn();
                  setConfirm(null);
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Wird ausgeführt …" : "Bestätigen"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
function BrandMark({ large = false }) {
  return (
    <div className={`brand-mark${large ? " large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M11 10H19V38H11V10Z" fill="#f5f3f7" />
        <path d="M21 23V18L29 10H39L26 23H21Z" fill="#d3c5ff" />
        <path d="M21 25H27L40 38H29L21 30V25Z" fill="#f5f3f7" />
      </svg>
    </div>
  );
}
function Unlock({ status, refresh }) {
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="unlock-page">
      <div className="unlock-decoration" />
      <form
        className="unlock-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!status.exists && password !== repeat) {
            setError("Die PINs stimmen nicht überein.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api.unlock(password);
            setPassword("");
            await refresh();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <BrandMark large />
        <span className="eyebrow">IHR PERSÖNLICHER ARBEITSPLATZ</span>
        <h1>
          {status.exists ? "Willkommen zurück." : "Willkommen bei Kontor."}
        </h1>
        <p>
          {status.exists
            ? "Ein klarer Kopf beginnt mit einem guten Überblick. Entsperren Sie Ihren Arbeitsplatz."
            : "Gespräche, Aufgaben und Gedanken an einem Ort. Legen Sie eine vierstellige PIN für Ihren privaten Arbeitsplatz fest."}
        </p>
        <label>
          {status.exists ? "PIN oder bisherige Passphrase" : "PIN"}
          <input
            aria-label={status.exists ? "PIN oder bisherige Passphrase" : "PIN"}
            type="password"
            autoFocus
            autoComplete={status.exists ? "current-password" : "new-password"}
            minLength={status.exists ? 1 : 4}
            maxLength={status.exists ? 1024 : 4}
            inputMode={status.exists ? undefined : "numeric"}
            pattern={status.exists ? undefined : "[0-9]{4}"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {!status.exists && (
          <>
            <label>
              PIN wiederholen
              <input
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            <p className="hint">
              Genau vier Ziffern. Bewahren Sie die PIN sicher auf: Sie wird auch
              zum Wiederherstellen Ihrer Sicherungen benötigt.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy
            ? "Wird geöffnet …"
            : status.exists
              ? "Kontor entsperren"
              : "Arbeitsplatz einrichten"}
          <ArrowUpRight size={17} />
        </button>
        <div className="unlock-footer">
          <ShieldCheck size={15} /> Verschlüsselt gespeichert · Ohne Cloud
        </div>
      </form>
    </div>
  );
}
function FolderOptions({ folders, parent = null, depth = 0, exclude }) {
  return folders
    .filter((f) => f.parentId === parent && f.id !== exclude)
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map((f) => (
      <React.Fragment key={f.id}>
        <option value={f.id}>{"　".repeat(depth) + f.name}</option>
        <FolderOptions
          folders={folders}
          parent={f.id}
          depth={depth + 1}
          exclude={exclude}
        />
      </React.Fragment>
    ));
}
function Chips({ values, prefix = "" }) {
  return (
    <div className="chips">
      {values.map((x) => (
        <span key={x}>
          {prefix}
          {x}
        </span>
      ))}
    </div>
  );
}
function EditDialog({
  kind,
  item,
  data,
  onClose,
  onSave,
  onPersist,
  autosave = true,
}) {
  const [draft, setDraft] = useState(() => ({
    date: new Date().toISOString(),
    type: types[0],
    confidentiality: "Normal",
    subject: "",
    title: "",
    body: "",
    note: "",
    participants: [],
    persons: [],
    tags: [],
    agreements: [],
    dueDate: null,
    status: "Offen",
    recurrence: "Keine",
    folderId: null,
    ...item,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("");
  const noteId = useRef(item.id),
    lastSaved = useRef(null),
    timer = useRef(null),
    queue = useRef(Promise.resolve()),
    current = useRef(draft),
    initial = useRef(JSON.stringify(draft));
  current.current = draft;
  const collectDraft = () => {
    const value = { ...current.current };
    document.querySelectorAll("input[data-token]").forEach((input) => {
      const field = {
        Beteiligte: "participants",
        Personen: "persons",
        Schlagworte: "tags",
      }[input.dataset.token];
      if (field && input.value.trim())
        value[field] = [
          ...new Set([
            ...(value[field] || []),
            ...input.value
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          ]),
        ];
    });
    return value;
  };
  const autoSave = async (value) => {
    if (kind !== "note" || !autosave) return value;
    const serialized = JSON.stringify({ ...value, id: undefined });
    setSaveState("Wird gespeichert …");
    const pending = queue.current
      .catch(() => {})
      .then(async () => {
        if (lastSaved.current === serialized) {
          setSaveState("Automatisch gespeichert");
          return { ...value, id: noteId.current };
        }
        const saved = await onPersist({ ...value, id: noteId.current });
        noteId.current = saved.id;
        lastSaved.current = serialized;
        setSaveState("Automatisch gespeichert");
        setError("");
        return saved;
      });
    queue.current = pending;
    return pending.catch((e) => {
      setSaveState("Nicht gespeichert");
      setError(e.message);
      throw e;
    });
  };
  useEffect(() => {
    if (
      kind !== "note" ||
      !autosave ||
      JSON.stringify(draft) === initial.current
    )
      return;
    timer.current = setTimeout(() => autoSave(draft).catch(() => {}), 650);
    return () => clearTimeout(timer.current);
  }, [draft]);
  useEffect(
    () =>
      api.onFlush(async () => {
        if (
          kind === "note" &&
          autosave &&
          JSON.stringify(collectDraft()) !== initial.current
        ) {
          clearTimeout(timer.current);
          await autoSave(collectDraft());
        }
      }),
    [],
  );
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const people = [
    ...new Set([
      ...data.entry.flatMap((x) => x.participants),
      ...data.note.flatMap((x) => x.persons),
    ]),
  ];
  async function save(e) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      clearTimeout(timer.current);
      const value =
        kind === "note" ? await autoSave(collectDraft()) : collectDraft();
      await onSave(value);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function key(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const close = async () => {
    if (busy) return;
    if (
      kind === "note" &&
      autosave &&
      JSON.stringify(collectDraft()) !== initial.current
    ) {
      setBusy(true);
      clearTimeout(timer.current);
      try {
        await autoSave(collectDraft());
        onClose();
      } catch {
      } finally {
        setBusy(false);
      }
    } else onClose();
  };
  return (
    <Modal
      wide
      title={
        kind === "entry"
          ? item.id
            ? "Gespräch bearbeiten"
            : "Neues Gespräch"
          : kind === "note"
            ? item.id
              ? "Notiz bearbeiten"
              : "Neue Notiz"
            : item.id
              ? "Aufgabe bearbeiten"
              : "Neue Aufgabe"
      }
      onClose={close}
    >
      <form onSubmit={save}>
        <div className="modal-body editor-form">
          <label>
            {kind === "entry" ? "Betreff" : "Titel"}
            <input
              autoFocus
              value={kind === "entry" ? draft.subject : draft.title}
              onChange={(e) =>
                set(kind === "entry" ? "subject" : "title", e.target.value)
              }
              placeholder={
                kind === "entry"
                  ? "Worum geht es in diesem Gespräch?"
                  : kind === "note"
                    ? "Ein Titel für Ihre Gedanken"
                    : "Was ist zu tun?"
              }
              required={kind === "todo"}
            />
          </label>
          {kind === "entry" && (
            <>
              <div className="form-grid three">
                <label>
                  Datum und Uhrzeit
                  <input
                    type="datetime-local"
                    required
                    value={localTime(draft.date)}
                    onChange={(e) => {
                      if (e.target.value)
                        set("date", new Date(e.target.value).toISOString());
                    }}
                  />
                </label>
                <label>
                  Gesprächstyp
                  <select
                    value={draft.type}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    {types.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Vertraulichkeit
                  <select
                    value={draft.confidentiality}
                    onChange={(e) => set("confidentiality", e.target.value)}
                  >
                    <option>Normal</option>
                    <option>Sensibel</option>
                  </select>
                </label>
              </div>
              <TokenField
                label="Beteiligte"
                values={draft.participants}
                setValues={(v) => set("participants", v)}
                suggestions={people}
              />
            </>
          )}
          {kind === "note" && (
            <>
              <label>
                Ordner
                <select
                  value={draft.folderId || ""}
                  onChange={(e) => set("folderId", e.target.value || null)}
                >
                  <option value="">Ohne Ordner</option>
                  <FolderOptions folders={data.folder} />
                </select>
              </label>
              <div className="form-grid">
                <TokenField
                  label="Schlagworte"
                  values={draft.tags}
                  setValues={(v) => set("tags", v)}
                  suggestions={[...new Set(data.note.flatMap((x) => x.tags))]}
                />
                <TokenField
                  label="Personen"
                  values={draft.persons}
                  setValues={(v) => set("persons", v)}
                  suggestions={people}
                />
              </div>
            </>
          )}
          {kind === "todo" && (
            <div className="form-grid three">
              <label>
                Frist (optional)
                <input
                  type="date"
                  value={draft.dueDate ? localDate(draft.dueDate) : ""}
                  onChange={(e) => set("dueDate", iso(e.target.value))}
                />
              </label>
              <label>
                Status
                <select
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {["Offen", "Erledigt", "Verschoben"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Wiederholung
                <select
                  value={draft.recurrence}
                  onChange={(e) => set("recurrence", e.target.value)}
                >
                  {recurrences.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label>
            {kind === "entry"
              ? "Protokoll"
              : kind === "note"
                ? "Notiz"
                : "Beschreibung"}
          </label>
          <MarkdownEditor
            label={
              kind === "entry"
                ? "Protokoll"
                : kind === "note"
                  ? "Notiztext"
                  : "Aufgabenbeschreibung"
            }
            value={kind === "todo" ? draft.note : draft.body}
            onChange={(v) => set(kind === "todo" ? "note" : "body", v)}
            titles={data.note.map((n) => n.title).filter(Boolean)}
          />
          {kind === "entry" && (
            <section className="agreement-edit">
              <div className="section-heading">
                <h3>Vereinbarungen</h3>
                <span>Werden automatisch zu Aufgaben</span>
              </div>
              {draft.agreements.map((a, i) => (
                <div className="agreement-card" key={a.id}>
                  <div className="agreement-line">
                    <input
                      aria-label={`Vereinbarung ${i + 1}`}
                      placeholder="Was wurde vereinbart?"
                      value={a.text}
                      onChange={(e) =>
                        set(
                          "agreements",
                          draft.agreements.map((v, j) =>
                            j === i ? { ...v, text: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <IconButton
                      icon={X}
                      label="Vereinbarung entfernen"
                      onClick={() =>
                        set(
                          "agreements",
                          draft.agreements.filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                  <div className="form-grid">
                    <label>
                      Verantwortlich
                      <input
                        list="people-suggestions"
                        value={a.responsible}
                        onChange={(e) =>
                          set(
                            "agreements",
                            draft.agreements.map((v, j) =>
                              j === i
                                ? { ...v, responsible: e.target.value }
                                : v,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Frist
                      <input
                        type="date"
                        value={a.dueDate ? localDate(a.dueDate) : ""}
                        onChange={(e) =>
                          set(
                            "agreements",
                            draft.agreements.map((v, j) =>
                              j === i
                                ? { ...v, dueDate: iso(e.target.value) }
                                : v,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="subtle"
                onClick={() =>
                  set("agreements", [
                    ...draft.agreements,
                    {
                      id: crypto.randomUUID(),
                      text: "",
                      responsible: "",
                      dueDate: null,
                    },
                  ])
                }
              >
                <Plus size={15} />
                Vereinbarung hinzufügen
              </button>
            </section>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <span className="hint">
            {kind === "note"
              ? autosave
                ? saveState || "Änderungen werden automatisch gespeichert"
                : "Strg + S zum Speichern"
              : "Strg + S zum Speichern"}
          </span>
          <span className="spacer" />
          <button type="button" disabled={busy} onClick={close}>
            {kind === "note" && autosave ? "Schließen" : "Abbrechen"}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Speichern"}
            <Check size={15} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function TokenField({ label, values, setValues, suggestions }) {
  const [input, setInput] = useState("");
  const listId = React.useId();
  function commit(raw) {
    const add = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    setValues([...new Set([...values, ...add])]);
    setInput("");
  }
  return (
    <label>
      {label}
      <div className="token-field">
        {values.map((x) => (
          <span className="token" key={x}>
            {x}
            <button
              type="button"
              aria-label={`${x} entfernen`}
              onClick={() => setValues(values.filter((v) => v !== x))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          data-token={label}
          list={listId}
          value={input}
          placeholder="Name eingeben, Enter …"
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => {
            if (input.trim()) commit(input);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(input);
            }
          }}
        />
      </div>
      <datalist id={listId}>
        {suggestions
          .filter((x) => !values.includes(x))
          .map((x) => (
            <option key={x} value={x} />
          ))}
      </datalist>
    </label>
  );
}
function Detail({
  kind,
  item,
  data,
  command,
  action,
  navigate,
  wiki,
  setLinker,
  setPreview,
  ask,
}) {
  const attachments = data.attachments.filter((a) => a.noteId === item.id);
  const backlinks =
    kind === "note"
      ? data.note.filter(
          (n) =>
            n.id !== item.id &&
            [...n.body.matchAll(/\[\[([^\]\n]+)\]\]/g)].some(
              (m) => words(m[1]) === words(item.title),
            ),
        )
      : [];
  const related = data.links
    .flatMap((l) =>
      l.aKind === kind && l.aId === item.id
        ? [{ kind: l.bKind, id: l.bId }]
        : l.bKind === kind && l.bId === item.id
          ? [{ kind: l.aKind, id: l.aId }]
          : [],
    )
    .map((x) => ({ ...x, item: data[x.kind].find((v) => v.id === x.id) }))
    .filter((x) => x.item);
  if (
    kind === "todo" &&
    item.entryId &&
    !related.some((x) => x.kind === "entry" && x.id === item.entryId)
  ) {
    const origin = data.entry.find((e) => e.id === item.entryId);
    if (origin)
      related.unshift({
        kind: "entry",
        id: origin.id,
        item: origin,
        origin: true,
      });
  }
  async function checkbox(index) {
    let i = -1;
    const body = item.body.replace(
      /^(\s*[-*+]\s+\[)([ xX])(\])/gm,
      (m, a, c, b) => {
        i++;
        return i === index ? a + (c === " " ? "x" : " ") + b : m;
      },
    );
    await command("save", { kind: "note", item: { ...item, body } });
  }
  return (
    <article className="detail">
      <div className="detail-kicker">
        {kind === "entry"
          ? item.type
          : kind === "note"
            ? "NOTIZBUCH"
            : "WIEDERVORLAGE"}
        {item.archivedAt && <span className="badge">Archiviert</span>}
        {item.confidentiality === "Sensibel" && (
          <span className="badge">
            <Lock size={11} />
            Sensibel
          </span>
        )}
      </div>
      <h1>{title(item)}</h1>
      <div className="detail-meta">
        <CalendarDays size={14} />
        {fmt(
          kind === "entry"
            ? item.date
            : kind === "note"
              ? item.updatedAt
              : item.dueDate || item.createdAt,
        )}
        {kind === "entry" &&
          " · " +
            new Date(item.date).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
        {kind === "todo" && (
          <span className={overdue(item) ? "danger" : ""}>
            {overdue(item) ? "Überfällig" : item.status}
            {item.recurrence !== "Keine" ? " · " + item.recurrence : ""}
          </span>
        )}
      </div>
      {kind === "entry" && item.participants.length > 0 && (
        <div className="detail-block">
          <h3>Beteiligte</h3>
          <Chips values={item.participants} />
        </div>
      )}
      {kind === "note" && (
        <>
          {item.tags.length > 0 && <Chips values={item.tags} prefix="#" />}
          {item.persons.length > 0 && (
            <div className="detail-block">
              <h3>Personen</h3>
              <Chips values={item.persons} />
            </div>
          )}
          {item.folderId && (
            <div className="folder-label">
              <Folder size={14} />
              {data.folder.find((f) => f.id === item.folderId)?.name}
            </div>
          )}
        </>
      )}
      {kind === "todo" && item.status !== "Erledigt" && (
        <div className="todo-actions">
          <button
            className="primary"
            onClick={() => action(() => command("complete", { id: item.id }))}
          >
            <Check size={16} />
            Erledigen
          </button>
          <button
            onClick={() => action(() => command("postpone", { id: item.id }))}
          >
            <Clock size={15} />
            Eine Woche verschieben
          </button>
        </div>
      )}
      <div className="prose-section">
        {item.body || item.note ? (
          <Markdown
            value={item.body || item.note}
            onWiki={(t) => action(() => wiki(t))}
            onCheckbox={
              kind === "note" ? (i) => action(() => checkbox(i)) : undefined
            }
          />
        ) : (
          <p className="muted">
            Noch kein Text. Über „Bearbeiten“ können Sie ihn ergänzen.
          </p>
        )}
      </div>
      {kind === "entry" && item.agreements.length > 0 && (
        <div className="detail-block">
          <h3>
            <CheckCheck size={16} /> Vereinbarungen
          </h3>
          {item.agreements.map((a) => {
            const task = data.todo.find((t) => t.id === a.taskId);
            return (
              <button
                className="agreement-display"
                key={a.id}
                disabled={!task}
                onClick={() => navigate("todo", task)}
              >
                <CheckCircle2
                  size={19}
                  className={task?.status === "Erledigt" ? "accent" : "muted"}
                />
                <span>
                  <strong>{a.text}</strong>
                  <small>
                    {[a.responsible, a.dueDate && fmt(a.dueDate), task?.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </div>
      )}
      {kind === "note" && (
        <div className="detail-block">
          <div className="section-heading">
            <h3>
              <Paperclip size={16} /> Anhänge
            </h3>
            <button
              className="subtle"
              onClick={() => action(() => api.addAttachments(item.id))}
            >
              <Plus size={14} />
              Hinzufügen
            </button>
          </div>
          {attachments.length === 0 ? (
            <p className="muted small">
              Bilder und PDF-Dateien direkt bei dieser Notiz aufbewahren.
            </p>
          ) : (
            attachments.map((a) => (
              <div className="attachment-row" key={a.id}>
                <button onClick={() => setPreview(a.id)}>
                  <Paperclip size={17} />
                  <span>
                    {a.filename}
                    <small>
                      {Math.max(1, Math.round(a.byteCount / 1024))} KB
                    </small>
                  </span>
                </button>
                <IconButton
                  icon={Trash2}
                  label="Anhang löschen"
                  onClick={() =>
                    ask("Diesen Anhang endgültig löschen?", () =>
                      command("removeAttachment", { id: a.id }),
                    )
                  }
                />
              </div>
            ))
          )}
        </div>
      )}
      <div className="detail-block">
        <div className="section-heading">
          <h3>
            <LinkIcon size={16} /> Verknüpfungen
          </h3>
          <button
            className="subtle"
            onClick={() => setLinker({ kind, id: item.id })}
          >
            <Plus size={14} />
            Verknüpfen
          </button>
        </div>
        {related.length === 0 ? (
          <p className="muted small">
            Passende Gespräche, Notizen und Aufgaben verbinden.
          </p>
        ) : (
          related.map((r) => (
            <button
              key={r.kind + r.id}
              className="related-row"
              onClick={() => navigate(r.kind, r.item)}
            >
              <span className="badge">
                {r.origin
                  ? "Ursprung"
                  : r.kind === "entry"
                    ? "Gespräch"
                    : r.kind === "todo"
                      ? "Aufgabe"
                      : "Notiz"}
              </span>
              <strong>{title(r.item)}</strong>
              <ChevronRight size={15} />
            </button>
          ))
        )}
      </div>
      {backlinks.length > 0 && (
        <div className="detail-block">
          <h3>Rückverweise</h3>
          {backlinks.map((n) => (
            <button
              key={n.id}
              className="related-row"
              onClick={() => navigate("note", n)}
            >
              <NotebookPen size={15} />
              {title(n)}
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
function Dashboard({ data, navigate, create }) {
  const active = data.todo.filter(
    (t) => !t.archivedAt && t.status !== "Erledigt",
  );
  const late = active.filter(overdue);
  const due = active.filter(
    (t) => t.dueDate && localDate(t.dueDate) === today(),
  );
  const notes = data.note
    .filter((n) => !n.archivedAt)
    .sort(
      (a, b) =>
        !!b.pinnedAt - !!a.pinnedAt || b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 4);
  const entries = data.entry
    .filter((e) => !e.archivedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  return (
    <div className="page dashboard">
      <div className="page-intro">
        <span className="eyebrow">GUT ORGANISIERT DURCH DEN TAG</span>
        <h1>Alles im Blick.</h1>
        <p>Platz für klare Gedanken und die nächsten Schritte.</p>
      </div>
      <div className="stats-grid">
        {[
          [CheckCheck, "Offene Aufgaben", active.length, "todo"],
          [Clock, "Heute fällig", due.length, "todo"],
          [
            MessagesSquare,
            "Gespräche",
            data.entry.filter((e) => !e.archivedAt).length,
            "entry",
          ],
          [
            NotebookPen,
            "Notizen",
            data.note.filter((n) => !n.archivedAt).length,
            "note",
          ],
        ].map(([Icon, label, count, key]) => (
          <button
            className="stat-card"
            key={label}
            onClick={() => navigate(key)}
          >
            <span className="stat-icon">
              <Icon size={20} />
            </span>
            <strong>{count}</strong>
            <span>{label}</span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <h2>Nächste Schritte</h2>
            <button className="text-button" onClick={() => navigate("todo")}>
              Alle Aufgaben
              <ArrowUpRight size={14} />
            </button>
          </div>
          {late.length > 0 && (
            <div className="attention">
              <Clock size={15} />
              {late.length}{" "}
              {late.length === 1 ? "Aufgabe wartet" : "Aufgaben warten"} auf
              Rückmeldung
            </div>
          )}
          {active.length ? (
            active
              .sort((a, b) =>
                (a.dueDate || "z").localeCompare(b.dueDate || "z"),
              )
              .slice(0, 6)
              .map((t) => (
                <button
                  key={t.id}
                  className="dashboard-row"
                  onClick={() => navigate("todo", t)}
                >
                  <span className="task-circle" />
                  <span>
                    <strong>{t.title}</strong>
                    <small className={overdue(t) ? "danger" : ""}>
                      {fmt(t.dueDate)}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
          ) : (
            <div className="card-empty">
              <CheckCircle2 size={28} />
              <strong>Ein freier Kopf.</strong>
              <p>
                Keine offenen Aufgaben. Neue Schritte können Sie jederzeit
                festhalten.
              </p>
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Ihr Notizbuch</h2>
            <IconButton
              icon={Plus}
              label="Neue Notiz"
              onClick={() => create("note")}
            />
          </div>
          {notes.length ? (
            notes.map((n) => (
              <button
                className="note-preview"
                key={n.id}
                onClick={() => navigate("note", n)}
              >
                <div>
                  <NotebookPen size={16} />
                  <strong>{title(n)}</strong>
                  {n.pinnedAt && <Pin size={13} />}
                </div>
                <p>
                  {n.body.replace(/[#*`]/g, "").slice(0, 95) ||
                    "Hier ist Platz für Ihre Gedanken."}
                </p>
                <small>{fmt(n.updatedAt)}</small>
              </button>
            ))
          ) : (
            <div className="card-empty">
              <NotebookPen size={28} />
              <strong>Gedanken verdienen einen Platz.</strong>
              <p>
                Mitschriften, Ideen und Informationen gesammelt in Ihrem
                Notizbuch.
              </p>
              <button onClick={() => create("note")}>
                Erste Notiz schreiben
              </button>
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Letzte Gespräche</h2>
            <button className="text-button" onClick={() => navigate("entry")}>
              Alle Gespräche
              <ArrowUpRight size={14} />
            </button>
          </div>
          {entries.length ? (
            entries.map((e) => (
              <button
                className="dashboard-row"
                key={e.id}
                onClick={() => navigate("entry", e)}
              >
                <MessagesSquare size={18} />
                <span>
                  <strong>{title(e)}</strong>
                  <small>
                    {e.type} · {fmt(e.date)}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="card-empty">
              <p>Halten Sie fest, was besprochen und vereinbart wurde.</p>
              <button onClick={() => create("entry")}>
                Gespräch dokumentieren
              </button>
            </div>
          )}
        </section>
        <section className="card inbox-card">
          <div className="section-heading">
            <h2>
              <Inbox size={18} /> Noch unsortiert
            </h2>
            <span className="badge">{data.inbox.length}</span>
          </div>
          <p>
            Erst festhalten, später einordnen. In Ihrer Inbox geht kein Gedanke
            verloren.
          </p>
          {data.inbox.slice(0, 2).map((x) => (
            <p className="inbox-preview" key={x.id}>
              {x.text.slice(0, 120)}
            </p>
          ))}
          <button onClick={() => navigate("inbox")}>
            Zur Inbox
            <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
    </div>
  );
}
function SearchPanel({ query, setQuery, data, navigate }) {
  return (
    <div className="page">
      <div className="page-intro">
        <span className="eyebrow">ALLES WIEDERFINDEN</span>
        <h1>Ein Gedanke. Eine Suche.</h1>
        <p>
          Gespräche, Notizen und Aufgaben – einschließlich archivierter
          Einträge.
        </p>
      </div>
      <div className="search-input global-search">
        <Search size={20} />
        <input
          data-search
          autoFocus
          aria-label="Globale Suche"
          placeholder="Betreff, Text, Person oder Schlagwort …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!query.trim() ? (
        <Empty icon={Search} title="Was suchen Sie?">
          Ein Name oder Stichwort genügt.
        </Empty>
      ) : (
        ["entry", "note", "todo"].map((k) => {
          const results = data[k].filter((x) => matches(x, query));
          return (
            <section className="search-results" key={k}>
              <h2>
                {k === "entry"
                  ? "Gespräche"
                  : k === "note"
                    ? "Notizen"
                    : "Aufgaben"}
                <span>{results.length}</span>
              </h2>
              {results.map((x) => (
                <button
                  key={x.id}
                  className="search-result"
                  onClick={() => navigate(k, x)}
                >
                  <div>
                    <strong>{title(x)}</strong>
                    {x.archivedAt && <span className="badge">Archiv</span>}
                  </div>
                  <p>{(x.body || x.note || "").slice(0, 200)}</p>
                  <small>
                    {(x.participants || x.persons || []).join(", ")}
                  </small>
                </button>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
function Persons({ people, data, navigate, action }) {
  const [q, setQ] = useState(""),
    [person, setPerson] = useState(null);
  const entries = data.entry
    .filter((e) => e.participants.includes(person))
    .sort((a, b) => b.date.localeCompare(a.date));
  const notes = data.note.filter((n) => n.persons.includes(person));
  return (
    <div className="split">
      <section className="list-pane">
        <div className="list-heading">
          <h1>Personen</h1>
          <span>{people.length}</span>
        </div>
        <div className="list-controls">
          <div className="search-input">
            <Search size={16} />
            <input
              data-search
              aria-label="Person suchen"
              placeholder="Person suchen …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="record-list">
          {people
            .filter((p) => words(p).includes(words(q)))
            .map((p) => (
              <button
                className={"person-row " + (p === person ? "selected" : "")}
                key={p}
                onClick={() => setPerson(p)}
              >
                <span className="avatar">
                  {p
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <strong>{p}</strong>
                <ChevronRight size={15} />
              </button>
            ))}
        </div>
      </section>
      <section className="detail-pane">
        {person ? (
          <article className="detail">
            <div className="section-heading">
              <span className="eyebrow">PERSONENAKTE</span>
              <button
                onClick={() => action(() => api.exportPDF("person", person))}
              >
                <FileDown size={15} />
                PDF exportieren
              </button>
            </div>
            <h1>{person}</h1>
            <p className="muted">
              {entries.length} Gespräche · {notes.length} Notizen ·
              einschließlich Archiv
            </p>
            <h3>Gesprächshistorie</h3>
            {entries.map((e) => (
              <button
                className="search-result"
                key={e.id}
                onClick={() => navigate("entry", e)}
              >
                <strong>{title(e)}</strong>
                <p>
                  {fmt(e.date)} · {e.type}
                  {e.archivedAt ? " · Archiv" : ""}
                </p>
              </button>
            ))}
            <h3>Verknüpfte Notizen</h3>
            {notes.map((n) => (
              <button
                className="search-result"
                key={n.id}
                onClick={() => navigate("note", n)}
              >
                <strong>{title(n)}</strong>
                <p>
                  {fmt(n.updatedAt)}
                  {n.archivedAt ? " · Archiv" : ""}
                </p>
              </button>
            ))}
          </article>
        ) : (
          <Empty icon={Users} title="Menschen und Zusammenhänge">
            Personen aus Gesprächen und Notizen werden hier automatisch
            gesammelt.
          </Empty>
        )}
      </section>
    </div>
  );
}
function InboxPanel({ data, command, action, setEditor, ask }) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="page inbox-page">
      <div className="page-intro">
        <span className="eyebrow">GEDANKEN ZWISCHENPARKEN</span>
        <h1>Erst festhalten. Dann sortieren.</h1>
        <p>
          Kurze Notizen werden später zu Gesprächen, Aufgaben oder
          Notizbucheinträgen.
        </p>
      </div>
      <form
        className="capture-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await command("save", { kind: "inbox", item: { text } });
            setText("");
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          aria-label="Schnellnotiz"
          placeholder="Was möchten Sie nicht vergessen?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div>
          <span className="muted small">
            Nur für Sie. Direkt lokal gespeichert.
          </span>
          <button className="primary" disabled={!text.trim() || busy}>
            <Plus size={16} />
            Festhalten
          </button>
        </div>
      </form>
      <div className="section-heading">
        <h2>Unsortiert</h2>
        <span className="badge">{data.inbox.length}</span>
      </div>
      {data.inbox.length === 0 ? (
        <Empty icon={Inbox} title="Alles an seinem Platz.">
          Ihre Inbox ist leer.
        </Empty>
      ) : (
        data.inbox
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((x) => (
            <article className="inbox-item" key={x.id}>
              <div className="section-heading">
                <small>{fmt(x.createdAt)}</small>
                <IconButton
                  icon={Trash2}
                  label="Schnellnotiz löschen"
                  onClick={() =>
                    ask("Diese Schnellnotiz löschen?", () =>
                      command("delete", { kind: "inbox", id: x.id }),
                    )
                  }
                />
              </div>
              <p>{x.text}</p>
              <div className="inbox-convert">
                {[
                  ["entry", "Als Gespräch"],
                  ["todo", "Als Aufgabe"],
                  ["note", "Als Notiz"],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() =>
                      setEditor({
                        kind,
                        inboxId: x.id,
                        item: {
                          subject: x.text.slice(0, 80),
                          title: x.text.slice(0, 80),
                          body: x.text,
                          note: x.text,
                        },
                      })
                    }
                  >
                    {label}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </article>
          ))
      )}
    </div>
  );
}
function Capture({ command, notice }) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="quick-capture">
      <div className="section-heading">
        <h2>Ein Gedanke für später.</h2>
        <IconButton
          icon={X}
          label="Schließen"
          onClick={() => api.hideCapture()}
        />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await command("save", { kind: "inbox", item: { text } });
            setText("");
            await api.hideCapture();
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          autoFocus
          aria-label="Schnellnotiz"
          placeholder="Was möchten Sie festhalten?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
              e.currentTarget.form.requestSubmit();
          }}
        />
        {notice?.error && <p className="form-error">{notice.text}</p>}
        <div className="section-heading">
          <button type="button" onClick={() => api.showMain()}>
            Kontor öffnen
          </button>
          <button className="primary" disabled={!text.trim() || busy}>
            In Inbox speichern
          </button>
        </div>
      </form>
    </div>
  );
}
function LinkDialog({ source, data, command, onClose }) {
  const [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function linked(kind, id) {
    return data.links.some(
      (l) =>
        (l.aKind === source.kind &&
          l.aId === source.id &&
          l.bKind === kind &&
          l.bId === id) ||
        (l.bKind === source.kind &&
          l.bId === source.id &&
          l.aKind === kind &&
          l.aId === id),
    );
  }
  return (
    <Modal title="Einträge verknüpfen" onClose={onClose}>
      <div className="modal-body">
        <div className="search-input">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Eintrag suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {["entry", "note", "todo"]
          .filter((k) => k !== source.kind)
          .map((k) => (
            <section className="link-group" key={k}>
              <h3>
                {k === "entry"
                  ? "Gespräche"
                  : k === "note"
                    ? "Notizen"
                    : "Aufgaben"}
              </h3>
              {data[k]
                .filter((x) => matches(x, query))
                .map((x) => (
                  <label className="check-row" key={x.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={linked(k, x.id)}
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await command("link", {
                            aKind: source.kind,
                            aId: source.id,
                            bKind: k,
                            bId: x.id,
                            enabled: e.target.checked,
                          });
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <span>{title(x)}</span>
                    {x.archivedAt && <span className="badge">Archiv</span>}
                  </label>
                ))}
            </section>
          ))}
        {error && <p className="form-error">{error}</p>}
      </div>
      <footer>
        <button className="primary" onClick={onClose}>
          Fertig
        </button>
      </footer>
    </Modal>
  );
}
function FolderManager({ data, command, ask, onClose }) {
  const [draft, setDraft] = useState({ name: "", parentId: null }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Ordner verwalten" onClose={onClose}>
      <div className="modal-body">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await command("save", { kind: "folder", item: draft });
              setDraft({ name: "", parentId: null });
              setError("");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Ordnername
            <input
              autoFocus
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Übergeordneter Ordner
            <select
              value={draft.parentId || ""}
              onChange={(e) =>
                setDraft({ ...draft, parentId: e.target.value || null })
              }
            >
              <option value="">Oberste Ebene</option>
              <FolderOptions folders={data.folder} exclude={draft.id} />
            </select>
          </label>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {draft.id ? "Änderung speichern" : "Ordner anlegen"}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft({ name: "", parentId: null })}
              >
                Abbrechen
              </button>
            )}
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
        <div className="folder-list">
          {data.folder.map((f) => (
            <div className="folder-row" key={f.id}>
              <Folder size={17} />
              <span>
                <strong>{f.name}</strong>
                <small>
                  {data.folder.find((p) => p.id === f.parentId)?.name ||
                    "Oberste Ebene"}
                </small>
              </span>
              <IconButton
                icon={Pencil}
                label={`${f.name} bearbeiten`}
                onClick={() => setDraft(f)}
              />
              <IconButton
                icon={Trash2}
                label={`${f.name} löschen`}
                onClick={() =>
                  ask(
                    "Diesen Ordner löschen? Notizen und Unterordner werden in den übergeordneten Ordner verschoben.",
                    async () => {
                      await command("delete", { kind: "folder", id: f.id });
                      if (draft.id === f.id)
                        setDraft({ name: "", parentId: null });
                    },
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>
      <footer>
        <button onClick={onClose}>Fertig</button>
      </footer>
    </Modal>
  );
}
function AttachmentPreview({ id, action, onClose }) {
  const [file, setFile] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .attachment(id)
      .then((f) => {
        if (live) setFile(f);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Modal wide title={file?.filename || "Anhang"} onClose={onClose}>
      <div className="attachment-preview">
        {error ? (
          <p className="form-error">{error}</p>
        ) : !file ? (
          <p>Wird geladen …</p>
        ) : file.mime === "application/pdf" ? (
          <iframe
            title={file.filename}
            src={`data:application/pdf;base64,${file.data}`}
          />
        ) : (
          <img
            alt={file.filename}
            src={`data:${file.mime};base64,${file.data}`}
          />
        )}
      </div>
      <footer>
        <button onClick={() => action(() => api.saveAttachment(id))}>
          <Download size={15} />
          Datei speichern
        </button>
        <button className="primary" onClick={onClose}>
          Fertig
        </button>
      </footer>
    </Modal>
  );
}
function PinSettings() {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>PIN festlegen oder ändern</h2>
      <p>
        Ersetzen Sie Ihre bisherige Passphrase oder PIN durch vier Ziffern. Ihre
        Daten bleiben erhalten.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pin !== repeat) {
            setMessage("Die PINs stimmen nicht überein.");
            return;
          }
          setBusy(true);
          try {
            await api.changePin(current, pin);
            setCurrent("");
            setPin("");
            setRepeat("");
            setMessage(
              "PIN gespeichert. Ältere Sicherungen benötigen weiterhin die damalige PIN oder Passphrase.",
            );
          } catch (e) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Bisherige PIN oder Passphrase
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Neue PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            autoComplete="new-password"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <label>
          Neue PIN wiederholen
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Wird gespeichert …" : "PIN speichern"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
function SettingsPanel({ status, action, refresh }) {
  const [settings, setSettings] = useState(status.settings),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState("");
  return (
    <div className="page settings-page">
      <div className="page-intro">
        <span className="eyebrow">IHR KONTOR</span>
        <h1>So, wie es zu Ihnen passt.</h1>
        <p>Erscheinungsbild, PIN, Tastenkürzel und Sicherungen.</p>
      </div>
      <PinSettings />
      <section className="card">
        <h2>
          <Sun size={19} /> Erscheinungsbild
        </h2>
        <div className="settings-line">
          <div>
            <strong>Farbschema</strong>
            <p>Warmes Anthrazit ist der Kontor-Standard.</p>
          </div>
          <select
            aria-label="Farbschema"
            value={settings.theme}
            onChange={(e) =>
              setSettings({ ...settings, theme: e.target.value })
            }
          >
            <option value="dark">Dunkel</option>
            <option value="light">Hell</option>
            <option value="system">Dem System folgen</option>
          </select>
        </div>
        <div className="settings-line">
          <div>
            <strong>Schnellerfassung</strong>
            <p>Globales Tastenkürzel, auch außerhalb von Kontor.</p>
          </div>
          <input
            aria-label="Globales Tastenkürzel"
            value={settings.hotkey}
            onChange={(e) =>
              setSettings({ ...settings, hotkey: e.target.value })
            }
          />
        </div>
        <p className="hint">
          Zum Beispiel Control+Alt+K. Die Schnellerfassung steht auch über das
          Kontor-Symbol im Infobereich zur Verfügung.
        </p>
        {status.settings.hotkeyError && (
          <p className="form-error">{status.settings.hotkeyError}</p>
        )}
        <button
          onClick={() =>
            action(async () => {
              await api.settings(settings);
              await refresh();
              setMessage("Einstellungen gespeichert.");
            })
          }
        >
          Einstellungen speichern
        </button>
      </section>
      <section className="card">
        <h2>
          <ShieldCheck size={19} /> Daten & Sicherungen
        </h2>
        <p>
          Ihre Daten liegen verschlüsselt auf diesem Rechner. Eine Sicherung
          enthält Gespräche, Aufgaben, Notizen, Verknüpfungen und alle Anhänge.
        </p>
        <button
          onClick={() =>
            action(async () => {
              if (await api.backup())
                setMessage("Sicherung erfolgreich exportiert.");
            })
          }
        >
          <Download size={16} />
          Sicherung exportieren
        </button>
        <div className="settings-divider" />
        <h3>Sicherung wiederherstellen</h3>
        <p className="small muted">
          Verwenden Sie die PIN oder Passphrase, mit der die Sicherung erstellt
          wurde. Vor dem Ersetzen wird eine Sicherheitskopie des aktuellen
          Bestands angelegt.
        </p>
        <label>
          PIN oder Passphrase der Sicherung
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          disabled={!password}
          onClick={() =>
            action(async () => {
              if (await api.restore(password)) {
                setPassword("");
                await refresh();
                setMessage("Sicherung wiederhergestellt.");
              }
            })
          }
        >
          <Upload size={16} />
          Sicherung auswählen und importieren
        </button>
      </section>
      <section className="card">
        <h2>
          <Keyboard size={19} /> Schnell zum Ziel
        </h2>
        <div className="shortcut-list">
          {[
            ["Strg + N", "Neuer Eintrag im aktuellen Bereich"],
            ["Strg + F", "Suchfeld fokussieren"],
            ["Strg + S", "Editor speichern"],
            ["Strg + 1 bis 7", "Bereich wechseln"],
            ["Strg + Umschalt + L", "Kontor sperren"],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </section>
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <p className="version">
        Kontor für Windows · 0.1.1 · Lokal. Ohne Kalender. Ohne Cloud.
      </p>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
