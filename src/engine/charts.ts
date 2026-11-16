// Editable charts and tables built from ordinary elements. The data lives on the chart's
// "box" element (`customData.avenChart.data`); every other element is regenerated from it,
// using the box's current position and size, whenever the data changes or the chart is resized.
import { customData, randomId } from "./elements";
import type { ExcalidrawElement } from "./types";

export type ChartKind = "bar" | "hbar" | "line" | "pie" | "donut" | "table";

export interface ChartRow {
  label: string;
  value: number;
}

export interface ChartData {
  kind: ChartKind;
  title: string;
  rows: ChartRow[];
  /** table cells, first row = header */
  table: string[][];
  palette: string[];
  showValues: boolean;
  unit: string;
}

export interface ChartRef {
  chartId: string;
  role: "box" | "part";
  data?: ChartData;
}

export const CHART_PALETTE = ["#567BF7", "#F76046", "#2FB27E", "#F5AE39", "#8E5BE8", "#22B8CF", "#E64980", "#868E96"];
const INK = "#1e1e1e";
const MUTED = "#868e96";
const GRID = "#dee2e6";

export function chartRef(el: ExcalidrawElement): ChartRef | null {
  const c = customData(el).avenChart;
  return c && typeof c.chartId === "string" ? c : null;
}

export function defaultChartData(kind: ChartKind): ChartData {
  return {
    kind,
    title: kind === "table" ? "" : "Quarterly results",
    rows: [
      { label: "Q1", value: 42 },
      { label: "Q2", value: 58 },
      { label: "Q3", value: 35 },
      { label: "Q4", value: 71 },
    ],
    table: [
      ["Item", "Owner", "Status"],
      ["Research", "Alex", "Done"],
      ["Design", "Sam", "In progress"],
      ["Launch", "Lee", "To do"],
    ],
    palette: CHART_PALETTE,
    showValues: true,
    unit: "",
  };
}

// ------------------------------------------------------------------ element factories

function make(over: Record<string, unknown>): ExcalidrawElement {
  return {
    id: randomId(),
    angle: 0,
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...over,
  } as unknown as ExcalidrawElement;
}

