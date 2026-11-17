// Live-preview Markdown for CodeMirror 6, in the spirit of Obsidian: the file stays plain
// Markdown, byte for byte, while headings, emphasis, lists, tasks, quotes, code and links are
// shown formatted. Markup characters reappear on the line being edited.
import type { Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, completionKeymap, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { WIKILINK } from "./links";
import { activeState, insertCodeBlock, insertDivider, insertTable, setBlock, toggleInline, type ActiveState, type BlockKind } from "./noteCommands";

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
  /** What a [[link]] points to, for its icon; null when nothing has that name */
  linkKind?: (target: string) => "drawing" | "board" | "note" | null;
  /** Formatting under the cursor, for the toolbar */
  onState?: (s: ActiveState) => void;
}

let linkKindOf: LiveMarkdownOptions["linkKind"] = undefined;

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
          case "Table": {
            const first = doc.lineAt(node.from).number;
            const last = doc.lineAt(node.to).number;
            for (let n = first; n <= last; n++) out.push(line(`md-table${n === first ? " md-table-first" : ""}${n === last ? " md-table-last" : ""}`).range(doc.line(n).from));
            return;
          }
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
        const kind = linkKindOf?.(target);
        const cls = `md-wikilink md-wikilink--${kind ?? "missing"}`;
        const title = kind ? `Open “${target}”` : `“${target}” does not exist yet: click to create the note`;
        out.push(Decoration.mark({ class: cls, attributes: { "data-wikilink": target, title } }).range(shownFrom, end - 2));
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

// ------------------------------------------------------------------ "/" commands

interface SlashCommand {
  label: string;
  description: string;
  section: string;
  icon: string;
  run: (view: EditorView, from: number, to: number) => void;
}

/** Remove the typed "/command" text, then run the command on the (now clean) line. */
const block = (kind: BlockKind) => (v: EditorView, f: number, t2: number) => {
  v.dispatch({ changes: { from: f, to: t2 } });
  setBlock(v, kind);
};
const after = (fn: (v: EditorView) => void) => (v: EditorView, f: number, t2: number) => {
  v.dispatch({ changes: { from: f, to: t2 } });
  fn(v);
};

// icon tiles: short text for headings, Lucide outlines for the rest
const svg = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON = {
  todo: svg('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
  bullet: svg('<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>'),
  numbered: svg('<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
  quote: svg('<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>'),
  code: svg('<path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/>'),
  table: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>'),
  divider: svg('<path d="M5 12h14"/>'),
  link: svg('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/>'),
  drawing: svg('<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>'),
  board: svg('<path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/>'),
  note: svg('<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/>'),
};

const SLASH: SlashCommand[] = [
  { label: "Heading 1", description: "Big section title", section: "Text", icon: "H1", run: block("h1") },
  { label: "Heading 2", description: "Medium section title", section: "Text", icon: "H2", run: block("h2") },
  { label: "Heading 3", description: "Small section title", section: "Text", icon: "H3", run: block("h3") },
  { label: "To-do list", description: "Track tasks with checkboxes", section: "Lists", icon: ICON.todo, run: block("task") },
  { label: "Bullet list", description: "A simple list", section: "Lists", icon: ICON.bullet, run: block("bullet") },
  { label: "Numbered list", description: "A list with numbers", section: "Lists", icon: ICON.numbered, run: block("ordered") },
  { label: "Quote", description: "Set a quote or a key idea apart", section: "Blocks", icon: ICON.quote, run: block("quote") },
  { label: "Code block", description: "Code or preformatted text", section: "Blocks", icon: ICON.code, run: after(insertCodeBlock) },
  { label: "Table", description: "Rows and columns", section: "Blocks", icon: ICON.table, run: after(insertTable) },
  { label: "Divider", description: "A line between sections", section: "Blocks", icon: ICON.divider, run: after(insertDivider) },
  {
    label: "Link",
    description: "To a whiteboard, board or note",
    section: "Links",
    icon: ICON.link,
    run: (v, f, t2) => {
      v.dispatch({ changes: { from: f, to: t2, insert: "[[]]" }, selection: { anchor: f + 2 } });
      startCompletion(v);
    },
  },
];

const SECTION_RANK: Record<string, number> = { Text: 0, Lists: 1, Blocks: 2, Links: 3 };

/** The icon tile shown at the start of every suggestion. */
function iconTile(c: Completion): Node {
  const el = document.createElement("span");
  el.className = "md-opt-icon";
  const icon = (c as Completion & { icon?: string }).icon ?? "";
  if (icon.startsWith("<svg")) el.innerHTML = icon;
  else el.textContent = icon;
  return el;
}

function slashSource(ctx: CompletionContext): CompletionResult | null {
  const l = ctx.state.doc.lineAt(ctx.pos);
  const before = l.text.slice(0, ctx.pos - l.from);
  // a slash at the start of a line or after a space opens the commands ("and/or" does not)
  const m = /(?:^|\s)\/([\w -]{0,24})$/.exec(before);
  if (!m) return null;
  const from = ctx.pos - m[1].length;
  return {
    from,
    options: SLASH.map<Completion>((c) => ({
      label: c.label,
      detail: c.description,
      type: "slash",
      icon: c.icon,
      section: { name: c.section, rank: SECTION_RANK[c.section] },
      apply: (view, _c, f, to) => c.run(view, f - 1, to),
    }) as Completion),
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
        icon: ICON[c.kind],
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
  linkKindOf = opts.linkKind;
  let pending = 0;
  return [
    markdown({ base: markdownLanguage }),
    history(),
    EditorView.lineWrapping,
    syntaxHighlighting(highlight),
    livePreview,
    placeholder("Write something, or type / for commands and [[ to link a whiteboard, board or note"),
    autocompletion({
      override: [slashSource, wikiSource(opts.candidates)],
      icons: false,
      defaultKeymap: true,
      addToOptions: [{ render: iconTile, position: 20 }],
      optionClass: () => "md-opt",
      tooltipClass: () => "md-complete",
    }),
    keymap.of([
      { key: "Mod-b", run: (v) => (toggleInline(v, "bold"), true) },
      { key: "Mod-i", run: (v) => (toggleInline(v, "italic"), true) },
      { key: "Mod-Shift-x", run: (v) => (toggleInline(v, "strike"), true) },
      { key: "Mod-e", run: (v) => (toggleInline(v, "code"), true) },
      { key: "Mod-Alt-0", run: (v) => (setBlock(v, "p"), true) },
      { key: "Mod-Alt-1", run: (v) => (setBlock(v, "h1"), true) },
      { key: "Mod-Alt-2", run: (v) => (setBlock(v, "h2"), true) },
      { key: "Mod-Alt-3", run: (v) => (setBlock(v, "h3"), true) },
      { key: "Mod-Shift-7", run: (v) => (setBlock(v, "ordered"), true) },
      { key: "Mod-Shift-8", run: (v) => (setBlock(v, "bullet"), true) },
      { key: "Mod-Shift-9", run: (v) => (setBlock(v, "task"), true) },
      ...completionKeymap,
      ...markdownKeymap,
      ...historyKeymap,
      indentWithTab,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString());
      // tell the toolbar what is under the cursor, at most once per frame
      if ((u.docChanged || u.selectionSet || u.focusChanged) && opts.onState && !pending) {
        pending = requestAnimationFrame(() => {
          pending = 0;
          opts.onState!(activeState(u.view.state));
        });
      }
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
