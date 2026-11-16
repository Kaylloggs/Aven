// Kanban boards: a separate document type (`.avenboard`) stored next to drawings.
// Pure functions only; the UI keeps a board in state and saves it through the same safe
// write path as drawings (atomic writes, version history, conflict detection).

export const BOARD_FORMAT_VERSION = 1;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  labels: string[]; // label ids
  due: string | null; // YYYY-MM-DD
  checklist: ChecklistItem[];
  /** linked drawings (by drawing id) */
  links: { id: string; title: string }[];
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  /** maximum number of cards (0 = no limit) */
  wipLimit: number;
  cardIds: string[];
}

export interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface BoardDoc {
  type: "aven-board";
  version: number;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  columns: BoardColumn[];
  cards: Record<string, BoardCard>;
  labels: BoardLabel[];
  meta: { description: string; tags: string[] };
}

export type BoardPreset = "kanban" | "sprint" | "content" | "week" | "blank";

export const LABEL_COLORS = ["#F76046", "#F5AE39", "#2FB27E", "#567BF7", "#8E5BE8", "#E64980", "#22B8CF", "#868E96"];
export const COLUMN_COLORS = ["#868E96", "#567BF7", "#F5AE39", "#8E5BE8", "#2FB27E", "#F76046", "#22B8CF"];

const COLOR_NAMES: Record<string, string> = {
  "#F76046": "Coral",
  "#F5AE39": "Honey",
  "#2FB27E": "Green",
  "#567BF7": "Blue",
  "#8E5BE8": "Violet",
  "#E64980": "Pink",
  "#22B8CF": "Cyan",
  "#868E96": "Grey",
};

/** Human name of a board colour, for screen readers and tooltips. */
export function colorName(hex: string): string {
  return COLOR_NAMES[hex.toUpperCase()] ?? hex;
}

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

const PRESETS: Record<BoardPreset, string[]> = {
  kanban: ["To do", "In progress", "Done"],
  sprint: ["Backlog", "To do", "In progress", "Review", "Done"],
  content: ["Ideas", "Writing", "Editing", "Scheduled", "Published"],
  week: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"],
  blank: ["New column"],
};

export function createBoard(title: string, preset: BoardPreset = "kanban"): BoardDoc {
  const now = Date.now();
  const columns = PRESETS[preset].map((t, i) => ({ id: uid(), title: t, color: COLUMN_COLORS[i % COLUMN_COLORS.length], wipLimit: 0, cardIds: [] as string[] }));
  const labels: BoardLabel[] = [
    { id: uid(), name: "Urgent", color: LABEL_COLORS[0] },
    { id: uid(), name: "Design", color: LABEL_COLORS[4] },
    { id: uid(), name: "Idea", color: LABEL_COLORS[1] },
  ];
  const board: BoardDoc = { type: "aven-board", version: BOARD_FORMAT_VERSION, id: crypto.randomUUID(), title: title.trim() || "Board", createdAt: now, updatedAt: now, columns, cards: {}, labels, meta: { description: "", tags: [] } };
  if (preset === "kanban") {
    let b = addCard(board, columns[0].id, "Drag me to another column");
    b = addCard(b, columns[0].id, "Click a card to add details, a checklist or a due date");
    b = addCard(b, columns[1].id, "Link a card to a drawing from its details");
    return b;
  }
  return board;
}

export function newCard(title: string): BoardCard {
  const now = Date.now();
  return { id: uid(), title: title.trim() || "Untitled card", description: "", labels: [], due: null, checklist: [], links: [], color: null, createdAt: now, updatedAt: now };
}

const touch = (b: BoardDoc): BoardDoc => ({ ...b, updatedAt: Date.now() });

export function addCard(b: BoardDoc, columnId: string, title: string, atTop = false): BoardDoc {
  const card = newCard(title);
  return touch({
    ...b,
    cards: { ...b.cards, [card.id]: card },
    columns: b.columns.map((c) => (c.id === columnId ? { ...c, cardIds: atTop ? [card.id, ...c.cardIds] : [...c.cardIds, card.id] } : c)),
  });
}

export function updateCard(b: BoardDoc, cardId: string, patch: Partial<BoardCard>): BoardDoc {
  const card = b.cards[cardId];
  if (!card) return b;
  return touch({ ...b, cards: { ...b.cards, [cardId]: { ...card, ...patch, id: cardId, updatedAt: Date.now() } } });
}

export function deleteCard(b: BoardDoc, cardId: string): BoardDoc {
  const cards = { ...b.cards };
  delete cards[cardId];
  return touch({ ...b, cards, columns: b.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => id !== cardId) })) });
}

