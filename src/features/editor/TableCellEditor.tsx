// Double-click a table cell on the canvas to type in it, the way Canva tables work: Enter goes to
// the cell below, Tab to the next one (Shift+Tab back), Escape cancels, clicking away saves.
import { useEffect, useRef, useState, type RefObject } from "react";
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { chartBox, chartRef, rebuildChart, tableCellAt, tableLayout } from "@/engine/charts";
import { useEditor } from "./session";

interface Editing {
  chartId: string;
  r: number;
  c: number;
  value: string;
}

export function TableCellEditor({ host }: { host: RefObject<HTMLDivElement | null> }) {
  const session = useEditor((s) => s.session);
  const view = useEditor((s) => s.view);
  useEditor((s) => s.sceneTick);
  const [editing, setEditing] = useState<Editing | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onDouble = (e: MouseEvent) => {
      // the engine attaches after this listener, so look it up when the double-click happens
      const api = useEditor.getState().session?.api;
      if (!api) return;
      const st = api.getAppState();
      if (st.viewModeEnabled) return;
      const p = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, st);
      const scene = api.getSceneElements();
      // topmost table under the pointer
      for (let i = scene.length - 1; i >= 0; i--) {
        const box = scene[i];
        const ref = chartRef(box);
        if (box.isDeleted || ref?.role !== "box" || ref.data?.kind !== "table") continue;
        if (p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height) continue;
        const cell = tableCellAt(box, ref.data, p.x, p.y);
        if (!cell) return;
        // the engine would start editing the cell's text element, which the table redraws anyway
        e.preventDefault();
        e.stopPropagation();
        setEditing({ chartId: ref.chartId, r: cell.r, c: cell.c, value: ref.data.table[cell.r]?.[cell.c] ?? "" });
        return;
      }
    };
    el.addEventListener("dblclick", onDouble, true);
    return () => el.removeEventListener("dblclick", onDouble, true);
  }, [host]);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.select();
    });
  }, [editing?.chartId, editing?.r, editing?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editing || !session?.api) return null;
  const api = session.api;
  const box = chartBox(api.getSceneElements(), editing.chartId);
  const data = box ? chartRef(box)?.data : undefined;
  const cell = box && data ? tableLayout(box, data).cells.find((c) => c.r === editing.r && c.c === editing.c) : undefined;
  if (!box || !data || !cell) return null;
  const z = view.zoom;

  const commit = (move?: { dr: number; dc: number }) => {
    const latestBox = chartBox(api.getSceneElements(), editing.chartId);
    const latest = latestBox ? chartRef(latestBox)?.data : undefined;
    if (!latest) return setEditing(null);
    const table = latest.table.map((r) => [...r]);
    while (table.length <= editing.r) table.push([]);
    table[editing.r][editing.c] = editing.value;
    api.updateScene({ elements: rebuildChart(api.getSceneElements(), editing.chartId, { ...latest, table }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    if (move) {
      const cols = Math.max(1, ...table.map((r) => r.length));
      let r = editing.r + move.dr;
      let c = editing.c + move.dc;
      if (c >= cols) {
        c = 0;
        r++;
      } else if (c < 0) {
        c = cols - 1;
        r--;
      }
      if (r >= 0 && r < table.length) return setEditing({ chartId: editing.chartId, r, c, value: table[r]?.[c] ?? "" });
    }
    setEditing(null);
  };

  return (
    <textarea
      ref={area}
      aria-label={editing.r === 0 ? `Header ${editing.c + 1}` : `Row ${editing.r}, column ${editing.c + 1}`}
      value={editing.value}
      spellCheck={false}
      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          setEditing(null);
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit({ dr: 1, dc: 0 });
        } else if (e.key === "Tab") {
          e.preventDefault();
          commit({ dr: 0, dc: e.shiftKey ? -1 : 1 });
        }
      }}
      className="fixed z-40 resize-none overflow-hidden rounded-[3px] border-2 border-accent bg-white text-[#1e1e1e] shadow-[var(--shadow)] outline-none"
      style={{
        left: (cell.x + view.scrollX) * z + view.offsetLeft,
        top: (cell.y + view.scrollY) * z + view.offsetTop,
        width: Math.max(cell.w * z, 90),
        minHeight: cell.h * z,
        fontSize: cell.size * z,
        lineHeight: 1.25,
        padding: `${5 * z}px ${8 * z}px`,
        fontFamily: "Nunito, var(--font-sans)",
        fontWeight: editing.r === 0 ? 700 : 400,
      }}
    />
  );
}
