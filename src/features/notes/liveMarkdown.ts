// Live-preview Markdown for CodeMirror 6, in the spirit of Obsidian: the file stays plain
// Markdown, byte for byte, while headings, emphasis, lists, tasks, quotes, code and links are
// shown formatted. Markup characters reappear on the line being edited.
import { EditorSelection, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, completionKeymap, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { WIKILINK } from "./links";

export interface LinkCandidate {
  title: string;
  kind: "drawing" | "board" | "note";
  where: string;
}

export interface LiveMarkdownOptions {
  /** Documents offered after typing [[ */
  candidates: () => LinkCandidate[];
  openWikilink: (target: string) => void;
  openHref: (href: string) => void;
  onChange: (text: string) => void;
}

// ------------------------------------------------------------------ decorations

const hide = Decoration.replace({});

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "md-bullet";
    s.textContent = "•";
    return s;
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: TaskWidget) {
    return o.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.checked = this.checked;
    el.className = "md-task";
    el.setAttribute("aria-label", this.checked ? "Mark as not done" : "Mark as done");
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "md-hr";
    return s;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const line = (cls: string) => Decoration.line({ class: cls });

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const focused = view.hasFocus;
  const activeLines = new Set<number>();
  if (focused)
    for (const r of state.selection.ranges) {
      for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) activeLines.add(n);
    }
  const active = (pos: number) => activeLines.has(doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  /** hide a mark and the single space that follows it */
  const hideMark = (from: number, to: number) => {
    const end = doc.sliceString(to, to + 1) === " " ? to + 1 : to;
    out.push(hide.range(from, end));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          out.push(line(`md-h${heading[1]}`).range(doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case "HeaderMark":
            if (!active(node.from) && node.node.parent?.name.startsWith("ATXHeading")) hideMark(node.from, node.to);
            return;
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!active(node.from)) out.push(hide.range(node.from, node.to));
            return;
          case "CodeMark":
            if (node.node.parent?.name === "InlineCode" && !active(node.from)) out.push(hide.range(node.from, node.to));
            return;
          case "QuoteMark":
            out.push(line("md-quote").range(doc.lineAt(node.from).from));
            if (!active(node.from)) hideMark(node.from, node.to);
            return;
          case "ListMark": {
            const item = node.node.parent;
            const bulletList = item?.parent?.name === "BulletList";
            const task = item?.getChild("Task");
            if (active(node.from)) return;
            if (task) hideMark(node.from, node.to);
            else if (bulletList) out.push(bullet.range(node.from, node.to));
            return;
          }
          case "TaskMarker": {
            const checked = /x/i.test(doc.sliceString(node.from, node.to));
            if (checked) out.push(line("md-task-done").range(doc.lineAt(node.from).from));
            if (!active(node.from)) out.push(Decoration.replace({ widget: new TaskWidget(checked) }).range(node.from, node.to));
            return;
          }
          case "HorizontalRule":
            if (!active(node.from)) out.push(rule.range(node.from, node.to));
            return;
          case "FencedCode": {
            const first = doc.lineAt(node.from).number;
            const last = doc.lineAt(node.to).number;
            for (let n = first; n <= last; n++) out.push(line(n === first ? "md-code md-code-first" : n === last ? "md-code md-code-last" : "md-code").range(doc.line(n).from));
            return;
          }
          case "Link": {
            if (active(node.from)) return;
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            if (marks.length < 2 || !url) return;
            const textFrom = marks[0].to;
            const textTo = marks[1].from;
            if (textTo <= textFrom) return;
            out.push(hide.range(marks[0].from, marks[0].to));
            out.push(Decoration.mark({ class: "md-link", attributes: { "data-href": doc.sliceString(url.from, url.to), title: doc.sliceString(url.from, url.to) } }).range(textFrom, textTo));
            out.push(hide.range(marks[1].from, node.to));
            return false;
          }
        }
      },
    });

    // [[wiki links]]: shown as link chips, brackets hidden outside the edited line
    for (let pos = from; pos <= to; ) {
      const l = doc.lineAt(pos);
      for (const m of l.text.matchAll(WIKILINK)) {
        const start = l.from + m.index!;
        const end = start + m[0].length;
        const target = m[1].trim();
        if (active(start)) {
          out.push(Decoration.mark({ class: "md-wikilink-raw" }).range(start, end));
          continue;
        }
        const shownFrom = m[2] ? end - 2 - m[2].length : start + 2;
        out.push(hide.range(start, shownFrom));
        out.push(Decoration.mark({ class: "md-wikilink", attributes: { "data-wikilink": target, title: `Open “${target}”` } }).range(shownFrom, end - 2));
        out.push(hide.range(end - 2, end));
      }
      pos = l.to + 1;
    }
  }
  return Decoration.set(out, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const highlight = HighlightStyle.define([
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, class: "md-inline-code" },
  { tag: [t.processingInstruction, t.meta], class: "md-mark" },
  { tag: t.url, class: "md-url" },
  { tag: t.link, class: "md-url" },
  { tag: t.quote, class: "md-quote-text" },
]);

