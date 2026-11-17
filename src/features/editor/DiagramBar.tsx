import { useMemo } from "react";
import { ListTree, PenLine, Type } from "lucide-react";
import { IconButton, Segmented } from "@/components/ui";
import { useUI } from "@/store/ui";
import { BarSep, FloatingBar } from "./FloatingBar";
import { diagramOf, placeDiagram, type DiagramInfo, type DiagramMode } from "./TextDiagramDialog";
import { useEditor } from "./session";

const LAYOUTS: { value: Exclude<DiagramMode, "mermaid">; label: string }[] = [
  { value: "mindmap", label: "Mind map" },
  { value: "orgchart", label: "Org chart" },
  { value: "plan", label: "Plan" },
  { value: "flow", label: "Flow" },
];

/** Bar for a diagram made from text: change its layout or style, or edit its text, in place. */
export function DiagramBar() {
  const selection = useEditor((s) => s.selection);
  const session = useEditor((s) => s.session);
  const tick = useEditor((s) => s.sceneTick);
  const info = useMemo<DiagramInfo | null>(() => {
    const api = session?.api;
    if (!api || !selection.length) return null;
    const ids = new Set(selection);
    const sel = api.getSceneElements().filter((e) => ids.has(e.id));
    const first = sel.length ? diagramOf(sel[0] as any) : null;
    return first && sel.every((e) => diagramOf(e as any)?.id === first.id) ? first : null;
  }, [selection, session, tick]);
  if (!info) return null;
  return (
    <FloatingBar label="Diagram tools" role="toolbar">
      <span className="flex items-center gap-1.5 px-1 text-xs font-[600] text-muted">
        <ListTree className="size-4" /> Diagram
      </span>
      <BarSep />
      {info.mode !== "mermaid" && (
        <Segmented size="sm" label="Layout" value={info.mode as Exclude<DiagramMode, "mermaid">} onChange={(m) => void placeDiagram({ ...info, mode: m }, true)} options={LAYOUTS} />
      )}
      <IconButton label="Hand-drawn style" size="sm" active={info.handDrawn} onClick={() => void placeDiagram({ ...info, handDrawn: !info.handDrawn }, true)}>
        <PenLine className="size-4" />
      </IconButton>
      <BarSep />
      <button
        type="button"
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-text"
        onClick={() => useUI.getState().setOverlay({ kind: "textDiagram", edit: info })}
      >
        <Type className="size-4" /> Edit text
      </button>
    </FloatingBar>
  );
}