export function columnOf(b: BoardDoc, cardId: string): BoardColumn | undefined {
  return b.columns.find((c) => c.cardIds.includes(cardId));
}

/** Move a card to `toColumn` at `index` (end when omitted). */
export function moveCard(b: BoardDoc, cardId: string, toColumn: string, index?: number): BoardDoc {
  if (!b.cards[cardId] || !b.columns.some((c) => c.id === toColumn)) return b;
  const columns = b.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => id !== cardId) }));
  const target = columns.find((c) => c.id === toColumn)!;
  const at = index === undefined ? target.cardIds.length : Math.max(0, Math.min(index, target.cardIds.length));
  target.cardIds.splice(at, 0, cardId);
  return touch({ ...b, columns });
}

export function addColumn(b: BoardDoc, title = "New column"): BoardDoc {
  return touch({ ...b, columns: [...b.columns, { id: uid(), title, color: COLUMN_COLORS[b.columns.length % COLUMN_COLORS.length], wipLimit: 0, cardIds: [] }] });
}

export function updateColumn(b: BoardDoc, columnId: string, patch: Partial<Omit<BoardColumn, "id" | "cardIds">>): BoardDoc {
  return touch({ ...b, columns: b.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)) });
}

export function moveColumn(b: BoardDoc, columnId: string, toIndex: number): BoardDoc {
  const cols = [...b.columns];
  const from = cols.findIndex((c) => c.id === columnId);
  if (from < 0) return b;
  const [c] = cols.splice(from, 1);
  cols.splice(Math.max(0, Math.min(toIndex, cols.length)), 0, c);
  return touch({ ...b, columns: cols });
}

/** Delete a column; its cards move to `moveTo` or are deleted. */
export function deleteColumn(b: BoardDoc, columnId: string, moveTo: string | null): BoardDoc {
  const col = b.columns.find((c) => c.id === columnId);
  if (!col) return b;
  let next: BoardDoc = { ...b, columns: b.columns.filter((c) => c.id !== columnId) };
  if (moveTo && next.columns.some((c) => c.id === moveTo)) next = { ...next, columns: next.columns.map((c) => (c.id === moveTo ? { ...c, cardIds: [...c.cardIds, ...col.cardIds] } : c)) };
  else {
    const cards = { ...next.cards };
    for (const id of col.cardIds) delete cards[id];
    next = { ...next, cards };
  }
  return touch(next);
}

export function addLabel(b: BoardDoc, name: string, color?: string): { board: BoardDoc; label: BoardLabel } {
  const label = { id: uid(), name: name.trim() || "Label", color: color ?? LABEL_COLORS[b.labels.length % LABEL_COLORS.length] };
  return { board: touch({ ...b, labels: [...b.labels, label] }), label };
}

export function updateLabel(b: BoardDoc, labelId: string, patch: Partial<Omit<BoardLabel, "id">>): BoardDoc {
  return touch({ ...b, labels: b.labels.map((l) => (l.id === labelId ? { ...l, ...patch } : l)) });
}

export function removeLabel(b: BoardDoc, labelId: string): BoardDoc {
  const cards = Object.fromEntries(Object.entries(b.cards).map(([id, c]) => [id, c.labels.includes(labelId) ? { ...c, labels: c.labels.filter((l) => l !== labelId) } : c]));
  return touch({ ...b, labels: b.labels.filter((l) => l.id !== labelId), cards });
}

export function checklistProgress(c: BoardCard): { done: number; total: number } {
  return { done: c.checklist.filter((i) => i.done).length, total: c.checklist.length };
}

