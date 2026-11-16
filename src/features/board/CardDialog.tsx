import { useEffect, useState } from "react";
import { CalendarDays, CheckSquare, FileText, Link2, Plus, Tag, Trash2, X } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, IconButton, Input, Select, TextArea } from "@/components/ui";
import { addLabel, checklistProgress, colorName, columnOf, deleteCard, dueStatus, LABEL_COLORS, moveCard, removeLabel, updateCard, updateLabel, type BoardCard, type BoardLabel } from "@/engine/board";
import { openContextMenu, type MenuItem } from "@/components/Menu";
import { DrawingPicker } from "@/features/overlays/DrawingPicker";
import { allDrawings, useWorkspace } from "@/store/workspace";
import { askConfirm, askText, openDrawing } from "@/store/ui";
import { cx, formatDateTime } from "@/lib/utils";
import { useBoard } from "./boardStore";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export function DueBadge({ due, compact }: { due: string | null; compact?: boolean }) {
  if (!due) return null;
  const s = dueStatus(due);
  const label = new Date(`${due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-[600]",
        s === "overdue" ? "bg-danger-soft text-danger" : s === "today" || s === "soon" ? "bg-[oklch(0.8_0.14_75/0.18)] text-warning" : "bg-hover text-muted",
      )}
      title={s === "overdue" ? "Overdue" : s === "today" ? "Due today" : undefined}
    >
      <CalendarDays className="size-3" />
      {compact ? label : `${s === "overdue" ? "Overdue · " : s === "today" ? "Today · " : ""}${label}`}
    </span>
  );
}

export function CardDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const board = useBoard((s) => s.board);
  const change = useBoard((s) => s.change);
  const tree = useWorkspace((s) => s.tree);
  const card = board?.cards[cardId];
  const [title, setTitle] = useState(card?.title ?? "");
  const [desc, setDesc] = useState(card?.description ?? "");
  const [newItem, setNewItem] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    setTitle(card?.title ?? "");
    setDesc(card?.description ?? "");
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board || !card) return null;
  const col = columnOf(board, cardId);
  const patch = (p: Partial<BoardCard>) => change((b) => updateCard(b, cardId, p));
  const progress = checklistProgress(card);
  const drawings = allDrawings(tree);

  const labelMenu = (l: BoardLabel): MenuItem[] => [
    {
      label: "Rename…",
      onSelect: async () => {
        const name = await askText({ title: "Rename label", initial: l.name, confirmLabel: "Rename" });
        if (name?.trim()) change((b) => updateLabel(b, l.id, { name: name.trim() }));
      },
    },
    "separator",
    { heading: "Colour" },
    { title: "Label colour", swatches: LABEL_COLORS.map((c) => ({ color: c, name: colorName(c), checked: l.color.toUpperCase() === c, onSelect: () => change((b) => updateLabel(b, l.id, { color: c })) })) },
    "separator",
    {
      label: "Delete label…",
      danger: true,
      onSelect: async () => {
        if (await askConfirm({ title: `Delete the label “${l.name}”?`, message: "It is removed from every card on this board.", confirmLabel: "Delete label", danger: true })) change((b) => removeLabel(b, l.id));
      },
    },
  ];

  return (
    <Modal open onClose={onClose} width={720} bare>
      <div className="flex max-h-[calc(100vh-48px)] flex-col" onKeyDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <input
            value={title}
            aria-label="Card title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== card.title && patch({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className="font-display min-w-0 flex-1 rounded-md bg-transparent px-1 text-xl text-text outline-none focus:bg-surface-2"
          />
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px] overflow-y-auto">
          <div className="space-y-5 p-5">
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-[650] text-muted">
                <FileText className="size-3.5" /> Description
              </h3>
              <TextArea value={desc} placeholder="Add details, notes or acceptance criteria…" onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== card.description && patch({ description: desc })} className="min-h-28" />
            </section>
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-[650] text-muted">
                <CheckSquare className="size-3.5" /> Checklist {progress.total > 0 && <span className="text-faint">{progress.done}/{progress.total}</span>}
              </h3>
              {progress.total > 0 && (
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-hover">
                  <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              )}
              <ul className="space-y-0.5">
                {card.checklist.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={item.done}
                      aria-label={item.text}
                      onChange={() => patch({ checklist: card.checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <input
                      defaultValue={item.text}
                      aria-label="Checklist item"
                      onBlur={(e) => e.target.value.trim() && e.target.value !== item.text && patch({ checklist: card.checklist.map((i) => (i.id === item.id ? { ...i, text: e.target.value.trim() } : i)) })}
                      className={cx("min-w-0 flex-1 bg-transparent text-sm outline-none", item.done && "text-faint line-through")}
                    />
                    <IconButton label="Remove item" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => patch({ checklist: card.checklist.filter((i) => i.id !== item.id) })}>
                      <X className="size-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <form
                className="mt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  patch({ checklist: [...card.checklist, { id: uid(), text: newItem.trim(), done: false }] });
                  setNewItem("");
                }}
              >
                <Input icon={<Plus className="size-3.5" />} value={newItem} placeholder="Add an item and press Enter" onChange={(e) => setNewItem(e.target.value)} aria-label="New checklist item" />
              </form>
            </section>
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-[650] text-muted">
                <Link2 className="size-3.5" /> Linked drawings
              </h3>
              <ul className="space-y-0.5">
                {card.links.map((l) => {
                  const d = drawings.find((x) => x.id === l.id);
                  return (
                    <li key={l.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
                      <FileText className="size-3.5 text-faint" />
                      <button className="flex-1 truncate text-left text-sm cursor-pointer disabled:cursor-default disabled:text-faint" disabled={!d} onClick={async () => { onClose(); await useBoard.getState().flush(); openDrawing(d!.path); }}>
                        {d?.title ?? `${l.title} (missing)`}
                      </button>
                      <IconButton label="Unlink" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => patch({ links: card.links.filter((x) => x.id !== l.id) })}>
                        <X className="size-3.5" />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setPicker(true)}>
                Link a drawing
              </Button>
            </section>
          </div>
          <aside className="space-y-5 border-l border-border bg-surface-2 p-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-[650] text-muted">Column</span>
              <Select className="w-full" value={col?.id} onChange={(e) => change((b) => moveCard(b, cardId, e.target.value))} aria-label="Column">
                {board.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-[650] text-muted">
                <CalendarDays className="size-3.5" /> Due date
              </span>
              <div className="flex gap-1.5">
                <Input type="date" className="flex-1" value={card.due ?? ""} onChange={(e) => patch({ due: e.target.value || null })} aria-label="Due date" />
                {card.due && (
                  <IconButton label="Clear due date" size="md" onClick={() => patch({ due: null })}>
                    <X className="size-4" />
                  </IconButton>
                )}
              </div>
              {card.due && <div className="mt-1.5"><DueBadge due={card.due} /></div>}
            </label>
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-[650] text-muted">
                <Tag className="size-3.5" /> Labels
              </span>
              <div className="flex flex-wrap gap-1.5">
                {board.labels.map((l) => {
                  const on = card.labels.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      title="Right-click to rename, recolour or delete"
                      onContextMenu={(e) => openContextMenu(e, labelMenu(l))}
                      onClick={() => patch({ labels: on ? card.labels.filter((x) => x !== l.id) : [...card.labels, l.id] })}
                      className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs cursor-pointer", on ? "border-transparent text-white" : "border-border text-muted hover:text-text")}
                      style={on ? { background: l.color } : undefined}
                      aria-pressed={on}
                    >
                      {!on && <span className="size-2 rounded-full" style={{ background: l.color }} />}
                      {l.name}
                    </button>
                  );
                })}
              </div>
              <form
                className="mt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newLabel.trim()) return;
                  change((b) => {
                    const r = addLabel(b, newLabel, newLabelColor ?? undefined);
                    return updateCard(r.board, cardId, { labels: [...card.labels, r.label.id] });
                  });
                  setNewLabel("");
                  setNewLabelColor(null);
                }}
              >
                <Input value={newLabel} placeholder="New label" onChange={(e) => setNewLabel(e.target.value)} aria-label="New label" />
                <div role="radiogroup" aria-label="New label colour" className="mt-2 flex flex-wrap gap-[5px]">
                  {LABEL_COLORS.map((c) => {
                    const on = c === (newLabelColor ?? LABEL_COLORS[board.labels.length % LABEL_COLORS.length]);
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={colorName(c)}
                        title={colorName(c)}
                        onClick={() => setNewLabelColor(c)}
                        style={{ background: c }}
                        className={cx("size-4.5 rounded-full cursor-pointer transition-transform duration-150 hover:scale-110", on ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : "ring-1 ring-inset ring-black/10")}
                      />
                    );
                  })}
                </div>
              </form>
            </div>
            <div className="space-y-1 text-2xs text-faint">
              <p>Created {formatDateTime(card.createdAt)}</p>
              <p>Updated {formatDateTime(card.updatedAt)}</p>
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (await askConfirm({ title: "Delete this card?", message: `“${card.title}” will be removed from the board. Version history keeps earlier states of the board.`, confirmLabel: "Delete card", danger: true })) {
                  onClose();
                  change((b) => deleteCard(b, cardId));
                }
              }}
            >
              Delete card
            </Button>
          </aside>
        </div>
      </div>
      <DrawingPicker
        open={picker}
        title="Link a drawing to this card"
        exclude={card.links.map((l) => l.id)}
        onClose={() => setPicker(false)}
        onPick={(d) => {
          patch({ links: [...card.links, { id: d.id, title: d.title }] });
          setPicker(false);
        }}
      />
    </Modal>
  );
}