function fit(text: string, width: number, fontSize: number) {
  const max = Math.max(1, Math.floor(width / (fontSize * 0.56)));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

function text(t: string, x: number, y: number, width: number, opts: { size?: number; align?: "left" | "center" | "right"; color?: string; bold?: boolean } = {}) {
  const size = opts.size ?? 14;
  const value = fit(t, width, size);
  return make({
    type: "text",
    x,
    y,
    width,
    height: size * 1.25,
    text: value,
    originalText: value,
    fontSize: size,
    fontFamily: 6,
    textAlign: opts.align ?? "center",
    verticalAlign: "top",
    containerId: null,
    lineHeight: 1.25,
    autoResize: false,
    strokeColor: opts.color ?? INK,
    customData: opts.bold ? { avenBold: true } : undefined,
  });
}

function rect(x: number, y: number, w: number, h: number, fill: string, stroke = "transparent", rounded = false) {
  return make({ type: "rectangle", x, y, width: Math.max(0.5, w), height: Math.max(0.5, h), backgroundColor: fill, strokeColor: stroke, roundness: rounded ? { type: 3 } : null });
}

function polyline(points: [number, number][], opts: { color?: string; width?: number; fill?: string; dashed?: boolean; round?: boolean } = {}) {
  const [x0, y0] = points[0];
  const rel = points.map(([x, y]) => [x - x0, y - y0] as [number, number]);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  return make({
    type: "line",
    x: x0,
    y: y0,
    points: rel,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    strokeColor: opts.color ?? INK,
    strokeWidth: opts.width ?? 2,
    strokeStyle: opts.dashed ? "dashed" : "solid",
    backgroundColor: opts.fill ?? "transparent",
    roundness: opts.round ? { type: 2 } : null,
    startArrowhead: null,
    endArrowhead: null,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    polygon: !!opts.fill,
  });
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmt = (v: number, unit: string) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] {
  const steps = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 72));
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// ------------------------------------------------------------------ layout

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Build every visual element of a chart inside `box` (the box element itself excluded). */
export function buildParts(box: Box, d: ChartData): ExcalidrawElement[] {
  const parts: ExcalidrawElement[] = [];
  const pad = 16;
  let top = box.y + pad;
  if (d.title.trim() && d.kind !== "table") {
    parts.push(text(d.title, box.x + pad, top, box.width - pad * 2, { size: 20, bold: true }));
    top += 34;
  }
  const left = box.x + pad;
  const right = box.x + box.width - pad;
  const bottom = box.y + box.height - pad;
  const rows = d.rows.filter((r) => Number.isFinite(r.value));
  const color = (i: number) => d.palette[i % d.palette.length] ?? CHART_PALETTE[i % CHART_PALETTE.length];

  if (d.kind === "table") {
    const t = d.table.filter((r) => r.length);
    const cols = Math.max(1, ...t.map((r) => r.length));
    const rowsN = Math.max(1, t.length);
    const cw = (right - left) / cols;
    const rh = (bottom - top) / rowsN;
    const size = Math.max(10, Math.min(18, rh * 0.42));
    t.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        const x = left + c * cw;
        const y = top + r * rh;
        parts.push(rect(x, y, cw, rh, r === 0 ? "#e7f5ff" : r % 2 ? "#ffffff" : "#f8f9fa", GRID));
        parts.push(text(row[c] ?? "", x + 8, y + rh / 2 - (size * 1.25) / 2, cw - 16, { size, align: "left", bold: r === 0 }));
      }
    });
    return parts;
  }

  if (!rows.length) {
    parts.push(text("Add data to draw the chart", left, (top + bottom) / 2 - 10, right - left, { color: MUTED }));
    return parts;
  }

  if (d.kind === "pie" || d.kind === "donut") {
    const legendW = Math.min(220, (right - left) * 0.42);
    const size = Math.min(right - left - legendW - pad, bottom - top);
    const r = size / 2;
    const cx = left + r;
    const cy = top + (bottom - top) / 2;
    const total = rows.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    let a = -Math.PI / 2;
    rows.forEach((row, i) => {
      const share = Math.max(0, row.value) / total;
      if (share <= 0) return;
      const a1 = a + share * Math.PI * 2;
      const outer = arc(cx, cy, r, a, a1);
      const pts: [number, number][] =
        d.kind === "donut" ? [...outer, ...arc(cx, cy, r * 0.56, a, a1).reverse()] : [[cx, cy], ...outer];
      pts.push(pts[0]);
      parts.push(polyline(pts, { color: "#ffffff", width: 2, fill: color(i) }));
      a = a1;
    });
    if (d.kind === "donut") parts.push(text(fmt(rows.reduce((s, x) => s + x.value, 0), d.unit), cx - r * 0.5, cy - 14, r, { size: 20, bold: true }));
    const lx = left + size + pad * 1.5;
    rows.forEach((row, i) => {
      const y = top + i * 26;
      if (y > bottom - 14) return;
      parts.push(rect(lx, y + 3, 12, 12, color(i), "transparent", true));
      const pct = Math.round((Math.max(0, row.value) / total) * 100);
      parts.push(text(`${row.label}  ${d.showValues ? `${fmt(row.value, d.unit)} · ` : ""}${pct}%`, lx + 20, y, right - lx - 20, { size: 14, align: "left" }));
    });
    return parts;
  }

  const max = niceMax(Math.max(...rows.map((r) => r.value), 0));
  const labelH = 22;

  if (d.kind === "hbar") {
    const labelW = Math.min(120, (right - left) * 0.3);
    const plotL = left + labelW;
    const plotR = right - (d.showValues ? 48 : 8);
    const slot = (bottom - top) / rows.length;
    rows.forEach((row, i) => {
      const y = top + i * slot;
      const h = slot * 0.62;
      const w = ((plotR - plotL) * Math.max(0, row.value)) / max;
      parts.push(text(row.label, left, y + slot / 2 - 9, labelW - 8, { size: 14, align: "right" }));
      parts.push(rect(plotL, y + (slot - h) / 2, w, h, color(i), "transparent", true));
      if (d.showValues) parts.push(text(fmt(row.value, d.unit), plotL + w + 6, y + slot / 2 - 9, 60, { size: 13, align: "left", color: MUTED }));
    });
    parts.push(polyline([[plotL, top], [plotL, bottom]], { color: GRID, width: 1 }));
    return parts;
  }

  // vertical: bar and line
  const plotB = bottom - labelH;
  const plotT = top + (d.showValues ? 18 : 4);
  const slot = (right - left) / rows.length;
  for (let g = 1; g <= 4; g++) {
    const y = plotB - ((plotB - plotT) * g) / 4;
    parts.push(polyline([[left, y], [right, y]], { color: GRID, width: 1, dashed: true }));
  }
  parts.push(polyline([[left, plotB], [right, plotB]], { color: MUTED, width: 1 }));
  const yOf = (v: number) => plotB - ((plotB - plotT) * Math.max(0, v)) / max;
  if (d.kind === "bar") {
    rows.forEach((row, i) => {
      const w = slot * 0.6;
      const x = left + i * slot + (slot - w) / 2;
      const y = yOf(row.value);
      parts.push(rect(x, y, w, plotB - y, color(i), "transparent", true));
      if (d.showValues) parts.push(text(fmt(row.value, d.unit), left + i * slot, y - 20, slot, { size: 13, color: MUTED }));
      parts.push(text(row.label, left + i * slot, plotB + 4, slot, { size: 14 }));
    });
  } else {
    const pts = rows.map((row, i) => [left + i * slot + slot / 2, yOf(row.value)] as [number, number]);
    if (pts.length > 1) parts.push(polyline(pts, { color: color(0), width: 3, round: false }));
    pts.forEach(([x, y], i) => {
      parts.push(make({ type: "ellipse", x: x - 5, y: y - 5, width: 10, height: 10, backgroundColor: color(0), strokeColor: "#ffffff", strokeWidth: 2 }));
      if (d.showValues) parts.push(text(fmt(rows[i].value, d.unit), x - slot / 2, y - 24, slot, { size: 13, color: MUTED }));
      parts.push(text(rows[i].label, left + i * slot, plotB + 4, slot, { size: 14 }));
    });
  }
  return parts;
}

