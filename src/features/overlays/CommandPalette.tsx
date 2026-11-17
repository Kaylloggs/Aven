import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, FileText, Folder, Kanban, NotebookText, Search, Zap } from "lucide-react";
import { api } from "@/platform/api";
import type { SearchHit } from "@/platform/types";
import { allBoards, allDrawings, allNotes, useWorkspace } from "@/store/workspace";
import { openBoard, openDrawing, openNote, useUI } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { useEditor } from "@/features/editor/session";
import { commands, closeEditorIfOpen } from "@/features/commands";
import { SHORTCUTS, bindingFor } from "@/features/shortcuts/registry";
import { cx, shortcutLabel, timeAgo } from "@/lib/utils";

interface Item {
  key: string;
  kind: "drawing" | "board" | "note" | "project" | "command";
  title: string;
  hint?: string;
  snippet?: string;
  shortcut?: string;
  run: () => void;
}

const COMMAND_IDS = ["app.newBoard", "editor.textDiagram", "app.guides", "app.newDrawing", "app.newProject", "app.templates", "app.settings", "app.shortcuts", "editor.export", "editor.save", "editor.panel.info", "editor.panel.layers", "editor.panel.components", "editor.close"];

function highlight(snippet: string) {
  // FTS snippets mark matches with [ and ]
  const parts = snippet.split(/(\[[^\]]*\])/g);
  return parts.map((p, i) => (p.startsWith("[") && p.endsWith("]") ? <mark key={i} className="rounded bg-accent-soft px-0.5 text-text">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>));
}

/** Ctrl+P: search drawings (titles and text inside them), projects and commands. */
export function CommandPalette() {
  const close = () => useUI.getState().setOverlay(null);
  const tree = useWorkspace((s) => s.tree);
  const wsId = useWorkspace((s) => s.active?.id ?? null);
  const shortcuts = useSettings((s) => s.settings.editor.shortcuts);
  const inEditor = !!useEditor((s) => s.session);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const t = setTimeout(() => api.searchQuery(q, wsId, 20).then(setHits).catch(() => setHits([])), 120);
    return () => clearTimeout(t);
  }, [q, wsId]);

  const items = useMemo<Item[]>(() => {
    const term = q.toLowerCase().trim();
    const open = async (path: string) => {
      close();
      await closeEditorIfOpen();
      openDrawing(path);
    };
    const drawings = allDrawings(tree);
    const byTitle = drawings
      .filter((d) => !term || d.title.toLowerCase().includes(term) || d.project?.meta.name.toLowerCase().includes(term))
      .sort((a, b) => b.updated - a.updated)
      .slice(0, term ? 12 : 6)
      .map<Item>((d) => ({ key: d.path, kind: "drawing", title: d.title, hint: `${d.project?.meta.name ?? "Drawings"} · ${timeAgo(d.updated)}`, run: () => open(d.path) }));
    const seen = new Set(byTitle.map((i) => i.key));
    const byContent = hits
      .filter((h) => !seen.has(h.path) && drawings.some((d) => d.path === h.path))
      .map<Item>((h) => ({ key: h.path, kind: "drawing", title: h.title, hint: h.project || "Drawings", snippet: h.snippet, run: () => open(h.path) }));
    const boards = allBoards(tree)
      .filter((d) => !term || d.title.toLowerCase().includes(term))
      .slice(0, term ? 8 : 3)
      .map<Item>((d) => ({
        key: d.path,
        kind: "board",
        title: d.title,
        hint: `Board · ${d.project?.meta.name ?? "Drawings"}`,
        run: async () => {
          close();
          await closeEditorIfOpen();
          openBoard(d.path);
        },
      }));
    const notes = allNotes(tree)
      .filter((d) => !term || d.title.toLowerCase().includes(term))
      .slice(0, term ? 8 : 3)
      .map<Item>((d) => ({
        key: d.path,
        kind: "note",
        title: d.title,
        hint: `Note · ${d.project?.meta.name ?? "Drawings"}`,
        run: async () => {
          close();
          await closeEditorIfOpen();
          openNote(d.path);
        },
      }));
    const noteHits = hits
      .filter((h) => h.kind === "note" && !notes.some((b) => b.key === h.path))
      .map<Item>((h) => ({ key: h.path, kind: "note", title: h.title, hint: "Note", snippet: h.snippet, run: async () => { close(); await closeEditorIfOpen(); openNote(h.path); } }));
    const projects = (tree?.projects ?? [])
      .filter((p) => term && p.meta.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map<Item>((p) => ({
        key: p.path,
        kind: "project",
        title: p.meta.name,
        hint: "Project",
        run: async () => {
          close();
          await closeEditorIfOpen();
          useUI.getState().navigate({ name: "home", section: "project", projectPath: p.path, folderPath: p.path });
        },
      }));
    const cmds = COMMAND_IDS.filter((id) => inEditor || !id.startsWith("editor."))
      .map((id) => SHORTCUTS.find((s) => s.id === id)!)
      .filter((s) => s && (!term || s.label.toLowerCase().includes(term)))
      .map<Item>((s) => ({ key: s.id, kind: "command", title: s.label, shortcut: bindingFor(s.id, shortcuts), run: () => { close(); void commands.run(s.id); } }));
    const boardHits = hits
      .filter((h) => h.kind === "board" && !boards.some((b) => b.key === h.path))
      .map<Item>((h) => ({ key: h.path, kind: "board", title: h.title, hint: "Board", snippet: h.snippet, run: async () => { close(); await closeEditorIfOpen(); openBoard(h.path); } }));
    return [...byTitle, ...byContent, ...boards, ...boardHits, ...notes, ...noteHits, ...projects, ...cmds];
  }, [q, hits, tree, inEditor, shortcuts]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return createPortal(
    <div className="fixed inset-0 flex items-start justify-center bg-[var(--scrim)] pt-[12vh] anim-fade" style={{ zIndex: 50 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Search" className="w-[640px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-border bg-raised shadow-[var(--shadow)] anim-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search drawings, text on canvases, projects and commands"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-md text-text outline-none placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter") items[active]?.run();
              e.stopPropagation();
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" className="max-h-[56vh] overflow-y-auto p-1.5">
          {items.map((it, i) => (
            <li key={`${it.kind}:${it.key}`} role="option" aria-selected={i === active} data-index={i}>
              <button onMouseMove={() => setActive(i)} onClick={it.run} className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left cursor-pointer", i === active && "bg-hover")}>
                <span className="text-faint">{it.kind === "drawing" ? <FileText className="size-4" /> : it.kind === "board" ? <Kanban className="size-4" /> : it.kind === "note" ? <NotebookText className="size-4" /> : it.kind === "project" ? <Folder className="size-4" /> : <Zap className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{it.title}</span>
                  {it.snippet && <span className="block truncate text-xs text-muted">{highlight(it.snippet)}</span>}
                </span>
                {it.hint && <span className="shrink-0 truncate text-xs text-faint max-w-48">{it.hint}</span>}
                {it.shortcut && <span className="kbd">{shortcutLabel(it.shortcut)}</span>}
                {i === active && <CornerDownLeft className="size-3.5 text-faint" />}
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-10 text-center text-sm text-muted">Nothing found for “{q}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
