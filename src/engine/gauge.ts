// Percentage gauges: a bar or a ring made of ordinary, editable elements that stay linked
// through `customData.avenGauge`. Changing the value regenerates the fill and the label from
// the track's current position and size, so users can move and resize gauges freely.
import { customData, randomId, withProps } from "./elements";
import type { ExcalidrawElement } from "./types";

export type GaugeStyle = "bar" | "ring";
export type GaugeRole = "track" | "fill" | "label";

export interface GaugeData {
  gaugeId: string;
  role: GaugeRole;
  value: number; // 0..100
  style: GaugeStyle;
  color: string;
}

export const GAUGE_COLORS = ["#2FB27E", "#567BF7", "#F5AE39", "#F76046", "#8E5BE8"];

const TRACK_COLOR = "#e9ecef";
const FONT_SIZE = 20;
const LINE_HEIGHT = 1.25;

export function gaugeData(el: ExcalidrawElement): GaugeData | null {
  const g = customData(el).avenGauge;
  return g && typeof g.gaugeId === "string" ? g : null;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function base(over: Record<string, unknown>): ExcalidrawElement {
  return {
    id: randomId(),
    angle: 0,
    strokeColor: "#1e1e1e",
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

function labelElement(text: string, x: number, y: number, width: number, align: "left" | "center", data: GaugeData, groupIds: string[]): ExcalidrawElement {
  return base({
    type: "text",
    x,
    y,
    width,
    height: FONT_SIZE * LINE_HEIGHT,
    text,
    originalText: text,
    fontSize: FONT_SIZE,
    fontFamily: 6,
    textAlign: align,
    verticalAlign: "top",
    containerId: null,
    lineHeight: LINE_HEIGHT,
    autoResize: false,
    baseline: Math.round(FONT_SIZE * 0.9),
    groupIds,
    customData: { avenGauge: { ...data, role: "label" } },
  });
}

/** Arc points (absolute) from 12 o'clock, clockwise, for `value` percent of an ellipse. */
export function ringPoints(cx: number, cy: number, rx: number, ry: number, value: number, segments = 64): [number, number][] {
  const n = Math.max(2, Math.ceil((segments * value) / 100) + 1);
  const end = (value / 100) * Math.PI * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (end * i) / (n - 1);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Create a new gauge with its top-left corner at (x, y). */
export function createGauge(x: number, y: number, opts: { value?: number; style?: GaugeStyle; color?: string } = {}): ExcalidrawElement[] {
  const value = clamp(opts.value ?? 50);
  const style = opts.style ?? "bar";
  const color = opts.color ?? GAUGE_COLORS[0];
  const gaugeId = randomId();
  const groupIds = [randomId()];
  const data: GaugeData = { gaugeId, role: "track", value, style, color };
  const track =
    style === "bar"
      ? base({ type: "rectangle", x, y, width: 260, height: 28, strokeColor: "transparent", backgroundColor: TRACK_COLOR, roundness: { type: 3 }, groupIds, customData: { avenGauge: data } })
      : base({ type: "ellipse", x, y, width: 140, height: 140, strokeColor: TRACK_COLOR, strokeWidth: 12, roundness: { type: 2 }, groupIds, customData: { avenGauge: data } });
  const fill =
    style === "bar"
      ? base({ type: "rectangle", x, y, width: 1, height: 28, strokeColor: "transparent", backgroundColor: color, roundness: { type: 3 }, groupIds, customData: { avenGauge: { ...data, role: "fill" } } })
      : base({ type: "line", x, y, width: 1, height: 1, points: [[0, 0], [1, 0]], strokeColor: color, strokeWidth: 12, roundness: { type: 2 }, groupIds, customData: { avenGauge: { ...data, role: "fill" } }, startArrowhead: null, endArrowhead: null, lastCommittedPoint: null, startBinding: null, endBinding: null, polygon: false });
  const label = labelElement(`${value}%`, x, y, 70, "left", { ...data, role: "label" }, groupIds);
  return layoutGauge([track, fill, label], value, color);
}

/** Recompute fill and label of one gauge (its three elements) for a value and colour. */
export function layoutGauge(els: readonly ExcalidrawElement[], value: number, color?: string): ExcalidrawElement[] {
  const v = clamp(value);
  const track = els.find((e) => gaugeData(e)?.role === "track");
  if (!track) return [...els];
  const d = gaugeData(track)!;
  const c = color ?? d.color;
  const meta = (role: GaugeRole) => ({ avenGauge: { ...d, role, value: v, color: c } });
  return els.map((el) => {
    const role = gaugeData(el)?.role;
    if (role === "track") return withProps(el, { customData: meta("track") } as any);
    if (role === "fill") {
      if (d.style === "bar") {
        const w = (track.width * v) / 100;
        return withProps(el, { x: track.x, y: track.y, width: Math.max(1, w), height: track.height, backgroundColor: c, opacity: v === 0 ? 0 : 100, customData: meta("fill") } as any);
      }
      const sw = (track as any).strokeWidth ?? 12;
      const pts = ringPoints(track.x + track.width / 2, track.y + track.height / 2, track.width / 2, track.height / 2, Math.max(v, 0.5));
      const [x0, y0] = pts[0];
      const rel = pts.map(([px, py]) => [px - x0, py - y0] as [number, number]);
      const xs = rel.map((p) => p[0]);
      const ys = rel.map((p) => p[1]);
      return withProps(el, {
        x: x0,
        y: y0,
        points: rel,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        strokeColor: c,
        strokeWidth: sw,
        opacity: v === 0 ? 0 : 100,
        customData: meta("fill"),
      } as any);
    }
    if (role === "label") {
      const text = `${v}%`;
      const fs = (el as any).fontSize ?? FONT_SIZE;
      const h = fs * LINE_HEIGHT;
      const pos =
        d.style === "bar"
          ? { x: track.x + track.width + 12, y: track.y + track.height / 2 - h / 2, width: fs * 3.6, textAlign: "left" }
          : { x: track.x, y: track.y + track.height / 2 - h / 2, width: track.width, textAlign: "center" };
      return withProps(el, { ...pos, height: h, text, originalText: text, customData: meta("label") } as any);
    }
    return el;
  });
}

/** Ids of every element belonging to the gauges touched by `ids`. */
export function gaugeIdsIn(scene: readonly ExcalidrawElement[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  const out = new Set<string>();
  for (const el of scene) if (set.has(el.id)) { const g = gaugeData(el); if (g) out.add(g.gaugeId); }
  return [...out];
}

/** Apply a new value (and optional colour) to the given gauges in a scene. */
export function setGaugeValue(scene: readonly ExcalidrawElement[], gaugeIds: readonly string[], value: number, color?: string): ExcalidrawElement[] {
  let out = [...scene];
  for (const gid of gaugeIds) {
    const members = out.filter((e) => !e.isDeleted && gaugeData(e)?.gaugeId === gid);
    const next = new Map(layoutGauge(members, value, color).map((e) => [e.id, e]));
    out = out.map((e) => next.get(e.id) ?? e);
  }
  return out;
}

/** Switch a gauge between bar and ring, keeping its value, colour and position. */
export function restyleGauge(scene: readonly ExcalidrawElement[], gaugeId: string, style: GaugeStyle): ExcalidrawElement[] {
  const members = scene.filter((e) => !e.isDeleted && gaugeData(e)?.gaugeId === gaugeId);
  const track = members.find((e) => gaugeData(e)?.role === "track");
  if (!track) return [...scene];
  const d = gaugeData(track)!;
  if (d.style === style) return [...scene];
  const fresh = createGauge(track.x, track.y, { value: d.value, style, color: d.color });
  const ids = new Set(members.map((m) => m.id));
  const at = scene.findIndex((e) => ids.has(e.id));
  const rest = scene.filter((e) => !ids.has(e.id));
  rest.splice(Math.max(0, at), 0, ...fresh);
  return rest;
}
