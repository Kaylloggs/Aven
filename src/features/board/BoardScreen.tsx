import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronRight,
  Clipboard,
  CloudOff,
  Download,
  FileText,
  FolderOpen,
  GripVertical,
  Link2,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, pickSavePath, revealInExplorer } from "@/platform/api";
import {
  addCard,
  addColumn,
  boardToMarkdown,
  checklistProgress,
  COLUMN_COLORS,
  colorName,
  deleteCard,
  deleteColumn,
  moveCard,
  moveColumn,
  parseBoard,
  updateCard,
  updateColumn,
  type BoardCard,
  type BoardColumn,
  type BoardDoc,
} from "@/engine/board";
import { Button, IconButton, Input, Spinner } from "@/components/ui";
import { openContextMenu, openMenuAt, type MenuItem } from "@/components/Menu";
import { allBoards, projectFor, useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { askConfirm, askText, toast, useUI } from "@/store/ui";
import { basename, join } from "@/lib/path";
import { cx, errorMessage, timeAgo } from "@/lib/utils";
import { safeNoteName } from "@/features/export/markdown";
import { CardDialog, DueBadge } from "./CardDialog";
import { useBoard } from "./boardStore";

const CARD_TYPE = "application/x-aven-card";
const COL_TYPE = "application/x-aven-column";

function SaveStatus() {
  const state = useBoard((s) => s.saveState);
  const last = useBoard((s) => s.lastSavedAt);
  const m = {
    saved: { icon: <Check className="size-3.5 text-success" />, text: last ? `Saved ${timeAgo(last)}` : "Saved" },
    dirty: { icon: <span className="size-2 rounded-full bg-warning" />, text: "Saving soon" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    error: { icon: <CloudOff className="size-3.5 text-danger" />, text: "Not saved" },
    conflict: { icon: <TriangleAlert className="size-3.5 text-danger" />, text: "Changed on disk" },
  }[state];
  return (
    <span className="flex h-7 items-center gap-1.5 px-2 text-xs text-muted" aria-live="polite">
      {m.icon}
      {m.text}
    </span>
  );
}

async function leave() {
  await useBoard.getState().close();
  await useWorkspace.getState().refresh();
  useUI.getState().back();
}

function CardTile({ card, onOpen, onMenu, labels, dragging }: { card: BoardCard; onOpen: () => void; onMenu: (e: React.MouseEvent) => void; labels: BoardDoc["labels"]; dragging: boolean }) {
  const p = checklistProgress(card);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CARD_TYPE, card.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onContextMenu={onMenu}
      data-card={card.id}
      className={cx(
        "lift group block w-full rounded-xl border border-border bg-raised p-3 text-left shadow-[var(--shadow-sm)] cursor-pointer hover:border-border-strong",
        dragging && "opacity-40",
      )}
    >
      {card.labels.length > 0 && (
        <span className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((id) => {
            const l = labels.find((x) => x.id === id);
            return l ? (
              <span key={id} className="rounded-full px-1.5 py-px text-2xs font-[650] text-white" style={{ background: l.color }}>
                {l.name}
              </span>
            ) : null;
          })}
        </span>
      )}
      <span className="block text-sm text-text break-words">{card.title}</span>
      {(card.due || p.total > 0 || card.links.length > 0 || card.description) && (
        <span className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-faint">
          <DueBadge due={card.due} compact />
          {p.total > 0 && (
            <span className={cx("inline-flex items-center gap-1", p.done === p.total && "text-success")}>
              <CheckSquare className="size-3" /> {p.done}/{p.total}
            </span>
          )}
          {card.links.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3" /> {card.links.length}
            </span>
          )}
          {card.description && <FileText className="size-3" aria-label="Has a description" />}
        </span>
      )}
    </button>
  );
}

