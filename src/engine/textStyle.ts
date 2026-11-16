// Rich text styles for whole text elements: bold, italic, underline, strikethrough.
// Stored in `customData` (avenBold / avenItalic / avenUnderline / avenStrike) and rendered
// through small hooks added to the engine by scripts/patch-engine.mjs.
import { customData, withCustomData } from "./elements";
import type { ExcalidrawElement } from "./types";

export type TextStyleKey = "bold" | "italic" | "underline" | "strike";

const FLAG: Record<TextStyleKey, string> = {
  bold: "avenBold",
  italic: "avenItalic",
  underline: "avenUnderline",
  strike: "avenStrike",
};

export function hasStyle(el: ExcalidrawElement, key: TextStyleKey): boolean {
  return !!customData(el)[FLAG[key]];
}

/** Underline / strikethrough geometry for one rendered line (baseline coordinates). */
export function decorationRects(
  el: { fontSize: number; textAlign: string; customData?: Record<string, any> | null },
  lineWidth: number,
  x: number,
  baselineY: number,
): { x: number; y: number; w: number; h: number }[] {
  const cd = el.customData ?? {};
  if (!cd.avenUnderline && !cd.avenStrike) return [];
  const left = el.textAlign === "center" ? x - lineWidth / 2 : el.textAlign === "right" ? x - lineWidth : x;
  const h = Math.max(1, el.fontSize / 15);
  const out = [];
  if (cd.avenUnderline) out.push({ x: left, y: baselineY + el.fontSize * 0.12, w: lineWidth, h });
  if (cd.avenStrike) out.push({ x: left, y: baselineY - el.fontSize * 0.3, w: lineWidth, h });
  return out;
}

/** Register the rendering hooks the patched engine calls. Safe to call more than once. */
export function installTextStyleHooks() {
  const g = globalThis as any;
  g.__avenDecorate = (ctx: CanvasRenderingContext2D, el: any, line: string, x: number, y: number) => {
    if (!line || !el.customData) return;
    const rects = decorationRects(el, ctx.measureText(line).width, x, y);
    for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
  };
  g.__avenDecorateSvg = (node: SVGTextElement, el: any) => {
    const cd = el.customData;
    if (!cd) return;
    if (cd.avenBold) node.setAttribute("font-weight", "bold");
    if (cd.avenItalic) node.setAttribute("font-style", "italic");
    const deco = [cd.avenUnderline && "underline", cd.avenStrike && "line-through"].filter(Boolean).join(" ");
    if (deco) node.setAttribute("text-decoration", deco);
  };
}

/** Text elements affected by a selection: selected texts and the labels of selected shapes. */
export function styleTargets(scene: readonly ExcalidrawElement[], selectedIds: readonly string[]): ExcalidrawElement[] {
  const sel = new Set(selectedIds);
  return scene.filter((e) => !e.isDeleted && e.type === "text" && (sel.has(e.id) || ((e as any).containerId && sel.has((e as any).containerId))));
}

/**
 * Toggle a style on the selection (on for all if any is off, otherwise off for all) and
 * re-measure the texts so wrapping and container sizes stay correct.
 */
export function toggleTextStyle(scene: readonly ExcalidrawElement[], selectedIds: readonly string[], key: TextStyleKey): ExcalidrawElement[] | null {
  const targets = styleTargets(scene, selectedIds);
  if (!targets.length) return null;
  const turnOn = targets.some((t) => !hasStyle(t, key));
  const ids = new Set(targets.map((t) => t.id));
  // fresh copies so the engine's re-measure can mutate them safely
  const next = scene.map((e) => (ids.has(e.id) ? withCustomData(e, { [FLAG[key]]: turnOn ? true : undefined }) : { ...e })) as ExcalidrawElement[];
  const map = new Map(next.map((e) => [e.id, e]));
  const redraw = (globalThis as any).__avenRedrawText as undefined | ((t: any, c: any, m: any, inform: boolean) => void);
  if (redraw && (key === "bold" || key === "italic")) {
    for (const id of ids) {
      const t = map.get(id) as any;
      const container = t.containerId ? (map.get(t.containerId) as any) ?? null : null;
      const before = { x: t.x, y: t.y, width: t.width, height: t.height, text: t.text };
      const containerBefore = container ? { height: container.height, y: container.y } : null;
      try {
        redraw(t, container, map, false);
      } catch {
        /* re-measure is best effort; the style itself is applied */
      }
      // never let a failed measurement make a text disappear
      if (![t.x, t.y, t.width, t.height].every(Number.isFinite) || typeof t.text !== "string") {
        Object.assign(t, before);
        if (container && containerBefore) Object.assign(container, containerBefore);
      }
    }
  }
  return next;
}
