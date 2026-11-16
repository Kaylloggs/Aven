// Optional Layers subsystem. Pure functions over element arrays: membership is stored in
// `element.customData.avenLayer`; elements on hidden layers are kept out of the canvas in
// `LayerState.hidden`, so the standard editor never has to know layers exist.
import { customData, randomId, withCustomData, withProps } from "./elements";
import type { ExcalidrawElement, LayerDef, LayerState } from "./types";

const KEY = "avenLayer";

export function createLayerState(elements: readonly ExcalidrawElement[]): { state: LayerState; elements: ExcalidrawElement[] } {
  const base: LayerDef = { id: randomId(), name: "Layer 1", visible: true, locked: false, opacity: 100, kind: "layer" };
  const state: LayerState = { layers: [base], activeLayerId: base.id, hidden: [] };
  return { state, elements: elements.map((el) => (customData(el)[KEY] ? el : withCustomData(el, { [KEY]: base.id }))) };
}

export const drawableLayers = (s: LayerState) => s.layers.filter((l) => l.kind !== "group");

export function layerIdOf(el: ExcalidrawElement, s: LayerState): string {
  const id = customData(el)[KEY];
  if (id && s.layers.some((l) => l.id === id && l.kind !== "group")) return id;
  return drawableLayers(s)[0]?.id ?? s.activeLayerId;
}

function parentOf(s: LayerState, l: LayerDef) {
  return l.parentId ? s.layers.find((p) => p.id === l.parentId) : undefined;
}

export function isVisible(s: LayerState, id: string): boolean {
  const l = s.layers.find((x) => x.id === id);
  if (!l) return true;
  const p = parentOf(s, l);
  return l.visible && (!p || p.visible);
}

export function isLocked(s: LayerState, id: string): boolean {
  const l = s.layers.find((x) => x.id === id);
  if (!l) return false;
  const p = parentOf(s, l);
  return l.locked || !!p?.locked;
}

export function effectiveOpacity(s: LayerState, id: string): number {
  const l = s.layers.find((x) => x.id === id);
  if (!l) return 1;
  const p = parentOf(s, l);
  return (l.opacity / 100) * (p ? p.opacity / 100 : 1);
}

