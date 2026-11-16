import { useEffect, useMemo, useState } from "react";
import { ChartBar, ChartColumn, ChartLine, ChartPie, CircleDashed, Table2 } from "lucide-react";
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  CHART_PALETTE,
  chartBox,
  chartIdsIn,
  chartRef,
  createChart,
  parseRows,
  parseTable,
  rebuildChart,
  rowsToText,
  tableToText,
  type ChartData,
  type ChartKind,
} from "@/engine/charts";
import { Input, Segmented, Switch, TextArea } from "@/components/ui";
import { cx } from "@/lib/utils";
import { useEditor } from "./session";

export const CHART_KINDS: { value: ChartKind; label: string; icon: React.ReactNode }[] = [
  { value: "bar", label: "Bar chart", icon: <ChartColumn className="size-4" /> },
  { value: "hbar", label: "Horizontal bars", icon: <ChartBar className="size-4" /> },
  { value: "line", label: "Line chart", icon: <ChartLine className="size-4" /> },
  { value: "pie", label: "Pie chart", icon: <ChartPie className="size-4" /> },
  { value: "donut", label: "Donut chart", icon: <CircleDashed className="size-4" /> },
  { value: "table", label: "Table", icon: <Table2 className="size-4" /> },
];

const PALETTES: { name: string; colors: string[] }[] = [
  { name: "Aven", colors: CHART_PALETTE },
  { name: "Ocean", colors: ["#1971C2", "#339AF0", "#74C0FC", "#A5D8FF", "#0C8599", "#3BC9DB"] },
  { name: "Warm", colors: ["#E8590C", "#FD7E14", "#FAB005", "#F76707", "#C92A2A", "#FFA94D"] },
  { name: "Mono", colors: ["#343A40", "#495057", "#868E96", "#ADB5BD", "#CED4DA", "#212529"] },
];

/** Insert a chart or table at the centre of the visible canvas and select it. */
export function insertChart(api: ExcalidrawImperativeAPI | null, kind: ChartKind) {
  if (!api) return;
  const st = api.getAppState();
  const c = viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
  const els = createChart(c.x - 240, c.y - 150, kind);
  api.updateScene({
    elements: [...api.getSceneElements(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [els[0].groupIds[0]]: true } } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
}

/** Rebuild every chart touched by `ids` from its stored data and current box size. */
export function relayoutCharts(api: ExcalidrawImperativeAPI, ids: readonly string[]) {
  let scene = api.getSceneElements() as any[];
  const charts = chartIdsIn(scene, ids);
  if (!charts.length) return false;
  for (const id of charts) scene = rebuildChart(scene, id) as any[];
  api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
  return true;
}

export function ChartPanel() {
  const selection = useEditor((s) => s.selection);
  const session = useEditor((s) => s.session);
  const tick = useEditor((s) => s.sceneTick);
  const current = useMemo(() => {
    const api = session?.api;
    if (!api || !selection.length) return null;
    const scene = api.getSceneElements();
    const ids = chartIdsIn(scene, selection);
    if (ids.length !== 1) return null;
    const box = chartBox(scene, ids[0]);
    const data = box ? chartRef(box)?.data : undefined;
    return box && data ? { id: ids[0], data } : null;
  }, [selection, session, tick]);

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (current) setDraft(current.data.kind === "table" ? tableToText(current.data.table) : rowsToText(current.data.rows));
    // reset the editor when another chart is selected or its kind changes
  }, [current?.id, current?.data.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current || !session?.api) return null;
  const api = session.api;
  const d = current.data;
  const apply = (patch: Partial<ChartData>) =>
    api.updateScene({ elements: rebuildChart(api.getSceneElements(), current.id, { ...d, ...patch }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  const commitDraft = (v = draft) => (d.kind === "table" ? apply({ table: parseTable(v) }) : apply({ rows: parseRows(v) }));

  return (
    <div role="group" aria-label="Chart" className="island pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(640px,calc(100%-180px))] -translate-x-1/2 p-3 anim-pop" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Chart type"
          value={d.kind}
          onChange={(kind) => apply({ kind })}
          options={CHART_KINDS.map((k) => ({ value: k.value, label: k.icon, title: k.label }))}
        />
        {d.kind !== "table" && (
          <Input className="min-w-40 flex-1" value={d.title} placeholder="Title" aria-label="Chart title" onChange={(e) => apply({ title: e.target.value })} />
        )}
        {d.kind !== "table" && (
          <>
            <Input className="w-20" value={d.unit} placeholder="Unit" aria-label="Unit" onChange={(e) => apply({ unit: e.target.value.slice(0, 6) })} />
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <Switch label="Show values" checked={d.showValues} onChange={(v) => apply({ showValues: v })} /> Values
            </label>
          </>
        )}
      </div>
      <div className="mt-2 flex gap-3">
        <TextArea
          value={draft}
          aria-label={d.kind === "table" ? "Table cells" : "Chart data"}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            commitDraft(e.target.value);
          }}
          className="min-h-24 flex-1 font-mono text-xs"
          placeholder={d.kind === "table" ? "One row per line, cells separated by tabs, ; or |" : "One line per item: label, value"}
        />
        {d.kind !== "table" && (
          <div className="flex w-32 shrink-0 flex-col gap-1.5" role="radiogroup" aria-label="Colours">
            {PALETTES.map((p) => {
              const on = p.colors[0] === d.palette[0] && p.colors[1] === d.palette[1];
              return (
                <button key={p.name} role="radio" aria-checked={on} onClick={() => apply({ palette: p.colors })} className={cx("flex items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs cursor-pointer", on ? "bg-accent-soft text-text" : "text-muted hover:bg-hover")}>
                  <span className="flex">{p.colors.slice(0, 4).map((c) => <span key={c} className="size-2.5" style={{ background: c }} />)}</span>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-2xs text-faint">{d.kind === "table" ? "Paste cells straight from a spreadsheet. The first row is the header." : "Edit as text: one “label, value” per line. Resize the chart and it re-lays itself out."}</p>
    </div>
  );
}
