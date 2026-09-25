import React, { useEffect, useRef, useState } from "react";
import {
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  Decoration,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  defaultKeymap,
  indentWithTab,
  history,
  historyKeymap,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  syntaxTree,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion } from "@codemirror/autocomplete";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import {
  Bold,
  Italic,
  Heading1,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Link,
  Eye,
  Pencil,
  Strikethrough,
} from "lucide-react";
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const parser = new Marked({ gfm: true, breaks: true });
parser.use({
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start: (src) => src.indexOf("[["),
      tokenizer(src) {
        const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
        if (m) return { type: "wikilink", raw: m[0], text: m[1] };
      },
      renderer(token) {
        return `<a href="#" data-wiki="${escape(token.text)}">${escape(token.text)}</a>`;
      },
    },
  ],
});
export function Markdown({ value = "", onWiki, onCheckbox }) {
  const html = DOMPurify.sanitize(parser.parse(value), {
    ADD_ATTR: ["data-wiki"],
    FORBID_TAGS: ["img", "iframe", "style", "script", "form", "video", "audio"],
    FORBID_ATTR: ["style"],
  });
  return (
    <div
      className="markdown"
      onClick={(e) => {
        const a = e.target.closest("a");
        if (a) {
          e.preventDefault();
          if (a.dataset.wiki) onWiki?.(a.dataset.wiki);
          else if (a.href) window.kontor.external(a.href).catch(() => {});
        }
        if (e.target.matches("input[type=checkbox]") && onCheckbox) {
          const checks = [
            ...e.currentTarget.querySelectorAll("input[type=checkbox]"),
          ];
          onCheckbox(checks.indexOf(e.target));
        }
      }}
      dangerouslySetInnerHTML={{
        __html: onCheckbox ? html.replace(/ disabled=""/g, "") : html,
      }}
    />
  );
}
// Style Markdown without changing its source; reveal markers on the active line.
const liveMarkdown = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(u) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        this.decorations = this.build(u.view);
    }
    build(view) {
      const ranges = [];
      const current = view.state.doc.lineAt(view.state.selection.main.head);
      syntaxTree(view.state).iterate({
        enter: (node) => {
          if (node.name.startsWith("ATXHeading"))
            ranges.push(
              Decoration.mark({
                class: "live-heading live-heading-" + node.name.slice(-1),
              }).range(node.from, node.to),
            );
          if (
            [
              "HeaderMark",
              "EmphasisMark",
              "StrikethroughMark",
              "QuoteMark",
              "CodeMark",
            ].includes(node.name) &&
            (node.to < current.from || node.from > current.to) &&
            node.to > node.from &&
            view.state.doc.lineAt(node.from).number ===
              view.state.doc.lineAt(node.to).number
          )
            ranges.push(Decoration.replace({}).range(node.from, node.to));
        },
      });
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations },
);
export function MarkdownEditor({
  value,
  onChange,
  titles = [],
  label = "Text",
}) {
  const host = useRef();
  const editor = useRef();
  const latest = useRef({ onChange, titles });
  latest.current = { onChange, titles };
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (preview) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ base: markdownLanguage }),
          liveMarkdown,
          history(),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.heading, color: "var(--text)", fontWeight: "650" },
              { tag: tags.strong, fontWeight: "bold", color: "var(--text)" },
              { tag: tags.emphasis, fontStyle: "italic" },
              { tag: tags.strikethrough, textDecoration: "line-through" },
              { tag: tags.link, color: "var(--accent)" },
              { tag: tags.monospace, color: "var(--secondary)" },
              { tag: tags.processingInstruction, color: "var(--muted)" },
              { tag: tags.meta, color: "var(--muted)" },
              { tag: tags.string, color: "var(--accent)" },
              { tag: tags.keyword, color: "var(--accent)" },
              { tag: tags.comment, color: "var(--muted)" },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          placeholder(
            "Gedanken festhalten … Markdown und [[Notizlinks]] werden unterstützt.",
          ),
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "true",
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
          }),
          autocompletion({
            override: [
              (context) => {
                const m = context.matchBefore(/\[\[[^\]\n]*/);
                if (!m) return null;
                return {
                  from: m.from + 2,
                  options: latest.current.titles.map((t) => ({
                    label: t,
                    type: "text",
                    apply: t + "]]",
                  })),
                };
              },
            ],
          }),
          EditorView.theme({
            "&": { color: "var(--text)", backgroundColor: "transparent" },
            ".cm-content": {
              fontFamily: "inherit",
              padding: "16px",
              minHeight: "210px",
            },
            ".cm-cursor": { borderLeftColor: "var(--accent)" },
            ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.8" },
            "&.cm-focused": { outline: "none" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: "#7c5cfc45",
            },
            ".cm-tooltip": {
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [preview]);
  useEffect(() => {
    const v = editor.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);
  function format(left, right = "", lines = false) {
    const v = editor.current;
    if (!v) return;
    const { from, to } = v.state.selection.main;
    const begin = lines ? v.state.doc.lineAt(from).from : from;
    const selection = v.state.doc.sliceString(begin, to);
    const insert = lines
      ? selection
          .split("\n")
          .map((l) => left + l)
          .join("\n")
      : left + selection + right;
    v.dispatch({
      changes: { from: begin, to, insert },
      selection: {
        anchor: begin + left.length,
        head: begin + insert.length - right.length,
      },
    });
    v.focus();
  }
  const buttons = [
    [Bold, "Fett", "**", "**"],
    [Italic, "Kursiv", "*", "*"],
    [Strikethrough, "Durchgestrichen", "~~", "~~"],
    [Heading1, "Überschrift", "# ", "", true],
    [List, "Aufzählung", "- ", "", true],
    [ListOrdered, "Nummerierung", "1. ", "", true],
    [CheckSquare, "Checkbox", "- [ ] ", "", true],
    [Quote, "Zitat", "> ", "", true],
    [Code, "Codeblock", "```\n", "\n```"],
    [Link, "Link", "[", "](https://)"],
  ];
  return (
    <div className="md-editor">
      <div className="md-toolbar">
        {buttons.map(([Icon, title, l, r, lines]) => (
          <button
            type="button"
            title={title}
            aria-label={title}
            disabled={preview}
            key={title}
            onClick={() => format(l, r, lines)}
          >
            <Icon size={15} />
          </button>
        ))}
        <span className="spacer" />
        <button
          type="button"
          title={preview ? "Bearbeiten" : "Vorschau"}
          onClick={() => setPreview(!preview)}
        >
          {preview ? <Pencil size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {preview ? (
        <div className="editor-preview">
          <Markdown value={value} />
        </div>
      ) : (
        <div ref={host} />
      )}
    </div>
  );
}