/** Create a new chart with its top-left corner at (x, y). */
export function createChart(x: number, y: number, kind: ChartKind, data?: ChartData): ExcalidrawElement[] {
  const d = data ?? defaultChartData(kind);
  const size = kind === "table" ? { w: 480, h: 200 } : kind === "pie" || kind === "donut" ? { w: 460, h: 280 } : kind === "hbar" ? { w: 440, h: 260 } : { w: 480, h: 300 };
  const chartId = randomId();
  const groupId = randomId();
  const box = make({
    type: "rectangle",
    x,
    y,
    width: size.w,
    height: size.h,
    backgroundColor: kind === "table" ? "transparent" : "#ffffff",
    strokeColor: kind === "table" ? "transparent" : GRID,
    roundness: { type: 3 },
    groupIds: [groupId],
    customData: { avenChart: { chartId, role: "box", data: d } satisfies ChartRef },
  });
  return [box, ...tagParts(buildParts(box, d), chartId, groupId)];
}

function tagParts(parts: ExcalidrawElement[], chartId: string, groupId: string): ExcalidrawElement[] {
  return parts.map((p) => ({ ...p, groupIds: [groupId], customData: { ...(customData(p) ?? {}), avenChart: { chartId, role: "part" } } }) as ExcalidrawElement);
}

/** Chart ids touched by a selection. */
export function chartIdsIn(scene: readonly ExcalidrawElement[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  const out = new Set<string>();
  for (const el of scene) if (set.has(el.id)) { const r = chartRef(el); if (r) out.add(r.chartId); }
  return [...out];
}

export function chartBox(scene: readonly ExcalidrawElement[], chartId: string): ExcalidrawElement | undefined {
  return scene.find((e) => !e.isDeleted && chartRef(e)?.chartId === chartId && chartRef(e)?.role === "box");
}

/** Replace a chart's parts with freshly built ones (new data and/or the box's new size). */
export function rebuildChart(scene: readonly ExcalidrawElement[], chartId: string, data?: ChartData): ExcalidrawElement[] {
  const box = chartBox(scene, chartId);
  if (!box) return [...scene];
  const ref = chartRef(box)!;
  const d = data ?? ref.data!;
  const groupId = box.groupIds[box.groupIds.length - 1] ?? randomId();
  const newBox = {
    ...box,
    backgroundColor: d.kind === "table" ? "transparent" : box.backgroundColor === "transparent" ? "#ffffff" : box.backgroundColor,
    strokeColor: d.kind === "table" ? "transparent" : box.strokeColor === "transparent" ? GRID : box.strokeColor,
    customData: { ...customData(box), avenChart: { ...ref, data: d } },
    version: box.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
  } as ExcalidrawElement;
  const parts = tagParts(buildParts(newBox, d), chartId, groupId).map((p) => ({ ...p, groupIds: [...box.groupIds] }) as ExcalidrawElement);
  const out: ExcalidrawElement[] = [];
  for (const e of scene) {
    if (chartRef(e)?.chartId !== chartId) out.push(e);
    else if (e.id === box.id) out.push(newBox, ...parts);
    // old parts are dropped
  }
  return out;
}

/** Parse "label, value" lines (also tabs or semicolons) into chart rows. */
export function parseRows(text: string): ChartRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)[\t;,:]\s*(-?\d+(?:[.,]\d+)?)\s*%?$/);
      return m ? { label: m[1].trim(), value: Number(m[2].replace(",", ".")) } : { label: l, value: 0 };
    });
}

export function rowsToText(rows: ChartRow[]): string {
  return rows.map((r) => `${r.label}, ${r.value}`).join("\n");
}

/** Parse a pasted table (tabs from spreadsheets, or ; / , / |). */
export function parseTable(text: string): string[][] {
  // skip blank lines and Markdown separator rows like |---|:--|
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*\|?\s*:?-{2,}/.test(l));
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(";")) ? ";" : lines.some((l) => l.includes("|")) ? "|" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.trim()).filter((c, i, all) => !(sep === "|" && (i === 0 || i === all.length - 1) && c === "")));
}

export function tableToText(t: string[][]): string {
  return t.map((r) => r.join("\t")).join("\n");
}
