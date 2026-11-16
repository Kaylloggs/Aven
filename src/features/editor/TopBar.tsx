import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  Check,
  ChevronRight,
  CloudOff,
  Copy,
  Download,
  FolderOpen,
  Grid3x3,
  History,
  Info,
  Keyboard,
  Layers,
  LayoutTemplate,
  Loader2,
  Magnet,
  Maximize2,
  MoreHorizontal,
  Eye,
  Puzzle,
  Redo2,
  Ruler,
  Save,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { Button, IconButton } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { revealInExplorer } from "@/platform/api";
import { useUI } from "@/store/ui";
import { projectFor, useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { closeEditor } from "@/features/commands";
import { cx, timeAgo } from "@/lib/utils";
import { basename, dirname } from "@/lib/path";
import { useAdvanced, useEditor } from "./session";
import { redo, undo } from "./tools";
import { BackupsDialog } from "./BackupsDialog";
import { saveAsTemplate } from "@/features/templates/templateActions";
import { CANVAS_STYLES } from "@/components/CanvasStylePicker";


function SaveStatus() {
  const state = useEditor((s) => s.saveState);
  const last = useEditor((s) => s.lastSavedAt);
  const err = useEditor((s) => s.error);
  const autosave = useSettings((s) => s.settings.workspace.autosave);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const map = {
    saved: { icon: <Check className="size-3.5 text-success" />, text: last ? `Saved ${timeAgo(last)}` : "Saved" },
    dirty: { icon: <span className="size-2 rounded-full bg-warning" />, text: autosave ? "Saving soon" : "Unsaved changes" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    error: { icon: <CloudOff className="size-3.5 text-danger" />, text: "Not saved" },
    conflict: { icon: <TriangleAlert className="size-3.5 text-danger" />, text: "Changed on disk" },
  } as const;
  const m = map[state];
  return (
    <button
      type="button"
      onClick={() => (state === "error" || state === "dirty") && useEditor.getState().session?.save("manual")}
      data-tip={state === "error" ? `${err ?? "Save failed"}. Click to retry.` : state === "dirty" && !autosave ? "Click or press Ctrl+S to save" : undefined}
      className={cx("flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted", (state === "error" || state === "dirty") && "hover:bg-hover cursor-pointer")}
      aria-live="polite"
    >
      {m.icon}
      <span>{m.text}</span>
    </button>
  );
}

function Title() {
  const title = useEditor((s) => s.title);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== title) void useEditor.getState().session?.rename(value.trim());
    else setValue(title);
  };
  if (editing)
    return (
      <input
        ref={ref}
        value={value}
        aria-label="Drawing name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
          e.stopPropagation();
        }}
        className="h-7 w-64 rounded-md border border-accent bg-surface-2 px-2 text-sm font-[600] text-text outline-none ring-2 ring-accent-soft"
      />
    );
  return (
    <button type="button" onClick={() => setEditing(true)} data-tip="Rename" className="h-7 max-w-80 truncate rounded-md px-2 text-sm font-[600] text-text hover:bg-hover cursor-text">
      {title}
    </button>
  );
}

