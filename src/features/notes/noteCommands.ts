// Formatting commands for notes, shared by the toolbar, the keyboard shortcuts and the "/" menu.
// They only edit Markdown text, so the file stays readable by any Markdown app.
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

export type BlockKind = "p" | "h1" | "h2" | "h3" | "bullet" | "ordered" | "task" | "quote";
export type InlineKind = "bold" | "italic" | "strike" | "code";

const PREFIX: Record<BlockKind, string> = { p: "", h1: "# ", h2: "## ", h3: "### ", bullet: "- ", ordered: "1. ", task: "- [ ] ", quote: "> " };
const BLOCK_RE = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;

/** The block kind of a line of Markdown. */
export function blockOf(text: string): BlockKind {
  const t = text.trimStart();
  if (/^###\s/.test(t)) return "h3";
  if (/^##\s/.test(t)) return "h2";
  if (/^#\s/.test(t)) return "h1";
  if (/^[-*+]\s+\[[ xX]\]\s/.test(t)) return "task";
  if (/^[-*+]\s/.test(t)) return "bullet";
  if (/^\d+[.)]\s/.test(t)) return "ordered";
  if (/^>/.test(t)) return "quote";
  return "p";
}

/** Turn every line touched by the selection into `kind`; applying it again turns them back into text. */
export function setBlock(view: EditorView, kind: BlockKind) {
  const { state } = view;
  const lines = new Map<number, ReturnType<typeof state.doc.line>>();
  for (const r of state.selection.ranges)
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.set(n, state.doc.line(n));
  const all = [...lines.values()];
  const target = kind !== "p" && all.every((l) => blockOf(l.text) === kind) ? "p" : kind;
  let counter = 0;
  const changes = all.map((l) => {
    const m = BLOCK_RE.exec(l.text)!;
    counter++;
    const prefix = target === "ordered" ? `${counter}. ` : PREFIX[target];
    return { from: l.from + m[1].length, to: l.from + m[0].length, insert: prefix };
  });
  view.dispatch({ changes });
  view.focus();
}

const NODE: Record<InlineKind, string> = { bold: "StrongEmphasis", italic: "Emphasis", strike: "Strikethrough", code: "InlineCode" };
const MARK: Record<InlineKind, string> = { bold: "**", italic: "*", strike: "~~", code: "`" };

/** The innermost Markdown node of a kind around a position, if any. */
function nodeAround(state: EditorState, pos: number, kind: InlineKind) {
  for (let n: any = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === NODE[kind]) return n as { from: number; to: number; firstChild: { from: number; to: number } | null; lastChild: { from: number; to: number } | null };
    if (n.name === "Paragraph" || n.name === "Document") break;
  }
  for (let n: any = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === NODE[kind]) return n;
    if (n.name === "Paragraph" || n.name === "Document") break;
  }
  return null;
}

export function inlineActive(state: EditorState, kind: InlineKind): boolean {
  const r = state.selection.main;
  return !!nodeAround(state, r.from, kind) && (r.empty || !!nodeAround(state, r.to, kind));
}

/** Bold, italic, strikethrough or inline code: wraps the selection, or removes the marks around it. */
export function toggleInline(view: EditorView, kind: InlineKind) {
  const { state } = view;
  const mark = MARK[kind];
  view.dispatch(
    state.changeByRange((r) => {
      const node = nodeAround(state, r.from, kind);
      if (node && node.firstChild && node.lastChild && node.to >= r.to) {
        const open = node.firstChild.to - node.firstChild.from;
        const close = node.lastChild.to - node.lastChild.from;
        return {
          changes: [
            { from: node.from, to: node.from + open },
            { from: node.to - close, to: node.to },
          ],
          range: EditorSelection.range(Math.max(node.from, r.from - open), Math.max(node.from, r.to - open)),
        };
      }
      if (r.empty) return { changes: { from: r.from, insert: mark + mark }, range: EditorSelection.cursor(r.from + mark.length) };
      return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: EditorSelection.range(r.from + mark.length, r.to + mark.length) };
    }),
  );
  view.focus();
}

/** Insert a block on its own line (after the current one when it has text). */
function insertBlock(view: EditorView, text: string, caret: number, selectTo?: number) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = !line.text.trim();
  const from = empty ? line.from : line.to;
  const before = empty ? "" : "\n";
  view.dispatch({
    changes: { from, to: empty ? line.to : line.to, insert: before + text },
    selection: selectTo !== undefined ? EditorSelection.range(from + before.length + caret, from + before.length + selectTo) : EditorSelection.cursor(from + before.length + caret),
  });
  view.focus();
}

export const insertCodeBlock = (view: EditorView) => insertBlock(view, "```\n\n```", 4);
export const insertDivider = (view: EditorView) => insertBlock(view, "---\n", 4);
export const insertTable = (view: EditorView) => insertBlock(view, "| Column | Column |\n| --- | --- |\n|  |  |", 2, 8);

/** Insert a [[link]] to a document at the selection. */
export function insertLink(view: EditorView, title: string) {
  const { from, to } = view.state.selection.main;
  const insert = `[[${title}]]`;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
  view.focus();
}

export interface ActiveState {
  block: BlockKind;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
}

export function activeState(state: EditorState): ActiveState {
  return {
    block: blockOf(state.doc.lineAt(state.selection.main.head).text),
    bold: inlineActive(state, "bold"),
    italic: inlineActive(state, "italic"),
    strike: inlineActive(state, "strike"),
    code: inlineActive(state, "code"),
  };
}

export function wordCount(text: string): number {
  return (text.replace(/[#>*_`~[\]()|-]/g, " ").match(/[\p{L}\p{N}']+/gu) ?? []).length;
}