// ------------------------------------------------------------------ editing commands

/** Wrap the selection in a mark (or remove it), e.g. ** for bold. */
function toggleWrap(mark: string) {
  return (view: EditorView) => {
    const { state } = view;
    view.dispatch(
      state.changeByRange((r) => {
        const before = state.sliceDoc(r.from - mark.length, r.from);
        const after = state.sliceDoc(r.to, r.to + mark.length);
        if (before === mark && after === mark)
          return { changes: [{ from: r.from - mark.length, to: r.from }, { from: r.to, to: r.to + mark.length }], range: EditorSelection.range(r.from - mark.length, r.to - mark.length) };
        return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: EditorSelection.range(r.from + mark.length, r.to + mark.length) };
      }),
    );
    return true;
  };
}

/** Replace the line's block prefix (heading, list, quote) with another one. */
function setPrefix(view: EditorView, from: number, to: number, prefix: string) {
  const l = view.state.doc.lineAt(from);
  const rest = (l.text.slice(0, from - l.from) + l.text.slice(to - l.from)).replace(/^(\s*)(#{1,6}\s|[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)?/, "$1");
  view.dispatch({ changes: { from: l.from, to: l.to, insert: prefix + rest }, selection: { anchor: l.from + prefix.length + rest.length } });
}

interface SlashCommand {
  label: string;
  hint: string;
  run: (view: EditorView, from: number, to: number) => void;
}

const SLASH: SlashCommand[] = [
  { label: "Heading 1", hint: "#", run: (v, f, t2) => setPrefix(v, f, t2, "# ") },
  { label: "Heading 2", hint: "##", run: (v, f, t2) => setPrefix(v, f, t2, "## ") },
  { label: "Heading 3", hint: "###", run: (v, f, t2) => setPrefix(v, f, t2, "### ") },
  { label: "To-do", hint: "- [ ]", run: (v, f, t2) => setPrefix(v, f, t2, "- [ ] ") },
  { label: "Bullet list", hint: "-", run: (v, f, t2) => setPrefix(v, f, t2, "- ") },
  { label: "Numbered list", hint: "1.", run: (v, f, t2) => setPrefix(v, f, t2, "1. ") },
  { label: "Quote", hint: ">", run: (v, f, t2) => setPrefix(v, f, t2, "> ") },
  {
    label: "Code block",
    hint: "```",
    run: (v, f, t2) => v.dispatch({ changes: { from: f, to: t2, insert: "```\n\n```" }, selection: { anchor: f + 4 } }),
  },
  {
    label: "Table",
    hint: "| |",
    run: (v, f, t2) => v.dispatch({ changes: { from: f, to: t2, insert: "| Column | Column |\n| --- | --- |\n|  |  |" }, selection: { anchor: f + 2, head: f + 8 } }),
  },
  { label: "Divider", hint: "---", run: (v, f, t2) => v.dispatch({ changes: { from: f, to: t2, insert: "---\n" }, selection: { anchor: f + 4 } }) },
  {
    label: "Link to a whiteboard, board or note",
    hint: "[[",
    run: (v, f, t2) => {
      v.dispatch({ changes: { from: f, to: t2, insert: "[[]]" }, selection: { anchor: f + 2 } });
      startCompletion(v);
    },
  },
];

function slashSource(ctx: CompletionContext): CompletionResult | null {
  const l = ctx.state.doc.lineAt(ctx.pos);
  const before = l.text.slice(0, ctx.pos - l.from);
  // a slash at the start of a line or after a space opens the commands ("and/or" does not)
  const m = /(?:^|\s)\/([\w -]{0,24})$/.exec(before);
  if (!m) return null;
  const from = ctx.pos - m[1].length;
  return {
    from,
    options: SLASH.map<Completion>((c) => ({ label: c.label, detail: c.hint, type: "text", apply: (view, _c, f, to) => c.run(view, f - 1, to) })),
    validFor: /^[\w -]*$/,
  };
}

const KIND_HINT = { drawing: "Whiteboard", board: "Board", note: "Note" } as const;

function wikiSource(candidates: () => LinkCandidate[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const l = ctx.state.doc.lineAt(ctx.pos);
    const before = l.text.slice(0, ctx.pos - l.from);
    const m = /\[\[([^[\]|\n]*)$/.exec(before);
    if (!m) return null;
    const from = ctx.pos - m[1].length;
    const closed = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "]]";
    return {
      from,
      options: candidates().map<Completion>((c) => ({
        label: c.title,
        detail: `${KIND_HINT[c.kind]} · ${c.where}`,
        type: c.kind,
        apply: (view, _c, f, to) => {
          const insert = closed ? c.title : `${c.title}]]`;
          view.dispatch({ changes: { from: f, to, insert }, selection: { anchor: f + c.title.length + 2 } });
        },
      })),
      validFor: /^[^[\]|\n]*$/,
    };
  };
}

// ------------------------------------------------------------------ the extension

export function liveMarkdown(opts: LiveMarkdownOptions): Extension {
  return [
    markdown({ base: markdownLanguage }),
    history(),
    EditorView.lineWrapping,
    syntaxHighlighting(highlight),
    livePreview,
    placeholder("Write something, or type / for commands and [[ to link a whiteboard, board or note"),
    autocompletion({ override: [slashSource, wikiSource(opts.candidates)], icons: false, defaultKeymap: true }),
    keymap.of([
      { key: "Mod-b", run: toggleWrap("**") },
      { key: "Mod-i", run: toggleWrap("*") },
      { key: "Mod-Shift-x", run: toggleWrap("~~") },
      { key: "Mod-e", run: toggleWrap("`") },
      ...completionKeymap,
      ...markdownKeymap,
      ...historyKeymap,
      indentWithTab,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      mousedown(e, view) {
        const el = e.target as HTMLElement;
        if (el.classList?.contains("md-task")) {
          e.preventDefault();
          const pos = view.posAtDOM(el);
          const cur = view.state.sliceDoc(pos, pos + 3);
          if (/^\[[ xX]\]$/.test(cur)) view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: /x/i.test(cur) ? " " : "x" } });
          return true;
        }
        const wiki = el.closest<HTMLElement>("[data-wikilink]");
        if (wiki && e.button === 0) {
          e.preventDefault();
          opts.openWikilink(wiki.dataset.wikilink!);
          return true;
        }
        const href = el.closest<HTMLElement>("[data-href]");
        if (href && e.button === 0) {
          e.preventDefault();
          opts.openHref(href.dataset.href!);
          return true;
        }
        return false;
      },
    }),
  ];
}
