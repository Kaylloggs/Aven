import { memo, useEffect } from "react";
import { FileText, Folder, MoreHorizontal, Star } from "lucide-react";
import type { FolderNode } from "@/platform/types";
import { countDrawings, useWorkspace, type DrawingRef } from "@/store/workspace";
import { openBoard, openDrawing, useUI } from "@/store/ui";
import { IconButton } from "@/components/ui";
import { openContextMenu, openMenuAt } from "@/components/Menu";
import { cx, formatBytes, formatDate, timeAgo } from "@/lib/utils";
import { boardMenu, drawingMenu, folderMenu } from "./actions";
import { FacetArt } from "@/components/FacetArt";
import { PROJECT_COLORS } from "@/components/ui";
import { DND_TYPE, dropProps } from "./dnd";

export const Thumbnail = memo(function Thumbnail({ id, className }: { id: string; className?: string }) {
  const thumb = useWorkspace((s) => s.thumbs[id]);
  useEffect(() => {
    if (thumb === undefined) void useWorkspace.getState().loadThumb(id);
  }, [id, thumb]);
  return (
    <div className={cx("grid place-items-center overflow-hidden bg-[#fbfbfa]", className)}>
      {thumb ? (
        <img src={thumb} alt="" draggable={false} className="max-h-full max-w-full object-contain p-3" loading="lazy" />
      ) : thumb === null ? (
        <FileText className="size-6 text-[#b4b4be]" aria-hidden />
      ) : (
        <div className="skeleton h-full w-full opacity-50" />
      )}
    </div>
  );
});

export function DrawingCard({ d, showProject = true }: { d: DrawingRef; showProject?: boolean }) {
  const fav = useWorkspace((s) => (s.tree?.state.favorites ?? []).includes(d.id));
  return (
    <div
      className="group relative"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_TYPE, d.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      onContextMenu={(e) => openContextMenu(e, drawingMenu(d))}
    >
      <button
        type="button"
        onClick={() => openDrawing(d.path)}
        style={{ ["--fold" as any]: d.project ? PROJECT_COLORS[d.project.meta.color] : "var(--facet-honey)" }}
        className="fold lift w-full overflow-hidden rounded-2xl border border-border bg-surface text-left hover:border-border-strong cursor-pointer focus-visible:outline-2"
      >
        <Thumbnail id={d.id} className="aspect-[16/10] border-b border-border" />
        <div className="px-3 py-2.5">
          <p className="truncate text-sm font-[550] text-text">{d.title}</p>
          <p className="mt-0.5 truncate text-xs text-faint">
            {showProject && <>{d.project?.meta.name ?? "Drawings"} · </>}
            {timeAgo(d.updated)}
          </p>
        </div>
      </button>
      {fav && <Star className="pointer-events-none absolute left-2.5 top-2.5 size-4 fill-[var(--warning)] text-warning drop-shadow" />}
      <IconButton
        label="Drawing options"
        size="sm"
        className="absolute right-9 top-2 bg-raised opacity-0 shadow-[var(--shadow-sm)] group-hover:opacity-100 focus:opacity-100"
        onClick={(e) => openMenuAt(e.currentTarget, drawingMenu(d), "end")}
      >
        <MoreHorizontal className="size-4" />
      </IconButton>
    </div>
  );
}

export function DrawingRow({ d, showProject = true }: { d: DrawingRef; showProject?: boolean }) {
  const fav = useWorkspace((s) => (s.tree?.state.favorites ?? []).includes(d.id));
  return (
    <tr
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, d.path)}
      onContextMenu={(e) => openContextMenu(e, drawingMenu(d))}
      onClick={() => openDrawing(d.path)}
      className="group cursor-pointer border-b border-border last:border-0 hover:bg-hover"
    >
      <td className="py-1.5 pl-3 pr-2">
        <Thumbnail id={d.id} className="h-9 w-14 rounded border border-border" />
      </td>
      <td className="max-w-0 px-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-text">{d.title}</span>
          {fav && <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-warning" />}
        </span>
      </td>
      {showProject && <td className="truncate px-2 text-xs text-muted">{d.project?.meta.name ?? "Drawings"}</td>}
      <td className="px-2 text-xs text-muted whitespace-nowrap">{timeAgo(d.updated)}</td>
      <td className="px-2 text-xs text-faint whitespace-nowrap">{formatDate(d.created)}</td>
      <td className="px-2 text-xs text-faint whitespace-nowrap text-right">{formatBytes(d.size)}</td>
      <td className="w-10 pr-2 text-right">
        <IconButton
          label="Drawing options"
          size="sm"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            openMenuAt(e.currentTarget, drawingMenu(d), "end");
          }}
        >
          <MoreHorizontal className="size-4" />
        </IconButton>
      </td>
    </tr>
  );
}

export function DrawingTable({ drawings, showProject = true }: { drawings: DrawingRef[]; showProject?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-border text-left text-2xs font-[600] text-faint">
            <th className="w-20 py-2 pl-3" />
            <th className="px-2">Name</th>
            {showProject && <th className="w-44 px-2">Project</th>}
            <th className="w-28 px-2">Modified</th>
            <th className="w-28 px-2">Created</th>
            <th className="w-20 px-2 text-right">Size</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {drawings.map((d) => (
            <DrawingRow key={d.path} d={d} showProject={showProject} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BoardCard({ d, showProject = true }: { d: DrawingRef; showProject?: boolean }) {
  return (
    <div className="group relative" draggable onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, d.path)} onContextMenu={(e) => openContextMenu(e, boardMenu(d))}>
      <button
        type="button"
        onClick={() => openBoard(d.path)}
        style={{ ["--fold" as any]: d.project ? PROJECT_COLORS[d.project.meta.color] : "var(--facet-green)" }}
        className="fold lift flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-3 text-left hover:border-border-strong cursor-pointer"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2">
          <FacetArt kind="board" className="h-10" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-[600]">{d.title}</span>
          <span className="block truncate text-xs text-faint">
            Board{showProject ? ` · ${d.project?.meta.name ?? "Drawings"}` : ""} · {timeAgo(d.updated)}
          </span>
        </span>
      </button>
      <IconButton label="Board options" size="sm" className="absolute right-8 top-1/2 -translate-y-1/2 bg-raised opacity-0 shadow-[var(--shadow-sm)] group-hover:opacity-100 focus:opacity-100" onClick={(e) => openMenuAt(e.currentTarget, boardMenu(d), "end")}>
        <MoreHorizontal className="size-4" />
      </IconButton>
    </div>
  );
}

export function FolderCard({ f }: { f: FolderNode }) {
  const n = countDrawings(f);
  return (
    <div className="group relative" onContextMenu={(e) => openContextMenu(e, folderMenu(f))} {...dropProps(f.path)}>
      <button
        type="button"
        draggable
        onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, f.path)}
        onClick={() => {
          const r = useUI.getState().route;
          if (r.name === "home") useUI.getState().navigate({ ...r, section: "project", folderPath: f.path });
        }}
        className="lift flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong cursor-pointer"
      >
        <Folder className="size-5 shrink-0 text-accent-text" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-[550]">{f.name}</span>
          <span className="block text-xs text-faint">
            {n} drawing{n === 1 ? "" : "s"}
            {f.folders.length ? ` · ${f.folders.length} folder${f.folders.length === 1 ? "" : "s"}` : ""}
          </span>
        </span>
      </button>
      <IconButton label="Folder options" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={(e) => openMenuAt(e.currentTarget, folderMenu(f), "end")}>
        <MoreHorizontal className="size-4" />
      </IconButton>
    </div>
  );
}