/** Order elements bottom→top by layer, keeping the original order inside each layer. */
export function sortByLayer(els: readonly ExcalidrawElement[], s: LayerState): ExcalidrawElement[] {
  const rank = new Map(drawableLayers(s).map((l, i) => [l.id, i]));
  return els
    .map((el, i) => ({ el, i, r: rank.get(layerIdOf(el, s)) ?? 0 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.el);
}

export function isSorted(els: readonly ExcalidrawElement[], s: LayerState): boolean {
  const rank = new Map(drawableLayers(s).map((l, i) => [l.id, i]));
  let last = -1;
  for (const el of els) {
    if (el.isDeleted) continue;
    const r = rank.get(layerIdOf(el, s)) ?? 0;
    if (r < last) return false;
    last = r;
  }
  return true;
}

/** Put freshly drawn elements (no layer yet) on the active layer. */
export function assignNewElements(els: readonly ExcalidrawElement[], s: LayerState) {
  let changed = false;
  const active = drawableLayers(s).some((l) => l.id === s.activeLayerId) ? s.activeLayerId : drawableLayers(s)[0].id;
  const out = els.map((el) => {
    if (el.isDeleted || customData(el)[KEY]) return el;
    changed = true;
    return withCustomData(el, { [KEY]: active });
  });
  return { elements: out, changed };
}

/**
 * Reconcile the canvas with the layer settings: move elements of hidden layers out of the
 * scene (and back), apply layer locks and opacity, and keep z-order grouped by layer.
 */
export function applyLayers(scene: readonly ExcalidrawElement[], s: LayerState): { scene: ExcalidrawElement[]; state: LayerState } {
  const all = [...scene.filter((e) => !e.isDeleted), ...s.hidden];
  const visible: ExcalidrawElement[] = [];
  const hidden: ExcalidrawElement[] = [];
  for (let el of all) {
    const lid = layerIdOf(el, s);
    const cd = customData(el);
    // locks
    const locked = isLocked(s, lid);
    if (locked && !el.locked) el = withCustomData(withProps(el, { locked: true }), { avenLayerLock: true });
    else if (!locked && cd.avenLayerLock) el = withCustomData(withProps(el, { locked: false }), { avenLayerLock: undefined });
    // opacity: element opacity = base × layer factor
    const factor = effectiveOpacity(s, lid);
    const appliedFactor = typeof customData(el).avenLayerFactor === "number" ? customData(el).avenLayerFactor : 1;
    if (Math.abs(factor - appliedFactor) > 0.001) {
      const base = appliedFactor > 0 ? el.opacity / appliedFactor : (customData(el).avenBaseOpacity ?? el.opacity);
      const next = Math.max(0, Math.min(100, Math.round(base * factor)));
      el = withCustomData(withProps(el, { opacity: next }), {
        avenLayerFactor: factor === 1 ? undefined : factor,
        avenBaseOpacity: factor === 1 ? undefined : base,
      });
    }
    (isVisible(s, lid) ? visible : hidden).push(el);
  }
  return { scene: sortByLayer(visible, s), state: { ...s, hidden } };
}

export function addLayer(s: LayerState, name?: string): LayerState {
  const n = drawableLayers(s).length + 1;
  const layer: LayerDef = { id: randomId(), name: name ?? `Layer ${n}`, visible: true, locked: false, opacity: 100, kind: "layer" };
  return { ...s, layers: [...s.layers, layer], activeLayerId: layer.id };
}

export function updateLayer(s: LayerState, id: string, patch: Partial<LayerDef>): LayerState {
  return { ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Delete a layer. Its elements are deleted too unless `keepElements`, which merges them into the layer below. */
export function removeLayer(scene: readonly ExcalidrawElement[], s: LayerState, id: string, keepElements: boolean) {
  const drawable = drawableLayers(s);
  const target = s.layers.find((l) => l.id === id);
  if (!target) return { scene: [...scene], state: s };
  if (target.kind === "group") {
    // removing a group keeps its children as top-level layers
    const layers = s.layers.filter((l) => l.id !== id).map((l) => (l.parentId === id ? { ...l, parentId: null } : l));
    return { scene: [...scene], state: { ...s, layers } };
  }
  if (drawable.length <= 1) return { scene: [...scene], state: s };
  const idx = drawable.findIndex((l) => l.id === id);
  const fallback = drawable[idx - 1] ?? drawable[idx + 1];
  const move = (el: ExcalidrawElement) => {
    if (layerIdOf(el, s) !== id) return el;
    return keepElements ? withCustomData(el, { [KEY]: fallback.id }) : withProps(el, { isDeleted: true });
  };
  const state: LayerState = {
    layers: s.layers.filter((l) => l.id !== id),
    activeLayerId: s.activeLayerId === id ? fallback.id : s.activeLayerId,
    hidden: s.hidden.map(move).filter((e) => !e.isDeleted),
  };
  return { scene: scene.map(move), state };
}

/** Move a layer to a new position in the bottom→top list. */
export function moveLayer(s: LayerState, id: string, toIndex: number): LayerState {
  const layers = [...s.layers];
  const from = layers.findIndex((l) => l.id === id);
  if (from < 0) return s;
  const [l] = layers.splice(from, 1);
  layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, l);
  return { ...s, layers };
}

export function moveElementsToLayer(scene: readonly ExcalidrawElement[], ids: ReadonlySet<string>, layerId: string) {
  return scene.map((el) => (ids.has(el.id) || (el as any).containerId && ids.has((el as any).containerId) ? withCustomData(el, { [KEY]: layerId }) : el));
}

export function elementIdsInLayer(scene: readonly ExcalidrawElement[], s: LayerState, layerId: string): string[] {
  return scene.filter((el) => !el.isDeleted && layerIdOf(el, s) === layerId && !(el as any).containerId).map((el) => el.id);
}

export function countByLayer(scene: readonly ExcalidrawElement[], s: LayerState): Map<string, number> {
  const m = new Map<string, number>();
  for (const el of [...scene, ...s.hidden]) {
    if (el.isDeleted) continue;
    const id = layerIdOf(el, s);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Duplicate a layer and all of its elements (new ids, references remapped). */
export function duplicateLayer(scene: readonly ExcalidrawElement[], s: LayerState, id: string, clone: (els: readonly ExcalidrawElement[], layerId: string) => ExcalidrawElement[]) {
  const src = s.layers.find((l) => l.id === id);
  if (!src || src.kind === "group") return { scene: [...scene], state: s };
  const copy: LayerDef = { ...src, id: randomId(), name: `${src.name} copy` };
  const idx = s.layers.findIndex((l) => l.id === id);
  const layers = [...s.layers];
  layers.splice(idx + 1, 0, copy);
  const state: LayerState = { ...s, layers, activeLayerId: copy.id };
  const sourceEls = [...scene, ...s.hidden].filter((el) => !el.isDeleted && layerIdOf(el, s) === id);
  const copies = clone(sourceEls, copy.id);
  return { scene: [...scene, ...copies], state };
}

/** Wrap layers in a group layer. */
export function groupLayers(s: LayerState, ids: string[], name = "Group"): LayerState {
  const group: LayerDef = { id: randomId(), name, visible: true, locked: false, opacity: 100, kind: "group", collapsed: false };
  const firstIdx = Math.min(...ids.map((id) => s.layers.findIndex((l) => l.id === id)).filter((i) => i >= 0));
  const layers = s.layers.map((l) => (ids.includes(l.id) && l.kind !== "group" ? { ...l, parentId: group.id } : l));
  layers.splice(Number.isFinite(firstIdx) ? firstIdx : layers.length, 0, group);
  return { ...s, layers };
}

/** Make every layer visible and unlocked (used when advanced editing is switched off). */
export function flattenForStandardEditor(scene: readonly ExcalidrawElement[], s: LayerState) {
  const open: LayerState = { ...s, layers: s.layers.map((l) => ({ ...l, visible: true, locked: false })) };
  return applyLayers(scene, open);
}
