// A tiny builder for template drawings. Produces engine "skeleton" elements that are turned
// into real, fully editable elements (with bound labels and connected arrows) at creation time.
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

export const COLORS = {
  ink: "#1e1e1e",
  muted: "#868e96",
  line: "#ced4da",
  red: "#ffc9c9",
  green: "#b2f2bb",
  blue: "#a5d8ff",
  yellow: "#ffec99",
  violet: "#d0bfff",
  orange: "#ffd8a8",
  gray: "#f1f3f5",
  cyan: "#99e9f2",
  pink: "#fcc2d7",
  white: "#ffffff",
  teal: "#96f2d7",
};

type Fill = keyof typeof COLORS | string;
const col = (c?: Fill) => (c ? ((COLORS as Record<string, string>)[c] ?? c) : undefined);

export interface ShapeOpts {
  fill?: Fill;
  stroke?: Fill;
  label?: string;
  size?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  rounded?: boolean;
  dashed?: boolean;
  strokeWidth?: number;
  id?: string;
  opacity?: number;
}

export class Board {
  els: ExcalidrawElementSkeleton[] = [];
  private n = 0;
  constructor(
    public style: { roughness: 0 | 1 | 2; font: 5 | 6 | 8 } = { roughness: 0, font: 6 },
  ) {}

  private nextId(prefix = "e") {
    return `${prefix}${++this.n}`;
  }

  private shape(type: "rectangle" | "ellipse" | "diamond", x: number, y: number, w: number, h: number, o: ShapeOpts = {}) {
    const id = o.id ?? this.nextId(type[0]);
    this.els.push({
      type,
      id,
      x,
      y,
      width: w,
      height: h,
      strokeColor: col(o.stroke) ?? COLORS.ink,
      backgroundColor: col(o.fill) ?? "transparent",
      fillStyle: "solid",
      strokeWidth: o.strokeWidth ?? (o.fill && !o.stroke ? 1 : 2),
      strokeStyle: o.dashed ? "dashed" : "solid",
      roughness: this.style.roughness,
      roundness: o.rounded === false || type !== "rectangle" ? (type === "rectangle" ? null : { type: 2 }) : { type: 3 },
      opacity: o.opacity ?? 100,
      ...(o.label
        ? {
            label: {
              text: o.label,
              fontSize: o.size ?? 16,
              fontFamily: this.style.font,
              textAlign: o.align ?? "center",
              verticalAlign: o.valign ?? "middle",
              strokeColor: COLORS.ink,
            },
          }
        : {}),
    } as ExcalidrawElementSkeleton);
    return id;
  }

  rect(x: number, y: number, w: number, h: number, o: ShapeOpts = {}) {
    return this.shape("rectangle", x, y, w, h, o);
  }
  ellipse(x: number, y: number, w: number, h: number, o: ShapeOpts = {}) {
    return this.shape("ellipse", x, y, w, h, o);
  }
  diamond(x: number, y: number, w: number, h: number, o: ShapeOpts = {}) {
    return this.shape("diamond", x, y, w, h, o);
  }

  /** A sticky note: a filled square-ish card with wrapped text. */
  note(x: number, y: number, text: string, fill: Fill = "yellow", w = 180, h = 120) {
    return this.rect(x, y, w, h, { fill, label: text, size: 16, stroke: "transparent" });
  }

  text(x: number, y: number, text: string, o: { size?: number; color?: Fill; align?: "left" | "center" | "right"; id?: string } = {}) {
    const id = o.id ?? this.nextId("t");
    this.els.push({
      type: "text",
      id,
      x,
      y,
      text,
      fontSize: o.size ?? 16,
      fontFamily: this.style.font,
      strokeColor: col(o.color) ?? COLORS.ink,
      textAlign: o.align ?? "left",
      roughness: this.style.roughness,
    } as ExcalidrawElementSkeleton);
    return id;
  }

  title(x: number, y: number, text: string, subtitle?: string) {
    this.text(x, y, text, { size: 36 });
    if (subtitle) this.text(x, y + 52, subtitle, { size: 18, color: "muted" });
  }