export function dueStatus(due: string | null, today = new Date()): "none" | "overdue" | "today" | "soon" | "later" {
  if (!due) return "none";
  const d = new Date(`${due}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  return days < 0 ? "overdue" : days === 0 ? "today" : days <= 3 ? "soon" : "later";
}

// ------------------------------------------------------------------ files

export function serializeBoard(b: BoardDoc): string {
  return JSON.stringify({ ...b, version: BOARD_FORMAT_VERSION });
}

export function parseBoard(text: string, fallbackTitle = "Board"): BoardDoc {
  const raw = JSON.parse(text);
  if (!raw || raw.type !== "aven-board") throw new Error("This file is not an Aven board.");
  if (typeof raw.version === "number" && raw.version > BOARD_FORMAT_VERSION) throw new Error("This board was saved by a newer version of Aven. Update Aven to open it.");
  const cards: Record<string, BoardCard> = {};
  for (const [id, c] of Object.entries<any>(raw.cards ?? {})) {
    if (!c || typeof c !== "object") continue;
    cards[id] = {
      id,
      title: String(c.title ?? ""),
      description: String(c.description ?? ""),
      labels: Array.isArray(c.labels) ? c.labels.filter((x: unknown) => typeof x === "string") : [],
      due: typeof c.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.due) ? c.due : null,
      checklist: Array.isArray(c.checklist) ? c.checklist.filter((i: any) => i && typeof i.text === "string").map((i: any) => ({ id: String(i.id ?? uid()), text: i.text, done: !!i.done })) : [],
      links: Array.isArray(c.links) ? c.links.filter((l: any) => l && typeof l.id === "string") : [],
      color: typeof c.color === "string" ? c.color : null,
      createdAt: Number(c.createdAt) || Date.now(),
      updatedAt: Number(c.updatedAt) || Date.now(),
    };
  }
  const seen = new Set<string>();
  const columns: BoardColumn[] = (Array.isArray(raw.columns) ? raw.columns : []).map((c: any, i: number) => ({
    id: String(c.id ?? uid()),
    title: String(c.title ?? `Column ${i + 1}`),
    color: typeof c.color === "string" ? c.color : COLUMN_COLORS[i % COLUMN_COLORS.length],
    wipLimit: Math.max(0, Number(c.wipLimit) || 0),
    // every card appears once, in the first column that lists it
    cardIds: (Array.isArray(c.cardIds) ? c.cardIds : []).filter((id: string) => cards[id] && !seen.has(id) && seen.add(id)),
  }));
  // cards not referenced by any column go to the first column instead of being lost
  const orphans = Object.keys(cards).filter((id) => !seen.has(id));
  if (orphans.length) {
    if (!columns.length) columns.push({ id: uid(), title: "Cards", color: COLUMN_COLORS[0], wipLimit: 0, cardIds: [] });
    columns[0].cardIds.push(...orphans);
  }
  return {
    type: "aven-board",
    version: BOARD_FORMAT_VERSION,
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallbackTitle,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    columns,
    cards,
    labels: Array.isArray(raw.labels) ? raw.labels.filter((l: any) => l && typeof l.id === "string") : [],
    meta: { description: String(raw.meta?.description ?? ""), tags: Array.isArray(raw.meta?.tags) ? raw.meta.tags : [] },
  };
}

/** All text in a board, for the search index. */
export function boardText(b: BoardDoc): string {
  const parts = [b.title, b.meta.description, ...b.columns.map((c) => c.title)];
  for (const c of Object.values(b.cards)) parts.push(c.title, c.description, ...c.checklist.map((i) => i.text));
  return parts.filter(Boolean).join("\n").slice(0, 20000);
}

/**
 * Markdown compatible with Obsidian's community "Kanban" plugin (and readable anywhere,
 * including Notion's Markdown import): one heading per column, one task per card.
 */
export function boardToMarkdown(b: BoardDoc, opts: { obsidianKanban?: boolean } = {}): string {
  const label = (id: string) => b.labels.find((l) => l.id === id)?.name;
  const out: string[] = [];
  if (opts.obsidianKanban) out.push("---", "", "kanban-plugin: basic", "", "---", "");
  else out.push(`# ${b.title}`, "");
  const doneCols = new Set(b.columns.filter((c) => /^(done|published|terminé|fait)$/i.test(c.title.trim())).map((c) => c.id));
  for (const col of b.columns) {
    out.push(`## ${col.title}`, "");
    for (const id of col.cardIds) {
      const c = b.cards[id];
      if (!c) continue;
      const tags = c.labels.map(label).filter(Boolean).map((n) => `#${n!.replace(/\s+/g, "-")}`);
      const due = c.due ? (opts.obsidianKanban ? ` @{${c.due}}` : ` (due ${c.due})`) : "";
      const allDone = c.checklist.length > 0 && c.checklist.every((i) => i.done);
      out.push(`- [${doneCols.has(col.id) || allDone ? "x" : " "}] ${c.title}${due}${tags.length ? ` ${tags.join(" ")}` : ""}`);
      if (c.description.trim()) for (const line of c.description.trim().split(/\r?\n/)) out.push(`\t${line}`);
      for (const i of c.checklist) out.push(`\t- [${i.done ? "x" : " "}] ${i.text}`);
      for (const l of c.links) out.push(`\t- Drawing: ${l.title}`);
    }
    out.push("");
  }
  if (opts.obsidianKanban) out.push("", "%% kanban:settings", "```", '{"kanban-plugin":"basic"}', "```", "%%", "");
  return out.join("\n");
}
