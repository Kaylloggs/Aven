// Gauges and charts are groups of ordinary elements that share an id in customData. Duplicating,
// copy-pasting or Alt-dragging one copies that id too, so the copy and the original would be
// edited (and laid out) as a single object. This gives every copy its own id and lays both out
// again, which also repairs drawings saved while the two were mixed up.
import { customData, randomId } from "./elements";
import { gaugeData, layoutGauge } from "./gauge";
import { rebuildChart } from "./charts";
import type { ExcalidrawElement } from "./types";

const KINDS = [
  { key: "avenGauge", field: "gaugeId" },
  { key: "avenChart", field: "chartId" },
] as const;

type Key = (typeof KINDS)[number]["key"];

/** The copies of one object are told apart by their own group (each copy gets a new group id). */
const clusterOf = (e: ExcalidrawElement) => e.groupIds[0] ?? "";

/** Returns the repaired scene, or null when no gauge or chart shares its id with another one. */
export function separateDuplicates(scene: readonly ExcalidrawElement[]): ExcalidrawElement[] | null {
  const renames = new Map<string, Partial<Record<Key, string>>>();
  const touched: Record<Key, Set<string>> = { avenGauge: new Set(), avenChart: new Set() };

  for (const { key, field } of KINDS) {
    const byId = new Map<string, Map<string, string[]>>();
    for (const e of scene) {
      if (e.isDeleted) continue;
      const id = customData(e)[key]?.[field];
      if (typeof id !== "string") continue;
      let clusters = byId.get(id);
      if (!clusters) byId.set(id, (clusters = new Map()));
      const c = clusterOf(e);
      clusters.set(c, [...(clusters.get(c) ?? []), e.id]);
    }
    for (const [id, clusters] of byId) {
      if (clusters.size < 2) continue;
      touched[key].add(id);
      // the first copy in stacking order keeps the id (duplicates are inserted above originals)
      for (const members of [...clusters.values()].slice(1)) {
        const fresh = randomId();
        touched[key].add(fresh);
        for (const m of members) renames.set(m, { ...renames.get(m), [key]: fresh });
      }
    }
  }
  if (!renames.size) return null;

  let out = scene.map((e) => {
    const r = renames.get(e.id);
    if (!r) return e;
    const cd = { ...customData(e) };
    for (const { key, field } of KINDS) if (r[key]) cd[key] = { ...cd[key], [field]: r[key] };
    return { ...e, customData: cd, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } as ExcalidrawElement;
  });

  for (const gid of touched.avenGauge) {
    const members = out.filter((e) => !e.isDeleted && gaugeData(e)?.gaugeId === gid);
    const value = members.map(gaugeData).find((g) => g?.role === "track")?.value ?? 0;
    const next = new Map(layoutGauge(members, value).map((e) => [e.id, e]));
    out = out.map((e) => next.get(e.id) ?? e);
  }
  for (const cid of touched.avenChart) out = rebuildChart(out, cid);
  return out;
}