  /** Arrow between two shape ids (bound) or two points. */
  arrow(from: string | [number, number], to: string | [number, number], o: { label?: string; dashed?: boolean; color?: Fill; both?: boolean; elbow?: boolean; points?: [number, number][] } = {}) {
    const id = this.nextId("a");
    const c1 = Array.isArray(from) ? from : this.center(from);
    const c2 = Array.isArray(to) ? to : this.center(to);
    // start and end on the shapes' outlines, not their centres
    const [x1, y1] = Array.isArray(from) ? from : this.edgePoint(from, c2);
    const [x2, y2] = Array.isArray(to) ? to : this.edgePoint(to, c1);
    this.els.push({
      type: "arrow",
      id,
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      points: o.points ?? [
        [0, 0],
        [x2 - x1, y2 - y1],
      ],
      strokeColor: col(o.color) ?? COLORS.ink,
      strokeStyle: o.dashed ? "dashed" : "solid",
      strokeWidth: 2,
      roughness: this.style.roughness,
      startArrowhead: o.both ? "arrow" : null,
      endArrowhead: "arrow",
      ...(o.elbow ? { elbowed: true } : {}),
      ...(typeof from === "string" ? { start: { id: from } } : {}),
      ...(typeof to === "string" ? { end: { id: to } } : {}),
      ...(o.label ? { label: { text: o.label, fontSize: 14, fontFamily: this.style.font } } : {}),
    } as ExcalidrawElementSkeleton);
    return id;
  }

  line(points: [number, number][], o: { color?: Fill; dashed?: boolean; width?: number } = {}) {
    const [x0, y0] = points[0];
    this.els.push({
      type: "line",
      x: x0,
      y: y0,
      points: points.map(([x, y]) => [x - x0, y - y0]),
      strokeColor: col(o.color) ?? COLORS.ink,
      strokeStyle: o.dashed ? "dashed" : "solid",
      strokeWidth: o.width ?? 2,
      roughness: this.style.roughness,
    } as ExcalidrawElementSkeleton);
  }

  frame(name: string, x: number, y: number, w: number, h: number, children: string[] = []) {
    const id = this.nextId("f");
    this.els.push({ type: "frame", id, x, y, width: w, height: h, name, children } as ExcalidrawElementSkeleton);
    return id;
  }

  /** Column board: headed columns with optional cards. Returns the card ids. */
  columns(x: number, y: number, heads: { title: string; fill?: Fill; cards?: string[] }[], o: { w?: number; h?: number; gap?: number; cardFill?: Fill } = {}) {
    const w = o.w ?? 240;
    const h = o.h ?? 520;
    const gap = o.gap ?? 24;
    heads.forEach((c, i) => {
      const cx = x + i * (w + gap);
      this.rect(cx, y, w, h, { fill: "gray", stroke: "transparent" });
      this.rect(cx + 12, y + 12, w - 24, 44, { fill: c.fill ?? "white", label: c.title, size: 18, stroke: "transparent" });
      (c.cards ?? []).forEach((t, j) => this.rect(cx + 12, y + 72 + j * 92, w - 24, 80, { fill: o.cardFill ?? "white", label: t, size: 15 }));
    });
  }

  /** A simple table made of labelled cells. */
  table(x: number, y: number, widths: number[], rows: string[][], o: { rowH?: number; header?: Fill; zebra?: boolean } = {}) {
    const rowH = o.rowH ?? 48;
    rows.forEach((row, r) => {
      let cx = x;
      row.forEach((cell, c) => {
        const head = r === 0 || c === 0;
        this.rect(cx, y + r * rowH, widths[c], rowH, {
          fill: r === 0 ? (o.header ?? "blue") : c === 0 ? "gray" : o.zebra && r % 2 === 0 ? "#f8f9fa" : "white",
          label: cell || undefined,
          size: head ? 16 : 14,
          stroke: "line",
          strokeWidth: 1,
          rounded: false,
        });
        cx += widths[c];
      });
    });
  }

  /** Titled section box with a hint text inside (canvas blocks, briefs). */
  section(x: number, y: number, w: number, h: number, title: string, hint = "", fill: Fill = "white") {
    const id = this.rect(x, y, w, h, { fill, stroke: "line", strokeWidth: 1 });
    this.text(x + 16, y + 14, title, { size: 20 });
    if (hint) this.text(x + 16, y + 48, hint, { size: 14, color: "muted" });
    return id;
  }

  /** Where the ray from a shape's centre toward `toward` leaves the shape (plus a small gap). */
  private edgePoint(id: string, toward: [number, number], gap = 6): [number, number] {
    const el = this.els.find((e) => (e as any).id === id) as any;
    if (!el) return [0, 0];
    const hw = (el.width ?? 0) / 2;
    const hh = (el.height ?? 0) / 2;
    const cx = el.x + hw;
    const cy = el.y + hh;
    const dx = toward[0] - cx;
    const dy = toward[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    let t: number;
    if (el.type === "ellipse") t = 1 / Math.sqrt((ux * ux) / (hw * hw) + (uy * uy) / (hh * hh));
    else if (el.type === "diamond") t = 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh);
    else t = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity);
    return [cx + ux * (t + gap), cy + uy * (t + gap)];
  }

  private center(id: string): [number, number] {
    const el = this.els.find((e) => (e as any).id === id) as any;
    if (!el) return [0, 0];
    return [el.x + (el.width ?? 0) / 2, el.y + (el.height ?? 0) / 2];
  }
}
