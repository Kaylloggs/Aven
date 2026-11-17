// Shared context-menu actions for drawings, folders and projects.
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  FolderOpen,
  LayoutTemplate,
  Pencil,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
  FileText,
  PackageOpen,
} from "lucide-react";
import { createElement } from "react";
import type { MenuItem } from "@/components/Menu";
import { PROJECT_COLORS } from "@/components/ui";
import { api, pickSavePath, revealInExplorer } from "@/platform/api";
import type { FolderNode, ProjectNode } from "@/platform/types";
import { inboxPath, useWorkspace, type DrawingRef } from "@/store/workspace";
import { askConfirm, askText, openBoard, openDrawing, openNote, toast, useUI } from "@/store/ui";
import { boardToMarkdown, parseBoard } from "@/engine/board";
import { templateFromDrawing } from "@/features/templates/templateActions";
import { errorMessage } from "@/lib/utils";
import { isInside, safeFileName } from "@/lib/path";

const icon = (C: any) => createElement(C, { className: "size-4" });

export function drawingMenu(d: DrawingRef): MenuItem[] {
  const ws = useWorkspace.getState();
  const fav = (ws.tree?.state.favorites ?? []).includes(d.id);
  return [
    { label: "Open", icon: icon(ExternalLink), onSelect: () => openDrawing(d.path) },
    {
      label: "Rename…",
      icon: icon(Pencil),
      onSelect: async () => {
        const name = await askText({ title: "Rename drawing", initial: d.title, confirmLabel: "Rename" });
        if (!name || name === d.title) return;
        try {
          const p = await api.itemRename(d.path, name);
          // keep the title stored inside the file in sync with the file name
          const text = await api.drawingRead(p);
          const json = JSON.parse(text);
          json.title = name;
          json.updatedAt = Date.now();
          await api.drawingWrite({ wsId: ws.active?.id, path: p, content: JSON.stringify(json), drawingId: json.id ?? d.id, policy: { enabled: false, minIntervalSec: 0, keep: 1 } });
          await ws.refresh();
        } catch (e) {
          toast({ kind: "error", title: "Could not rename", message: errorMessage(e) });
        }
      },
    },
    { label: fav ? "Remove from favorites" : "Add to favorites", icon: icon(fav ? StarOff : Star), onSelect: () => void ws.toggleFavoriteDrawing(d.id) },
    { label: "Duplicate", icon: icon(Copy), onSelect: () => void ws.duplicate(d.path) },
    { label: "Move to", icon: icon(FolderInput), submenu: moveTargetsFor(d.path) },
    "separator",
    { label: "Export…", icon: icon(Download), onSelect: () => useUI.getState().setOverlay({ kind: "export", path: d.path }) },
    { label: "Save as template…", icon: icon(LayoutTemplate), onSelect: () => void templateFromDrawing(d.path) },
    { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(d.path) },
    "separator",
    { label: "Move to trash", icon: icon(Trash2), danger: true, onSelect: () => void ws.trash(d.path, d.title) },
  ];
}

export function boardMenu(d: DrawingRef): MenuItem[] {
  const ws = useWorkspace.getState();
  return [
    { label: "Open", icon: icon(ExternalLink), onSelect: () => openBoard(d.path) },
    {
      label: "Rename…",
      icon: icon(Pencil),
      onSelect: async () => {
        const name = await askText({ title: "Rename board", initial: d.title, confirmLabel: "Rename" });
        if (!name || name === d.title) return;
        try {
          const p = await api.itemRename(d.path, name);
          const json = JSON.parse(await api.drawingRead(p));
          json.title = name;
          json.updatedAt = Date.now();
          await api.drawingWrite({ wsId: ws.active?.id, path: p, content: JSON.stringify(json), drawingId: json.id ?? d.id, policy: { enabled: false, minIntervalSec: 0, keep: 1 } });
          await ws.refresh();
        } catch (e) {
          toast({ kind: "error", title: "Could not rename", message: errorMessage(e) });
        }
      },
    },
    { label: "Duplicate", icon: icon(Copy), onSelect: () => void ws.duplicate(d.path) },
    { label: "Move to", icon: icon(FolderInput), submenu: moveTargetsFor(d.path) },
    "separator",
    {
      label: "Export Markdown…",
      icon: icon(Download),
      onSelect: async () => {
        try {
          const b = parseBoard(await api.drawingRead(d.path), d.title);
          const out = await pickSavePath("Export board", `${safeFileName(b.title)}.md`, [{ name: "Markdown", extensions: ["md"] }]);
          if (!out) return;
          await api.fileWriteText(out, boardToMarkdown(b));
          toast({ kind: "success", title: "Board exported", message: out });
        } catch (e) {
          toast({ kind: "error", title: "Export failed", message: errorMessage(e) });
        }
      },
    },
    { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(d.path) },
    "separator",
    { label: "Move to trash", icon: icon(Trash2), danger: true, onSelect: () => void ws.trash(d.path, d.title) },
  ];
}

export function noteMenu(d: DrawingRef): MenuItem[] {
  const ws = useWorkspace.getState();
  return [
    { label: "Open", icon: icon(ExternalLink), onSelect: () => openNote(d.path) },
    {
      label: "Rename…",
      icon: icon(Pencil),
      onSelect: async () => {
        const name = await askText({ title: "Rename note", initial: d.title, confirmLabel: "Rename" });
        if (name && name !== d.title) await ws.rename(d.path, name);
      },
    },
    { label: "Duplicate", icon: icon(Copy), onSelect: () => void ws.duplicate(d.path) },
    { label: "Move to", icon: icon(FolderInput), submenu: moveTargetsFor(d.path) },
    "separator",
    { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(d.path) },
    "separator",
    { label: "Move to trash", icon: icon(Trash2), danger: true, onSelect: () => void ws.trash(d.path, d.title) },
  ];
}

