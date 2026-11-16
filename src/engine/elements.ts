// Small, engine-level helpers for immutable element updates.
import type { ExcalidrawElement } from "./types";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Return a copy of `el` with `patch` applied and its version bumped (what the renderer keys on). */
export function withProps<T extends ExcalidrawElement>(el: T, patch: Partial<Mutable<T>>): T {
  return {
    ...el,
    ...patch,
    version: el.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    updated: Date.now(),
  } as T;
}

export function customData(el: ExcalidrawElement): Record<string, any> {
  return (el.customData as Record<string, any>) ?? {};
}

export function withCustomData<T extends ExcalidrawElement>(el: T, patch: Record<string, any>): T {
  const next: Record<string, any> = { ...customData(el) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return withProps(el, { customData: Object.keys(next).length ? next : undefined } as any);
}

export function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

/** Axis-aligned bounds of elements (rotation ignored, linear points included). */
export function getBounds(els: readonly ExcalidrawElement[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    if (el.isDeleted) continue;
    const pts: readonly (readonly [number, number])[] | undefined = (el as any).points;
    if (pts && pts.length) {
      for (const [px, py] of pts) {
        minX = Math.min(minX, el.x + px);
        minY = Math.min(minY, el.y + py);
        maxX = Math.max(maxX, el.x + px);
        maxY = Math.max(maxY, el.y + py);
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Deep-copy elements with fresh ids, remapping every internal reference
 * (groups, bound text, arrow bindings, frames) so the copy is self-consistent.
 */
export function cloneWithNewIds(
  els: readonly ExcalidrawElement[],
  opts: { dx?: number; dy?: number; extraGroupId?: string; mapCustomData?: (el: ExcalidrawElement, oldId: string) => Record<string, any> | undefined } = {},
): ExcalidrawElement[] {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const el of els) idMap.set(el.id, randomId());
  const mapGroup = (g: string) => {
    if (!groupMap.has(g)) groupMap.set(g, randomId());
    return groupMap.get(g)!;
  };
  const mapId = (id: string | null | undefined) => (id && idMap.has(id) ? idMap.get(id)! : null);
  return els
    .filter((e) => !e.isDeleted)
    .map((el) => {
      const anyEl = el as any;
      const groupIds = [...el.groupIds.map(mapGroup), ...(opts.extraGroupId ? [opts.extraGroupId] : [])];
      const next: any = {
        ...el,
        id: idMap.get(el.id)!,
        x: el.x + (opts.dx ?? 0),
        y: el.y + (opts.dy ?? 0),
        groupIds,
        index: null,
        version: 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        seed: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
        frameId: mapId(el.frameId),
        boundElements: el.boundElements
          ? el.boundElements.filter((b) => idMap.has(b.id)).map((b) => ({ ...b, id: idMap.get(b.id)! }))
          : null,
      };
      if ("containerId" in anyEl) next.containerId = mapId(anyEl.containerId);
      if (anyEl.startBinding) next.startBinding = idMap.has(anyEl.startBinding.elementId) ? { ...anyEl.startBinding, elementId: idMap.get(anyEl.startBinding.elementId) } : null;
      if (anyEl.endBinding) next.endBinding = idMap.has(anyEl.endBinding.elementId) ? { ...anyEl.endBinding, elementId: idMap.get(anyEl.endBinding.elementId) } : null;
      if (opts.mapCustomData) next.customData = opts.mapCustomData(el, el.id);
      return next as ExcalidrawElement;
    });
}
