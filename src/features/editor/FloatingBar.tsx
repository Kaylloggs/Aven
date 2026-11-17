// A small contextual bar that floats above the selected object, the way Canva or Adobe Express
// show the controls of what you clicked. It follows scrolling and zooming and steps aside while
// the object is dragged, resized, rotated or its text edited.
import type { ReactNode } from "react";
import { getBounds } from "@/engine/elements";
import { useEditor } from "./session";

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Screen rectangle of the current selection, or null when nothing is selected. */
export function useSelectionRect(): ScreenRect | null {
  const selection = useEditor((s) => s.selection);
  const session = useEditor((s) => s.session);
  const view = useEditor((s) => s.view);
  useEditor((s) => s.sceneTick);
  const api = session?.api;
  if (!api || !selection.length) return null;
  const ids = new Set(selection);
  const els = api.getSceneElements().filter((e) => ids.has(e.id));
  if (!els.length) return null;
  const b = getBounds(els as any);
  if (!Number.isFinite(b.minX)) return null;
  const toX = (x: number) => (x + view.scrollX) * view.zoom + view.offsetLeft;
  const toY = (y: number) => (y + view.scrollY) * view.zoom + view.offsetTop;
  return { left: toX(b.minX), top: toY(b.minY), right: toX(b.minX + b.width), bottom: toY(b.minY + b.height) };
}

const HEADER = 64; // the editor's top bar
const GAP = 14;

export function FloatingBar({ label, role = "group", children }: { label: string; role?: "group" | "toolbar"; children: ReactNode }) {
  const rect = useSelectionRect();
  const busy = useEditor((s) => s.busy);
  if (!rect || busy) return null;
  // above the object when there is room, else below it, else (object fills the view) at the top
  const BAR = 44;
  let top: number;
  let above = false;
  if (rect.top - GAP - BAR > HEADER) {
    top = rect.top - GAP;
    above = true;
  } else if (rect.bottom + GAP + BAR < innerHeight - 8) top = Math.max(HEADER + 8, rect.bottom + GAP);
  else top = HEADER + 8;
  const half = 260;
  const left = Math.min(Math.max((rect.left + rect.right) / 2, half + 8), Math.max(half + 8, innerWidth - half - 8));
  return (
    <div
      role={role}
      aria-label={label}
      className="island pointer-events-auto fixed z-30 flex h-11 max-w-[calc(100vw-16px)] items-center gap-1 overflow-x-auto px-1.5 anim-fade [scrollbar-width:none]"
      style={{ left, top, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export const BarSep = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