export function folderMenu(f: FolderNode): MenuItem[] {
  const ws = useWorkspace.getState();
  return [
    {
      label: "Rename…",
      icon: icon(Pencil),
      onSelect: async () => {
        const name = await askText({ title: "Rename folder", initial: f.name, confirmLabel: "Rename" });
        if (name && name !== f.name) await ws.rename(f.path, name);
      },
    },
    { label: "New drawing here", icon: icon(FileText), onSelect: () => void import("@/features/commands").then((c) => c.newDrawing(f.path)) },
    { label: "Move to", icon: icon(FolderInput), submenu: moveTargetsFor(f.path) },
    { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(f.path) },
    "separator",
    { label: "Move to trash", icon: icon(Trash2), danger: true, onSelect: () => void ws.trash(f.path, f.name) },
  ];
}

/** Move targets that exclude the item itself (a folder cannot move into itself). */
export function moveTargetsFor(path: string): MenuItem[] {
  const tree = useWorkspace.getState().tree;
  if (!tree) return [];
  const out: { label: string; path: string }[] = [{ label: "Drawings (no project)", path: inboxPath(tree) }];
  const walk = (f: FolderNode, depth: number) => {
    for (const s of f.folders) {
      if (isInside(s.path, path)) continue;
      out.push({ label: `${"   ".repeat(depth)}${s.name}`, path: s.path });
      walk(s, depth + 1);
    }
  };
  for (const p of tree.projects) {
    if (isInside(p.path, path)) continue;
    out.push({ label: p.meta.name, path: p.path });
    walk(p.root, 1);
  }
  return out.map((o) => ({ label: o.label, onSelect: () => void useWorkspace.getState().move(path, o.path) }));
}

export function projectMenu(p: ProjectNode): MenuItem[] {
  const ws = useWorkspace.getState();
  const nav = useUI.getState().navigate;
  if (p.archived)
    return [
      { label: "Restore project", icon: icon(ArchiveRestore), onSelect: () => void ws.setArchived(p.path, false) },
      { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(p.path) },
      "separator",
      { label: "Move to trash", icon: icon(Trash2), danger: true, onSelect: () => void ws.trash(p.path, p.meta.name) },
    ];
  return [
    { label: "Open", icon: icon(ExternalLink), onSelect: () => nav({ name: "home", section: "project", projectPath: p.path, folderPath: p.path }) },
    {
      label: "Rename…",
      icon: icon(Pencil),
      onSelect: async () => {
        const name = await askText({ title: "Rename project", initial: p.meta.name, confirmLabel: "Rename" });
        if (!name || name === p.meta.name) return;
        const newPath = await ws.rename(p.path, name);
        await api.projectSaveMeta(newPath, { ...p.meta, name, updatedAt: Date.now() });
        await ws.refresh();
        const r = useUI.getState().route;
        if (r.name === "home" && r.projectPath === p.path) nav({ name: "home", section: "project", projectPath: newPath, folderPath: newPath });
      },
    },
    "separator",
    { heading: "Colour" },
    {
      title: "Project colour",
      swatches: Object.entries(PROJECT_COLORS).map(([name, hex]) => ({
        color: hex,
        name: name[0].toUpperCase() + name.slice(1),
        checked: p.meta.color === name,
        onSelect: () => void ws.updateProject(p.path, { color: name as any }),
      })),
    },
    "separator",
    { label: p.meta.favorite ? "Remove from favorites" : "Add to favorites", icon: icon(p.meta.favorite ? StarOff : Star), onSelect: () => void ws.updateProject(p.path, { favorite: !p.meta.favorite }) },
    { label: p.meta.pinned ? "Unpin" : "Pin to top", icon: icon(p.meta.pinned ? PinOff : Pin), onSelect: () => void ws.updateProject(p.path, { pinned: !p.meta.pinned }) },
    { label: "Duplicate", icon: icon(Copy), onSelect: () => void ws.duplicate(p.path) },
    "separator",
    {
      label: "Export project…",
      icon: icon(PackageOpen),
      onSelect: async () => {
        const out = await pickSavePath("Export project", `${safeFileName(p.meta.name)}.avenproject`, [{ name: "Aven project", extensions: ["avenproject"] }]);
        if (!out) return;
        try {
          await api.projectExport(p.path, out);
          toast({ kind: "success", title: "Project exported", message: out, action: { label: "Show", run: () => void revealInExplorer(out) } });
        } catch (e) {
          toast({ kind: "error", title: "Export failed", message: errorMessage(e) });
        }
      },
    },
    { label: "Show in File Explorer", icon: icon(FolderOpen), onSelect: () => void revealInExplorer(p.path) },
    { label: "Archive", icon: icon(Archive), onSelect: () => void ws.setArchived(p.path, true) },
    "separator",
    {
      label: "Move to trash",
      icon: icon(Trash2),
      danger: true,
      onSelect: async () => {
        if (await askConfirm({ title: `Move “${p.meta.name}” to the trash?`, message: "The project and all its drawings move to the workspace trash. You can restore them from Trash.", confirmLabel: "Move to trash", danger: true })) {
          await ws.trash(p.path, p.meta.name);
          nav({ name: "home", section: "home" });
        }
      },
    },
  ];
}