function ColumnView({ col, filter, onOpenCard }: { col: BoardColumn; filter: (c: BoardCard) => boolean; onOpenCard: (id: string) => void }) {
  const board = useBoard((s) => s.board)!;
  const change = useBoard((s) => s.change);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingCard, setDraggingCard] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cards = col.cardIds.map((id) => board.cards[id]).filter(Boolean);
  const visible = cards.filter(filter);
  const over = col.wipLimit > 0 && cards.length > col.wipLimit;

  const indexAt = (clientY: number) => {
    const tiles = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return col.cardIds.indexOf(tiles[i].dataset.card!);
    }
    return col.cardIds.length;
  };

  const menuItems = (): MenuItem[] => [
      { label: "Rename…", onSelect: async () => { const t = await askText({ title: "Rename column", initial: col.title, confirmLabel: "Rename" }); if (t) change((b) => updateColumn(b, col.id, { title: t })); } },
      "separator",
      { heading: "Colour" },
      { title: "Column colour", swatches: COLUMN_COLORS.map((c) => ({ color: c, name: colorName(c), checked: col.color.toUpperCase() === c, onSelect: () => change((b) => updateColumn(b, col.id, { color: c })) })) },
      "separator",
      {
        label: "Card limit (WIP)…",
        hint: col.wipLimit ? String(col.wipLimit) : "none",
        onSelect: async () => {
          const v = await askText({ title: "Card limit", label: "Maximum number of cards (0 for no limit)", initial: String(col.wipLimit), confirmLabel: "Save" });
          if (v !== null) change((b) => updateColumn(b, col.id, { wipLimit: Math.max(0, Math.floor(Number(v) || 0)) }));
        },
      },
      "separator",
      { label: "Move left", disabled: board.columns[0].id === col.id, onSelect: () => change((b) => moveColumn(b, col.id, b.columns.findIndex((c) => c.id === col.id) - 1)) },
      { label: "Move right", disabled: board.columns.at(-1)!.id === col.id, onSelect: () => change((b) => moveColumn(b, col.id, b.columns.findIndex((c) => c.id === col.id) + 1)) },
      "separator",
      {
        label: "Delete column…",
        danger: true,
        onSelect: async () => {
          const others = board.columns.filter((c) => c.id !== col.id);
          if (cards.length && others.length) {
            const keep = await askConfirm({ title: `Delete “${col.title}”?`, message: `Move its ${cards.length} card(s) to “${others[0].title}”? Choose Cancel to keep the column.`, confirmLabel: `Delete and move cards` });
            if (keep) change((b) => deleteColumn(b, col.id, others[0].id));
          } else if (await askConfirm({ title: `Delete “${col.title}”?`, message: cards.length ? "Its cards are deleted too." : "The column is empty.", confirmLabel: "Delete column", danger: true })) change((b) => deleteColumn(b, col.id, null));
        },
      },
    ];
  const menu = (el: HTMLElement) => openMenuAt(el, menuItems());

  const cardMenu = (c: BoardCard): MenuItem[] => [
    { label: "Open", onSelect: () => onOpenCard(c.id) },
    {
      label: "Rename…",
     
      onSelect: async () => {
        const t = await askText({ title: "Rename card", initial: c.title, confirmLabel: "Rename" });
        if (t?.trim()) change((b) => updateCard(b, c.id, { title: t.trim() }));
      },
    },
    {
      label: "Move to",
     
      submenu: board.columns.map((other) => ({
        label: other.title,
        checked: other.id === col.id,
        onSelect: () => other.id !== col.id && change((b) => moveCard(b, c.id, other.id)),
      })),
    },
    {
      label: "Labels",
     
      disabled: board.labels.length === 0,
      submenu: board.labels.map((l) => {
        const on = c.labels.includes(l.id);
        return {
          label: l.name,
          icon: <span className="size-2.5 rounded-full" style={{ background: l.color }} />,
          hint: on ? "on" : undefined,
          onSelect: () => change((b) => updateCard(b, c.id, { labels: on ? c.labels.filter((x) => x !== l.id) : [...c.labels, l.id] })),
        };
      }),
    },
    "separator",
    {
      label: "Delete card…",
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: async () => {
        if (await askConfirm({ title: "Delete this card?", message: `“${c.title}” will be removed from the board. Version history keeps earlier states of the board.`, confirmLabel: "Delete card", danger: true })) change((b) => deleteCard(b, c.id));
      },
    },
  ];

  return (
    <section
      aria-label={col.title}
      className="island flex max-h-full w-[300px] shrink-0 flex-col overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(CARD_TYPE)) {
          e.preventDefault();
          setDropIndex(indexAt(e.clientY));
        }
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropIndex(null);
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(CARD_TYPE);
        if (!id) return;
        e.preventDefault();
        const to = indexAt(e.clientY);
        const fromSame = col.cardIds.indexOf(id);
        change((b) => moveCard(b, id, col.id, fromSame >= 0 && fromSame < to ? to - 1 : to));
        setDropIndex(null);
      }}
    >
      <header
        className="flex items-center gap-2 px-3 pb-1 pt-3"
        draggable
        onDragStart={(e) => e.dataTransfer.setData(COL_TYPE, col.id)}
        onContextMenu={(e) => openContextMenu(e, menuItems())}
      >
        <GripVertical className="size-3.5 shrink-0 cursor-grab text-faint" aria-hidden />
        <span className="facet-dot" style={{ ["--fold" as any]: col.color }} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-[650]" onDoubleClick={async () => { const t = await askText({ title: "Rename column", initial: col.title, confirmLabel: "Rename" }); if (t) change((b) => updateColumn(b, col.id, { title: t })); }}>
          {col.title}
        </h2>
        <span className={cx("rounded-full px-1.5 text-2xs tabular-nums", over ? "bg-danger-soft text-danger" : "bg-hover text-muted")} title={col.wipLimit ? `Limit ${col.wipLimit}` : undefined}>
          {cards.length}
          {col.wipLimit ? `/${col.wipLimit}` : ""}
        </span>
        <IconButton label="Column options" size="sm" onClick={(e) => menu(e.currentTarget)}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      </header>
      <div ref={listRef} className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-1.5" onDragStart={(e) => setDraggingCard((e.target as HTMLElement).dataset.card ?? null)} onDragEnd={() => { setDraggingCard(null); setDropIndex(null); }}>
        {visible.map((c) => (
          <div key={c.id}>
            {dropIndex === col.cardIds.indexOf(c.id) && <div className="mb-2 h-1 rounded-full bg-accent" />}
            <CardTile card={c} labels={board.labels} onOpen={() => onOpenCard(c.id)} onMenu={(e) => openContextMenu(e, cardMenu(c))} dragging={draggingCard === c.id} />
          </div>
        ))}
        {dropIndex === col.cardIds.length && <div className="h-1 rounded-full bg-accent" />}
        {cards.length > visible.length && <p className="text-center text-2xs text-faint">{cards.length - visible.length} hidden by the filter</p>}
      </div>
      <div className="px-3 pb-3">
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return setAdding(false);
              change((b) => addCard(b, col.id, draft));
              setDraft("");
            }}
          >
            <textarea
              autoFocus
              value={draft}
              rows={2}
              placeholder="Card title, Enter to add"
              aria-label="New card title"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={() => !draft.trim() && setAdding(false)}
              className="w-full resize-none rounded-xl border border-accent bg-surface-2 p-2.5 text-sm text-text outline-none ring-2 ring-accent-soft"
            />
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" variant="primary" type="submit">
                Add card
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-hover hover:text-text cursor-pointer">
            <Plus className="size-4" /> Add a card
          </button>
        )}
      </div>
    </section>
  );
}

