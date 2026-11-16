// Optional Components subsystem: reusable element groups with linked instances.
// Instance elements carry `customData.avenComponent = { componentId, instanceId, version }`.
import { cloneWithNewIds, customData, getBounds, randomId, withCustomData } from "./elements";
import type { BinaryFiles, ComponentDef, ExcalidrawElement } from "./types";

const KEY = "avenComponent";

export interface InstanceRef {
  componentId: string;
  instanceId: string;
  version: number;
}

export function instanceRef(el: ExcalidrawElement): InstanceRef | null {
  const r = customData(el)[KEY];
  return r && typeof r.componentId === "string" ? r : null;
}

function stripAvenData(el: ExcalidrawElement): Record<string, any> | undefined {
  const cd = { ...customData(el) };
  delete cd[KEY];
  delete cd.avenLayer;
  delete cd.avenLayerLock;
  delete cd.avenLayerFactor;
  delete cd.avenBaseOpacity;
  return Object.keys(cd).length ? cd : undefined;
}

/** Include text bound to selected containers so components stay intact. */
export function withBoundText(scene: readonly ExcalidrawElement[], selected: ReadonlySet<string>): ExcalidrawElement[] {
  return scene.filter(
    (el) => !el.isDeleted && (selected.has(el.id) || ((el as any).containerId && selected.has((el as any).containerId))),
  );
}

export function filesFor(els: readonly ExcalidrawElement[], files: BinaryFiles): BinaryFiles {
  const out: BinaryFiles = {};
  for (const el of els) if (el.type === "image" && el.fileId && files[el.fileId]) out[el.fileId] = files[el.fileId];
  return out;
}

export function createComponent(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
  name: string,
  category = "General",
): ComponentDef {
  const b = getBounds(elements);
  const normalized = cloneWithNewIds(elements, { dx: -b.minX, dy: -b.minY, mapCustomData: (el) => stripAvenData(el) });
  const now = Date.now();
  return {
    id: randomId(),
    name: name.trim() || "Component",
    category: category.trim() || "General",
    elements: normalized,
    files: filesFor(elements, files),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Place a new linked instance of `def` with its top-left corner at (x, y). */
export function instantiate(def: ComponentDef, x: number, y: number, instanceId = randomId(), linked = true): ExcalidrawElement[] {
  const instanceGroup = randomId();
  return cloneWithNewIds(def.elements, {
    dx: x,
    dy: y,
    extraGroupId: instanceGroup,
    mapCustomData: (el) => {
      const base = stripAvenData(el) ?? {};
      return linked ? { ...base, [KEY]: { componentId: def.id, instanceId, version: def.version } } : Object.keys(base).length ? base : undefined;
    },
  });
}

export function instancesOf(scene: readonly ExcalidrawElement[], componentId: string): Map<string, ExcalidrawElement[]> {
  const m = new Map<string, ExcalidrawElement[]>();
  for (const el of scene) {
    const r = instanceRef(el);
    if (el.isDeleted || !r || r.componentId !== componentId) continue;
    if (!m.has(r.instanceId)) m.set(r.instanceId, []);
    m.get(r.instanceId)!.push(el);
  }
  return m;
}

export function outdatedInstances(scene: readonly ExcalidrawElement[], def: ComponentDef): string[] {
  return [...instancesOf(scene, def.id)].filter(([, els]) => els.some((e) => instanceRef(e)!.version < def.version)).map(([id]) => id);
}

/** Update the master from an edited instance (the "push changes" action). */
export function updateFromInstance(def: ComponentDef, instance: readonly ExcalidrawElement[], files: BinaryFiles): ComponentDef {
  const fresh = createComponent(instance, files, def.name, def.category);
  return { ...def, elements: fresh.elements, files: { ...def.files, ...fresh.files }, version: def.version + 1, updatedAt: Date.now() };
}

/**
 * Replace instances with the current master, keeping each instance where it is.
 * `skip` lets the instance that was just pushed stay untouched (only its version is bumped).
 */
export function syncInstances(scene: readonly ExcalidrawElement[], def: ComponentDef, only?: ReadonlySet<string>, skip?: string): ExcalidrawElement[] {
  const groups = instancesOf(scene, def.id);
  let out = [...scene];
  for (const [instanceId, els] of groups) {
    if (only && !only.has(instanceId)) continue;
    if (instanceId === skip) {
      const ids = new Set(els.map((e) => e.id));
      out = out.map((e) => (ids.has(e.id) ? withCustomData(e, { [KEY]: { ...instanceRef(e)!, version: def.version } }) : e));
      continue;
    }
    const b = getBounds(els);
    const ids = new Set(els.map((e) => e.id));
    const at = out.findIndex((e) => ids.has(e.id));
    const replacement = instantiate(def, b.minX, b.minY, instanceId);
    out = out.filter((e) => !ids.has(e.id));
    out.splice(Math.max(0, Math.min(at, out.length)), 0, ...replacement);
  }
  return out;
}

/** Turn an instance into ordinary elements that no longer follow the master. */
export function detachInstance(scene: readonly ExcalidrawElement[], instanceId: string): ExcalidrawElement[] {
  return scene.map((el) => (instanceRef(el)?.instanceId === instanceId ? withCustomData(el, { [KEY]: undefined }) : el));
}

// ---------------------------------------------------------------- library files

export interface ComponentLibrary {
  type: "aven-library";
  version: 1;
  name: string;
  components: ComponentDef[];
}

export function serializeLibrary(name: string, components: ComponentDef[]): string {
  return JSON.stringify({ type: "aven-library", version: 1, name, components } satisfies ComponentLibrary, null, 1);
}

/** Read an Aven library or an Excalidraw `.excalidrawlib` file into components. */
export function parseLibrary(text: string, fallbackName = "Imported"): ComponentDef[] {
  const raw = JSON.parse(text);
  if (raw?.type === "aven-library" && Array.isArray(raw.components)) {
    return raw.components.filter((c: any) => c && Array.isArray(c.elements));
  }
  if (raw?.type === "excalidrawlib") {
    const items: any[] = raw.libraryItems ?? (raw.library ?? []).map((elements: any[]) => ({ elements }));
    return items
      .filter((it) => Array.isArray(it.elements) && it.elements.length)
      .map((it, i) => ({ ...createComponent(it.elements, {}, it.name || `${fallbackName} ${i + 1}`, fallbackName) }));
  }
  throw new Error("This file is not a component library.");
}

export function mergeComponents(existing: ComponentDef[], incoming: ComponentDef[]): ComponentDef[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) {
    const cur = byId.get(c.id);
    if (!cur || c.version > cur.version) byId.set(c.id, c);
  }
  return [...byId.values()];
}
