import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChartBar, ChartColumn, ChartLine, ChartPie, CircleDashed, Hash, Palette, Plus, Rows3, Sheet, Table2, X, Grid3x3, Ruler } from "lucide-react";
import { create } from "zustand";
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CHART_PALETTE, chartBox, chartIdsIn, chartRef, createChart, parseRows, parseTable, rebuildChart, TABLE_HEADERS, type ChartData, type ChartKind, type TableTextSize } from "@/engine/charts";
import { IconButton, Segmented } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { askText } from "@/store/ui";
import { cx } from "@/lib/utils";
import { useEditor } from "./session";
import { BarSep, FloatingBar } from "./FloatingBar";

/** Whether the data panel is open, per chart (charts open it by default, tables are edited in place). */
const useDataPanel = create<{ open: Record<string, boolean> }>(() => ({ open: {} }));

const HEADER_NAMES: Record<string, string> = { "#567BF7": "Blue", "#F76046": "Coral", "#2FB27E": "Green", "#8E5BE8": "Violet", "#F5AE39": "Honey", "#495057": "Graphite", none: "Plain" };

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

type Row = { label: string; value: string };

const toNumber = (v: string) => {
  const n = Number(v.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** A cell that looks like text until hovered or focused: the panel reads as a small spreadsheet. */
const cell = "h-7 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm text-text outline-none placeholder:text-faint hover:border-border focus:border-accent focus:bg-surface-2";

/** Pad every row to the same number of columns. */
function squared(t: string[][]): string[][] {
  const w = Math.max(1, ...t.map((r) => r.length));
  return (t.length ? t : [[""]]).map((r) => [...r, ...Array(w - r.length).fill("")]);
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

  // Local drafts keep half-typed values ("4.", "-") intact while the chart updates live.
  const [rows, setRows] = useState<Row[]>([]);
  const [cells, setCells] = useState<string[][]>([]);
  const focusNext = useRef<{ r: number; c: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!current) return;
    setRows(current.data.rows.map((r) => ({ label: r.label, value: String(r.value) })));
    setCells(squared(current.data.table));
    // reset when another chart is selected or its kind changes
  }, [current?.id, current?.data.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const dataKey = current ? JSON.stringify([current.data.table, current.data.rows]) : "";
  useEffect(() => {
    if (!current || listRef.current?.contains(document.activeElement)) return;
    setRows(current.data.rows.map((r) => ({ label: r.label, value: String(r.value) })));
    setCells(squared(current.data.table));
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const openMap = useDataPanel((s) => s.open);
  useLayoutEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    listRef.current?.querySelector<HTMLInputElement>(`[data-r="${f.r}"][data-c="${f.c}"]`)?.focus();
  });

  if (!current || !session?.api) return null;
  const api = session.api;
  const d = current.data;
  const isTable = d.kind === "table";
  // Always start from the chart's data as it is in the scene now: this render may predate an
  // edit made a moment ago (a blur right after adding a row would otherwise drop the row).
  const apply = (patch: Partial<ChartData>, capture: "now" | "later" = "now") => {
    const scene = api.getSceneElements();
    const latest = chartRef(chartBox(scene, current.id) ?? ({} as any))?.data ?? d;
    api.updateScene({
      elements: rebuildChart(scene, current.id, { ...latest, ...patch }),
      captureUpdate: capture === "now" ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
    });
  };

  const commitRows = (next: Row[], capture: "now" | "later" = "now") => {
    setRows(next);
    apply({ rows: next.map((r) => ({ label: r.label, value: toNumber(r.value) })) }, capture);
  };
  const commitCells = (next: string[][], capture: "now" | "later" = "now") => {
    const sq = squared(next);
    setCells(sq);
    apply({ table: sq }, capture);
  };

  // ---- keyboard: Enter goes down a row (adding one at the end), arrows move between rows
  const focusCell = (r: number, c: number) => listRef.current?.querySelector<HTMLInputElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number, count: number, addRow: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (r < count - 1) return focusCell(r + 1, c);
      addRow();
      focusNext.current = { r: r + 1, c };
    } else if (e.key === "ArrowDown" && r < count - 1) {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === "ArrowUp" && r > 0) {
      e.preventDefault();
      focusCell(r - 1, c);
    } else if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
    }
  };

  // ---- paste several lines/cells at once (from a spreadsheet, a list or a Markdown table)
  const pasteRows = (e: React.ClipboardEvent, at: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\n\t]/.test(text.trim())) return;
    e.preventDefault();
    const parsed = parseRows(text).map((p) => ({ label: p.label, value: String(p.value) }));
    commitRows([...rows.slice(0, at), ...parsed, ...rows.slice(at + parsed.length)]);
  };
  const pasteCells = (e: React.ClipboardEvent, r0: number, c0: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\n\t]/.test(text.trim())) return;
    e.preventDefault();
    const block = parseTable(text);
    const next = cells.map((row) => [...row]);
    block.forEach((line, i) =>
      line.forEach((v, j) => {
        while (next.length <= r0 + i) next.push([]);
        next[r0 + i][c0 + j] = v;
      }),
    );
    commitCells(next.map((row) => Array.from(row, (v) => v ?? "")));
  };

  /** Change the chart from its latest data (bar buttons do not rely on the panel's drafts). */
  const update = (fn: (latest: ChartData) => Partial<ChartData>) => {
    const latest = chartRef(chartBox(api.getSceneElements(), current.id) ?? ({} as any))?.data ?? d;
    apply(fn(latest));
  };
  const dataOpen = openMap[current.id] ?? !isTable;
  const toggleData = () => useDataPanel.setState({ open: { ...openMap, [current.id]: !dataOpen } });

  const addRow = () => commitRows([...rows, { label: `Item ${rows.length + 1}`, value: "0" }]);
  const addTableRow = () => commitCells([...cells, Array(cells[0]?.length ?? 1).fill("")]);
  const addTableColumn = () => commitCells(cells.map((row, i) => [...row, i === 0 ? `Column ${row.length + 1}` : ""]));
  const width = cells[0]?.length ?? 1;
  const barBtn = "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-text";

  return (
    <>
      <FloatingBar label={isTable ? "Table tools" : "Chart tools"} role="toolbar">
        <Segmented size="sm" label="Chart type" value={d.kind} onChange={(kind) => apply({ kind })} options={CHART_KINDS.map((k) => ({ value: k.value, label: k.icon, title: k.label }))} />
        <BarSep />
        {isTable ? (
          <>
            <button
              type="button"
              aria-label="Header colour"
              data-tip="Header colour"
              className={barBtn}
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { heading: "Header" },
                  {
                    title: "Header colour",
                    swatches: TABLE_HEADERS.map((c) => ({ color: c === "none" ? "#f1f3f5" : c, name: HEADER_NAMES[c] ?? c, checked: (d.header ?? "#567BF7") === c, onSelect: () => apply({ header: c }) })),
                  },
                ])
              }
            >
              <span className="size-4 rounded-[4px] border border-border" style={{ background: (d.header ?? "#567BF7") === "none" ? "#f1f3f5" : d.header ?? "#567BF7" }} />
              Header
            </button>
            <IconButton label="Striped rows" size="sm" active={d.stripes !== false} onClick={() => apply({ stripes: d.stripes === false })}>
              <Rows3 className="size-4" />
            </IconButton>
            <IconButton label="Cell lines" size="sm" active={d.lines !== false} onClick={() => apply({ lines: d.lines === false })}>
              <Grid3x3 className="size-4" />
            </IconButton>
            <Segmented
              size="sm"
              label="Text size"
              value={d.textSize ?? "m"}
              onChange={(v: TableTextSize) => apply({ textSize: v })}
              options={[
                { value: "s", label: "S", title: "Small text" },
                { value: "m", label: "M", title: "Medium text" },
                { value: "l", label: "L", title: "Large text" },
              ]}
            />
            <BarSep />
            <button type="button" className={barBtn} onClick={() => update((l) => ({ table: [...l.table, Array(Math.max(1, ...l.table.map((r) => r.length))).fill("")] }))}>
              <Plus className="size-3.5" /> Row
            </button>
            <button type="button" className={barBtn} onClick={() => update((l) => ({ table: l.table.map((r, i) => [...r, i === 0 ? `Column ${r.length + 1}` : ""]) }))}>
              <Plus className="size-3.5" /> Column
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Colours"
              data-tip="Colours"
              className={barBtn}
              onClick={(e) => openMenuAt(e.currentTarget, PALETTES.map((p) => ({ label: p.name, checked: p.colors[0] === d.palette[0] && p.colors[1] === d.palette[1], onSelect: () => apply({ palette: p.colors }) })))}
            >
              <Palette className="size-4" />
              <span className="flex">{d.palette.slice(0, 4).map((c) => <span key={c} className="size-2.5" style={{ background: c }} />)}</span>
            </button>
            <IconButton label="Show values" size="sm" active={d.showValues} onClick={() => apply({ showValues: !d.showValues })}>
              <Hash className="size-4" />
            </IconButton>
            <IconButton
              label={d.unit ? `Unit: ${d.unit}` : "Unit"}
              size="sm"
              onClick={async () => {
                const u = await askText({ title: "Unit", label: "Shown after each value, for example %, € or h", initial: d.unit, confirmLabel: "Save" });
                if (u !== null) apply({ unit: u.trim().slice(0, 6) });
              }}
            >
              <Ruler className="size-4" />
            </IconButton>
          </>
        )}
        <BarSep />
        <button type="button" aria-pressed={dataOpen} className={cx(barBtn, dataOpen && "bg-accent-soft text-accent-text")} onClick={toggleData}>
          <Sheet className="size-4" /> Data
        </button>
        {isTable && <span className="hidden whitespace-nowrap px-1 text-2xs text-faint xl:inline">Double-click a cell to type</span>}
      </FloatingBar>

      {dataOpen && (
        <div
          role="group"
          aria-label={isTable ? "Table" : "Chart"}
          className="island pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(520px,calc(100%-180px))] -translate-x-1/2 p-2.5 anim-pop"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            {isTable ? (
              <span className="flex-1 text-xs text-faint">First row is the header</span>
            ) : (
              <input className={cx(cell, "min-w-0 flex-1 font-[600]")} value={d.title} placeholder="Add a title" aria-label="Chart title" onChange={(e) => apply({ title: e.target.value }, "later")} onBlur={() => apply({})} />
            )}
            <IconButton label="Close the data panel" size="sm" onClick={toggleData}>
              <X className="size-4" />
            </IconButton>
          </div>

          <div ref={listRef} className="mt-2 max-h-56 overflow-auto">
            {isTable ? (
              <table className="w-full border-separate border-spacing-y-px text-sm">
                <tbody>
                  {cells.map((row, r) => (
                    <tr key={r} className="group">
                      {row.map((v, c) => (
                        <td key={c} className="p-0">
                          <input
                            className={cx(cell, "w-full", r === 0 && "font-[650]")}
                            value={v}
                            data-r={r}
                            data-c={c}
                            aria-label={r === 0 ? `Header ${c + 1}` : `Row ${r}, column ${c + 1}`}
                            onChange={(e) => commitCells(cells.map((x, i) => (i === r ? x.map((y, j) => (j === c ? e.target.value : y)) : x)), "later")}
                            onBlur={() => apply({})}
                            onPaste={(e) => pasteCells(e, r, c)}
                            onKeyDown={(e) => onCellKey(e, r, c, cells.length, addTableRow)}
                          />
                        </td>
                      ))}
                      <td className="w-7 p-0 text-right">
                        {r === 0 ? (
                          width > 1 && (
                            <IconButton label="Remove last column" size="sm" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => commitCells(cells.map((x) => x.slice(0, -1)))}>
                              <X className="size-3.5" />
                            </IconButton>
                          )
                        ) : (
                          <IconButton label={`Remove row ${r}`} size="sm" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => commitCells(cells.filter((_, i) => i !== r))}>
                            <X className="size-3.5" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              rows.map((row, r) => (
                <div key={r} className="group flex items-center gap-1.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.kind === "line" ? d.palette[0] : d.palette[r % d.palette.length] }} aria-hidden />
                  <input
                    className={cx(cell, "flex-1")}
                    value={row.label}
                    data-r={r}
                    data-c={0}
                    placeholder="Label"
                    aria-label={`Label ${r + 1}`}
                    onChange={(e) => commitRows(rows.map((x, i) => (i === r ? { ...x, label: e.target.value } : x)), "later")}
                    onBlur={() => apply({})}
                    onPaste={(e) => pasteRows(e, r)}
                    onKeyDown={(e) => onCellKey(e, r, 0, rows.length, addRow)}
                  />
                  <input
                    className={cx(cell, "w-24 shrink-0 text-right tabular-nums")}
                    inputMode="decimal"
                    value={row.value}
                    data-r={r}
                    data-c={1}
                    aria-label={`Value ${r + 1}`}
                    onChange={(e) => commitRows(rows.map((x, i) => (i === r ? { ...x, value: e.target.value } : x)), "later")}
                    onBlur={() => apply({})}
                    onPaste={(e) => pasteRows(e, r)}
                    onKeyDown={(e) => onCellKey(e, r, 1, rows.length, addRow)}
                  />
                  <IconButton label={`Remove ${row.label || `row ${r + 1}`}`} size="sm" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => commitRows(rows.filter((_, i) => i !== r))}>
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              ))
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-1">
            <button type="button" onClick={isTable ? addTableRow : addRow} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-text cursor-pointer">
              <Plus className="size-3.5" /> Row
            </button>
            {isTable && (
              <button type="button" onClick={addTableColumn} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-text cursor-pointer">
                <Plus className="size-3.5" /> Column
              </button>
            )}
            <span className="ml-auto text-2xs text-faint">Paste cells from a spreadsheet to fill several rows</span>
          </div>
        </div>
      )}
    </>
  );
}