function Board() {
  const board = useBoard((s) => s.board)!;
  const path = useBoard((s) => s.path);
  const change = useBoard((s) => s.change);
  const saveState = useBoard((s) => s.saveState);
  const tree = useWorkspace((s) => s.tree);
  const ob = useSettings((s) => s.settings.export.obsidian);
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [colDrop, setColDrop] = useState<number | null>(null);
  const project = projectFor(tree, path);

  const filter = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (c: BoardCard) => (!q || `${c.title} ${c.description} ${c.checklist.map((i) => i.text).join(" ")}`.toLowerCase().includes(q)) && (!labelFilter || c.labels.includes(labelFilter));
  }, [query, labelFilter]);

  const rename = async () => {
    const t = await askText({ title: "Rename board", initial: board.title, confirmLabel: "Rename" });
    if (!t || t === board.title) return;
    change((b) => ({ ...b, title: t }));
    await useBoard.getState().save();
    try {
      const np = await api.itemRename(path, t);
      useBoard.setState({ path: np, modified: 0 });
      await useBoard.getState().save(true);
      await useWorkspace.getState().refresh();
    } catch (e) {
      toast({ kind: "error", title: "Could not rename the file", message: errorMessage(e) });
    }
  };

  const exportItems = (): MenuItem[] => [
        {
          label: "Copy as Markdown checklist",
          icon: <Clipboard className="size-4" />,
          hint: "paste in Notion",
          onSelect: async () => {
            await navigator.clipboard.writeText(boardToMarkdown(board));
            toast({ kind: "success", title: "Board copied as Markdown", message: "Paste it in Notion, Obsidian or any Markdown editor." });
          },
        },
        {
          label: "Export Markdown file…",
          icon: <Download className="size-4" />,
          onSelect: async () => {
            const out = await pickSavePath("Export board", `${safeNoteName(board.title)}.md`, [{ name: "Markdown", extensions: ["md"] }]);
            if (!out) return;
            await api.fileWriteText(out, boardToMarkdown(board));
            toast({ kind: "success", title: "Board exported", message: out });
          },
        },
        {
          label: "Export to Obsidian (Kanban plugin)",
          icon: <NotebookPen className="size-4" />,
          disabled: !ob.vaultPath,
          hint: ob.vaultPath ? undefined : "set a vault first",
          onSelect: async () => {
            const dir = join(ob.vaultPath!, ob.folder.replace(/\//g, "\\"));
            await api.dirCreate(dir);
            const file = join(dir, `${safeNoteName(board.title)}.md`);
            await api.fileWriteText(file, boardToMarkdown(board, { obsidianKanban: true }));
            toast({ kind: "success", title: "Board written to your vault", message: `${file}. Open it with Obsidian's Kanban community plugin, or read it as a plain checklist.` });
          },
        },
        "separator",
        { label: "Show in File Explorer", icon: <FolderOpen className="size-4" />, onSelect: () => void revealInExplorer(path) },
      ];
  const exportMenu = (el: HTMLElement) => openMenuAt(el, exportItems(), "end");
  const backgroundMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("section, button")) return;
    openContextMenu(e, [
      { label: "Add column", onSelect: () => change((b) => addColumn(b)) },
      { label: "Rename board…", onSelect: () => void rename() },
      "separator",
      ...exportItems(),
    ]);
  };

  return (
    <div className="dot-grid relative h-full overflow-hidden">
      <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start gap-3">
        <div className="island pointer-events-auto flex h-11 min-w-0 items-center gap-1 px-1.5">
          <IconButton label="Back" shortcut="Mod+W" onClick={() => void leave()}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <span className="truncate px-1.5 text-sm text-muted">{project?.meta.name ?? "Drawings"}</span>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
          <button onClick={() => void rename()} data-tip="Rename" className="h-7 max-w-72 truncate rounded-md px-2 text-sm font-[650] hover:bg-hover cursor-text">
            {board.title}
          </button>
          <SaveStatus />
        </div>
        <div className="flex-1" />
        <div className="island pointer-events-auto flex h-11 items-center gap-1.5 px-1.5">
          <Input className="w-56" icon={<Search className="size-3.5" />} placeholder="Filter cards" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter cards" />
          <Button
            size="sm"
            variant={labelFilter ? "subtle" : "ghost"}
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { label: "All labels", checked: !labelFilter, onSelect: () => setLabelFilter(null) },
                "separator",
                ...board.labels.map((l) => ({ label: l.name, checked: labelFilter === l.id, icon: <span className="size-2.5 rounded-full" style={{ background: l.color }} />, onSelect: () => setLabelFilter(l.id) })),
              ], "end")
            }
          >
            {labelFilter ? board.labels.find((l) => l.id === labelFilter)?.name : "Labels"}
          </Button>
          {(query || labelFilter) && (
            <IconButton label="Clear filters" size="sm" onClick={() => { setQuery(""); setLabelFilter(null); }}>
              <X className="size-3.5" />
            </IconButton>
          )}
          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => change((b) => addColumn(b))}>
            Column
          </Button>
          <Button size="sm" variant="primary" className="rounded-lg" icon={<Download className="size-3.5" />} onClick={(e) => exportMenu(e.currentTarget)}>
            Export
          </Button>
        </div>
      </header>
      {saveState === "conflict" && (
        <div role="alert" className="island absolute left-1/2 top-[64px] z-40 flex -translate-x-1/2 items-center gap-3 px-4 py-2.5 text-sm">
          <AlertTriangle className="size-4 text-danger" />
          This board was changed on disk by another program.
          <Button size="sm" onClick={() => useUI.getState().navigate({ name: "board", path, openId: Date.now() })}>Load disk version</Button>
          <Button size="sm" variant="danger" onClick={() => void useBoard.getState().save(true)}>Keep mine</Button>
        </div>
      )}
      <main
        className="absolute inset-0 flex items-start gap-4 overflow-x-auto px-6 pb-6 pt-[72px]"
        onContextMenu={backgroundMenu}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(COL_TYPE)) return;
          e.preventDefault();
          const cols = [...e.currentTarget.querySelectorAll<HTMLElement>("section[aria-label]")];
          let idx = cols.length;
          for (let i = 0; i < cols.length; i++) {
            const r = cols[i].getBoundingClientRect();
            if (e.clientX < r.left + r.width / 2) {
              idx = i;
              break;
            }
          }
          setColDrop(idx);
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(COL_TYPE);
          if (!id || colDrop === null) return;
          const from = board.columns.findIndex((c) => c.id === id);
          change((b) => moveColumn(b, id, from < colDrop ? colDrop - 1 : colDrop));
          setColDrop(null);
        }}
        onDragEnd={() => setColDrop(null)}
      >
        {board.columns.map((c, i) => (
          <div key={c.id} className="flex h-full items-start gap-4">
            {colDrop === i && <div className="h-40 w-1 shrink-0 rounded-full bg-accent" />}
            <ColumnView col={c} filter={filter} onOpenCard={setOpenCard} />
          </div>
        ))}
        {colDrop === board.columns.length && <div className="h-40 w-1 shrink-0 rounded-full bg-accent" />}
        <button
          onClick={() => change((b) => addColumn(b))}
          className="flex h-12 w-[260px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-sm text-muted hover:border-accent hover:text-text cursor-pointer"
        >
          <Plus className="size-4" /> Add column
        </button>
      </main>
      {openCard && <CardDialog cardId={openCard} onClose={() => setOpenCard(null)} />}
    </div>
  );
}

export default function BoardScreen({ path }: { path: string }) {
  const [error, setError] = useState<string | null>(null);
  const loaded = useBoard((s) => s.board && s.path === path);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const text = await api.drawingRead(path);
        const board = parseBoard(text, basename(path).replace(/\.avenboard$/i, ""));
        const entry = allBoards(useWorkspace.getState().tree).find((b) => b.path.toLowerCase() === path.toLowerCase());
        if (!alive) return;
        useBoard.getState().open(path, board, entry?.modified ?? 0);
        useWorkspace.getState().addRecent({ path, id: board.id, title: board.title });
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
      void useBoard.getState().flush();
    };
  }, [path]);

  if (error)
    return (
      <div className="dot-grid grid h-full place-items-center p-6">
        <div className="island max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto size-6 text-danger" />
          <h1 className="mt-3 text-md">This board could not be opened</h1>
          <p className="mt-1 break-words text-sm text-muted">{error}</p>
          <p className="mt-1 break-all text-xs text-faint">{path}</p>
          <Button className="mt-5" onClick={() => useUI.getState().back()}>
            Back
          </Button>
        </div>
      </div>
    );
  if (!loaded)
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  return <Board />;
}