export function TopBar() {
  const path = useEditor((s) => s.path);
  const panel = useEditor((s) => s.panel);
  const layersOpen = useEditor((s) => s.layersOpen);
  const zen = useEditor((s) => s.zenMode);
  const grid = useEditor((s) => s.gridMode);
  const snap = useEditor((s) => s.snapMode);
  const viewMode = useEditor((s) => s.viewMode);
  const canvasStyle = useEditor((s) => s.canvasStyle);
  const tree = useWorkspace((s) => s.tree);
  const adv = useAdvanced();
  const [backups, setBackups] = useState(false);
  const project = projectFor(tree, path);
  const folder = dirname(path);
  const inSubfolder = project && folder.toLowerCase() !== project.path.toLowerCase();
  const engine = () => useEditor.getState().session?.api ?? null;

  const setApp = (patch: Record<string, unknown>) => engine()?.updateScene({ appState: patch as any, captureUpdate: CaptureUpdateAction.NEVER });

  const canvasMenu = (el: HTMLElement) =>
    openMenuAt(el, [
      { heading: "Canvas background" },
      ...CANVAS_STYLES.map((c) => ({
        label: c.label,
        hint: c.value === "dots" ? "default" : undefined,
        checked: canvasStyle === c.value,
        onSelect: () => useEditor.getState().session?.setCanvasStyle(c.value),
      })),
      "separator",
      { label: "Grid", checked: grid, shortcut: "Mod+'", onSelect: () => setApp({ gridModeEnabled: !grid }) },
      {
        label: "Grid size",
        icon: <Grid3x3 className="size-4" />,
        submenu: [10, 20, 40].map((n) => ({ label: `${n} px`, checked: engine()?.getAppState().gridSize === n, onSelect: () => setApp({ gridSize: n, gridModeEnabled: true }) })),
      },
      { label: "Snap to objects", checked: snap, shortcut: "Alt+S", onSelect: () => setApp({ objectsSnapModeEnabled: !snap }) },
      "separator",
      { label: "Dimensions and stats", icon: <Ruler className="size-4" />, shortcut: "Alt+/", onSelect: () => { const a = engine()?.getAppState(); setApp({ stats: { ...(a?.stats ?? {}), open: !a?.stats.open } }); } },
      { label: "View mode (read only)", checked: viewMode, shortcut: "Alt+R", onSelect: () => setApp({ viewModeEnabled: !viewMode }) },
      { label: "Zen mode", checked: zen, shortcut: "Alt+Z", onSelect: () => setApp({ zenModeEnabled: !zen }) },
      { label: "Zoom to fit", icon: <Maximize2 className="size-4" />, shortcut: "Shift+1", onSelect: () => engine()?.scrollToContent(undefined, { fitToContent: true, animate: true }) },
    ]);

  const moreMenu = (el: HTMLElement) =>
    openMenuAt(
      el,
      [
        { label: "Save now", icon: <Save className="size-4" />, shortcut: "Mod+S", onSelect: () => void useEditor.getState().session?.save("manual") },
        { label: "Version history", icon: <History className="size-4" />, onSelect: () => setBackups(true) },
        "separator",
        { label: "Save as template", icon: <LayoutTemplate className="size-4" />, onSelect: () => void saveAsTemplate() },
        {
          label: "Duplicate drawing",
          icon: <Copy className="size-4" />,
          onSelect: async () => {
            await useEditor.getState().session?.flush();
            await useWorkspace.getState().duplicate(useEditor.getState().path);
          },
        },
        { label: "Show in File Explorer", icon: <FolderOpen className="size-4" />, onSelect: () => void revealInExplorer(useEditor.getState().path) },
        "separator",
        { label: "Shape library", icon: <BookMarked className="size-4" />, shortcut: "Alt+B", onSelect: () => engine()?.toggleSidebar({ name: "default", tab: "library" }) },
        { label: "Keyboard shortcuts", icon: <Keyboard className="size-4" />, shortcut: "Mod+/", onSelect: () => useUI.getState().setOverlay({ kind: "shortcuts" }) },
      ],
      "end",
    );

  if (zen)
    return (
      <div className="absolute right-3 top-3 z-30 anim-fade">
        <Button size="sm" variant="secondary" onClick={() => setApp({ zenModeEnabled: false })}>
          Exit zen mode
        </Button>
      </div>
    );

  const togglePanel = (p: "layers" | "components" | "info") => useEditor.setState({ panel: panel === p ? null : p });

  return (
    <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start gap-3">
      <div className="island pointer-events-auto flex h-11 min-w-0 items-center gap-1 px-1.5 anim-fade">
      <IconButton label="Back to workspace" shortcut="Mod+W" onClick={() => void closeEditor()}>
        <ArrowLeft className="size-4" />
      </IconButton>
      <nav aria-label="Location" className="flex min-w-0 items-center text-sm text-muted">
        <button
          className="truncate rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-text cursor-pointer"
          onClick={async () => {
            await useEditor.getState().session?.flush();
            if (project) useUI.getState().navigate({ name: "home", section: "project", projectPath: project.path, folderPath: project.path });
            else useUI.getState().navigate({ name: "home", section: "inbox" });
          }}
        >
          {project ? project.meta.name : "Drawings"}
        </button>
        {inSubfolder && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-faint" />
            <span className="truncate px-1.5">{basename(folder)}</span>
          </>
        )}
        <ChevronRight className="size-3.5 shrink-0 text-faint" />
      </nav>
      <Title />
      <SaveStatus />
      <div className="mx-1 h-5 w-px bg-border" />
      <IconButton label="Undo" shortcut="Mod+Z" onClick={undo}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label="Redo" shortcut="Mod+Shift+Z" onClick={redo}>
        <Redo2 className="size-4" />
      </IconButton>
      </div>
      <div className="flex-1" />
      <div className="island pointer-events-auto flex h-11 items-center gap-1 px-1.5 anim-fade">
      <IconButton label="Canvas and view" onClick={(e) => canvasMenu(e.currentTarget)}>
        <Eye className="size-4" />
      </IconButton>
      <IconButton label="Snap to objects" shortcut="Alt+S" active={snap} onClick={() => setApp({ objectsSnapModeEnabled: !snap })}>
        <Magnet className="size-4" />
      </IconButton>
      <IconButton label="Grid" shortcut="Mod+'" active={grid} onClick={() => setApp({ gridModeEnabled: !grid })}>
        <Grid3x3 className="size-4" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-border" />
      {adv.layers && (
        <IconButton label="Layers" shortcut="Alt+L" active={layersOpen} onClick={() => useEditor.setState({ layersOpen: !layersOpen })}>
          <Layers className="size-4" />
        </IconButton>
      )}
      {adv.components && (
        <IconButton label="Components" shortcut="Alt+C" active={panel === "components"} onClick={() => togglePanel("components")}>
          <Puzzle className="size-4" />
        </IconButton>
      )}
      <IconButton label="Info and links" shortcut="Alt+I" active={panel === "info"} onClick={() => togglePanel("info")}>
        <Info className="size-4" />
      </IconButton>
      <IconButton label="More" onClick={(e) => moreMenu(e.currentTarget)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      <Button variant="primary" size="sm" className="ml-1 rounded-lg" icon={<Download className="size-3.5" />} onClick={() => useUI.getState().setOverlay({ kind: "export" })}>
        Export
      </Button>
      </div>
      <BackupsDialog open={backups} onClose={() => setBackups(false)} />
    </header>
  );
}
