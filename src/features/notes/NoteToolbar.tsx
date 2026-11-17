import { Bold, Code, Italic, Link2, List, ListChecks, ListOrdered, Minus, SquareCode, Strikethrough, Table2, TextQuote } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { IconButton } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { cx } from "@/lib/utils";
import { insertCodeBlock, insertDivider, insertTable, setBlock, toggleInline, type ActiveState, type BlockKind } from "./noteCommands";

const BLOCKS: { kind: BlockKind; label: string; short: string; shortcut: string }[] = [
  { kind: "p", label: "Text", short: "T", shortcut: "Mod+Alt+0" },
  { kind: "h1", label: "Heading 1", short: "H1", shortcut: "Mod+Alt+1" },
  { kind: "h2", label: "Heading 2", short: "H2", shortcut: "Mod+Alt+2" },
  { kind: "h3", label: "Heading 3", short: "H3", shortcut: "Mod+Alt+3" },
];

const Sep = () => <span aria-hidden className="my-1.5 h-px w-5 shrink-0 rounded-full bg-border" />;

/** Vertical formatting bar on the left of the note. Buttons keep the editor's focus and selection. */
export function NoteToolbar({ view, state, onLink }: { view: () => EditorView | null; state: ActiveState; onLink: () => void }) {
  const run = (fn: (v: EditorView) => void) => () => {
    const v = view();
    if (v) fn(v);
  };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // do not steal the editor's focus
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, opts: { shortcut?: string; active?: boolean } = {}) => (
    <IconButton
      label={label}
      shortcut={opts.shortcut}
      active={opts.active}
      tipSide="right"
      onMouseDown={keep}
      onClick={onClick}
      className={cx(opts.active && "!bg-accent-soft !text-accent-text")}
    >
      {icon}
    </IconButton>
  );
  const isHeading = state.block === "h1" || state.block === "h2" || state.block === "h3";
  const current = BLOCKS.find((b) => b.kind === (isHeading ? state.block : "p"))!;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="vertical"
      className="island pointer-events-auto flex max-h-[calc(100vh-150px)] w-[52px] flex-col items-center gap-0.5 overflow-y-auto py-2 [scrollbar-width:none]"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={`Text style: ${current.label}`}
        data-tip="Text style"
        data-tip-side="right"
        onMouseDown={keep}
        onClick={(e) =>
          openMenuAt(
            e.currentTarget,
            BLOCKS.map((b) => ({ label: b.label, checked: current.kind === b.kind, shortcut: b.shortcut, onSelect: run((v) => setBlock(v, b.kind === "p" && !isHeading ? "p" : b.kind)) })),
            "start",
            { side: "right", closeOnLeave: true },
          )
        }
        className={cx(
          "font-display grid size-8 cursor-pointer place-items-center rounded-md text-[13px] font-[700]",
          isHeading ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-hover hover:text-text",
        )}
      >
        {current.short}
      </button>
      <Sep />
      {btn("Bold", <Bold className="size-4" />, run((v) => toggleInline(v, "bold")), { shortcut: "Mod+B", active: state.bold })}
      {btn("Italic", <Italic className="size-4" />, run((v) => toggleInline(v, "italic")), { shortcut: "Mod+I", active: state.italic })}
      {btn("Strikethrough", <Strikethrough className="size-4" />, run((v) => toggleInline(v, "strike")), { shortcut: "Mod+Shift+X", active: state.strike })}
      {btn("Inline code", <Code className="size-4" />, run((v) => toggleInline(v, "code")), { shortcut: "Mod+E", active: state.code })}
      <Sep />
      {btn("Bulleted list", <List className="size-4" />, run((v) => setBlock(v, "bullet")), { shortcut: "Mod+Shift+8", active: state.block === "bullet" })}
      {btn("Numbered list", <ListOrdered className="size-4" />, run((v) => setBlock(v, "ordered")), { shortcut: "Mod+Shift+7", active: state.block === "ordered" })}
      {btn("To-do list", <ListChecks className="size-4" />, run((v) => setBlock(v, "task")), { shortcut: "Mod+Shift+9", active: state.block === "task" })}
      <Sep />
      {btn("Quote", <TextQuote className="size-4" />, run((v) => setBlock(v, "quote")), { active: state.block === "quote" })}
      {btn("Code block", <SquareCode className="size-4" />, run(insertCodeBlock))}
      {btn("Table", <Table2 className="size-4" />, run(insertTable))}
      {btn("Divider", <Minus className="size-4" />, run(insertDivider))}
      <Sep />
      {btn("Link a whiteboard, board or note", <Link2 className="size-4" />, onLink, { shortcut: "[[" })}
    </div>
  );
}
