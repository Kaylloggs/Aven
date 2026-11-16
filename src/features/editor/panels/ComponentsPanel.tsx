import { useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, Download, MoreHorizontal, Plus, Puzzle, Search, Unlink, Upload, UploadCloud } from "lucide-react";
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import {
  createComponent,
  detachInstance,
  instanceRef,
  instancesOf,
  instantiate,
  mergeComponents,
  outdatedInstances,
  parseLibrary,
  serializeLibrary,
  syncInstances,
  updateFromInstance,
  withBoundText,
} from "@/engine/components";
import type { ComponentDef } from "@/engine/types";
import { Button, EmptyState, IconButton, Input } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { api, pickFile, pickSavePath } from "@/platform/api";
import { askConfirm, askText, toast } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { errorMessage } from "@/lib/utils";
import { safeFileName } from "@/lib/path";
import { useEditor } from "../session";
import { componentPreview, useComponentLibrary } from "../componentLibrary";

function Preview({ def }: { def: ComponentDef }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    componentPreview(def).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [def]);
  return (
    <div className="grid aspect-[4/3] place-items-center rounded-md border border-border bg-[#fff] p-2">
      {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} /> : <Puzzle className="size-5 text-[#999]" />}
    </div>
  );
}

export function ComponentsPanel() {
  const { items, load, save } = useComponentLibrary();
  const docComponents = useEditor((s) => s.components);
  const selection = useEditor((s) => s.selection);
  const [query, setQuery] = useState("");
  const updatesPref = useSettings((s) => s.settings.advanced.instanceUpdates);
  useEffect(() => void load(), [load]);

  const s = () => useEditor.getState().session!;
  const all = useMemo(() => mergeComponents(docComponents, items), [docComponents, items]);
  const filtered = all.filter((c) => `${c.name} ${c.category}`.toLowerCase().includes(query.toLowerCase()));
  const byCategory = filtered.reduce<Record<string, ComponentDef[]>>((m, c) => ((m[c.category] ??= []).push(c), m), {});

  // the instance the user has selected, if any
  const selectedInstance = useMemo(() => {
    const a = useEditor.getState().session?.api;
    if (!a || !selection.length) return null;
    const els = a.getSceneElements().filter((e) => selection.includes(e.id));
    const refs = new Set(els.map((e) => instanceRef(e)?.instanceId).filter(Boolean));
    if (refs.size !== 1) return null;
    const el = els.find((e) => instanceRef(e));
    const ref = el ? instanceRef(el)! : null;
    const def = ref ? all.find((c) => c.id === ref.componentId) : undefined;
    return ref && def ? { ref, def } : null;
  }, [selection, all]);

  const storeDef = async (def: ComponentDef) => {
    const docNext = mergeComponents(docComponents.filter((c) => c.id !== def.id), [def]);
    s().setComponents([...docNext.filter((c) => c.id !== def.id), def]);
    await save([...items.filter((c) => c.id !== def.id), def]);
  };

  const createFromSelection = async () => {
    const a = s().api!;
    const sel = withBoundText(a.getSceneElements(), new Set(selection));
    if (!sel.length) return;
    const name = await askText({ title: "New component", label: "Name", placeholder: "e.g. Button, Sticky note, Server", confirmLabel: "Continue" });
    if (!name) return;
    const category = (await askText({ title: "Category", label: "Category", initial: "General", confirmLabel: "Create component" })) ?? "General";
    const def = createComponent(sel, a.getFiles(), name, category);
    await storeDef(def);
    // the selection becomes the first linked instance of the new component
    const ids = new Set(sel.map((e) => e.id));
    const placed = instantiate(def, Math.min(...sel.map((e) => e.x)), Math.min(...sel.map((e) => e.y)));
    const scene = a.getSceneElements().filter((e) => !ids.has(e.id));
    a.updateScene({ elements: [...scene, ...placed], appState: { selectedElementIds: Object.fromEntries(placed.map((p) => [p.id, true])) } as any, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    toast({ kind: "success", title: `Component “${def.name}” created`, message: "It is saved in this workspace's library and can be reused in any drawing." });
  };

  const insert = (def: ComponentDef) => {
    const a = s().api!;
    const st = a.getAppState();
    const center = viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
    const w = Math.max(...def.elements.map((e) => e.x + e.width), 0);
    const h = Math.max(...def.elements.map((e) => e.y + e.height), 0);
    const placed = instantiate(def, center.x - w / 2, center.y - h / 2);
    if (Object.keys(def.files).length) a.addFiles(Object.values(def.files));
    a.updateScene({
      elements: [...a.getSceneElements(), ...placed],
      appState: { selectedElementIds: Object.fromEntries(placed.map((p) => [p.id, true])) } as any,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    if (!docComponents.some((c) => c.id === def.id)) s().setComponents([...docComponents, def]);
  };

  const pushChanges = async () => {
    if (!selectedInstance) return;
    const a = s().api!;
    const scene = a.getSceneElements();
    const instEls = instancesOf(scene, selectedInstance.def.id).get(selectedInstance.ref.instanceId) ?? [];
    const next = updateFromInstance(selectedInstance.def, instEls, a.getFiles());
    await storeDef(next);
    const others = instancesOf(scene, next.id).size - 1;
    let update = updatesPref === "always";
    if (others > 0 && updatesPref === "ask")
      update = await askConfirm({ title: `Update ${others} other instance${others > 1 ? "s" : ""}?`, message: `“${next.name}” changed. Instances you do not update keep their current look and can be updated later.`, confirmLabel: "Update instances" });
    const synced = syncInstances(scene, next, update ? undefined : new Set([selectedInstance.ref.instanceId]), selectedInstance.ref.instanceId);
    a.updateScene({ elements: synced, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    toast({ kind: "success", title: `“${next.name}” updated to version ${next.version}` });
  };

  const updateAll = (def: ComponentDef) => {
    const a = s().api!;
    a.updateScene({ elements: syncInstances(a.getSceneElements(), def, new Set(outdatedInstances(a.getSceneElements(), def))), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const exportLib = async (list: ComponentDef[], name: string) => {
    const p = await pickSavePath("Export components", `${safeFileName(name)}.avenlib`, [{ name: "Aven library", extensions: ["avenlib"] }]);
    if (!p) return;
    await api.fileWriteText(p, serializeLibrary(name, list));
    toast({ kind: "success", title: "Library exported", message: p });
  };

  const importLib = async () => {
    const [f] = await pickFile("Import components", [{ name: "Component library", extensions: ["avenlib", "excalidrawlib", "json"] }]);
    if (!f) return;
    try {
      const incoming = parseLibrary(await api.fileReadText(f), "Imported");
      await save(mergeComponents(items, incoming));
      toast({ kind: "success", title: `${incoming.length} component${incoming.length === 1 ? "" : "s"} imported` });
    } catch (e) {
      toast({ kind: "error", title: "Import failed", message: errorMessage(e) });
    }
  };

  const itemMenu = (el: HTMLElement, def: ComponentDef) =>
    openMenuAt(el, [
      { label: "Insert", onSelect: () => insert(def) },
      {
        label: "Rename…",
        onSelect: async () => {
          const n = await askText({ title: "Rename component", initial: def.name });
          if (n) await storeDef({ ...def, name: n, updatedAt: Date.now() });
        },
      },
      {
        label: "Change category…",
        onSelect: async () => {
          const c = await askText({ title: "Category", initial: def.category });
          if (c) await storeDef({ ...def, category: c, updatedAt: Date.now() });
        },
      },
      { label: "Duplicate", onSelect: () => storeDef({ ...def, id: crypto.randomUUID().slice(0, 20), name: `${def.name} copy`, version: 1, createdAt: Date.now(), updatedAt: Date.now() }) },
      { label: "Export…", onSelect: () => exportLib([def], def.name) },
      "separator",
      {
        label: "Remove from library",
        danger: true,
        onSelect: async () => {
          if (!(await askConfirm({ title: `Remove “${def.name}”?`, message: "Existing instances stay on the canvas as they are.", confirmLabel: "Remove", danger: true }))) return;
          await save(items.filter((c) => c.id !== def.id));
          s().setComponents(docComponents.filter((c) => c.id !== def.id));
        },
      },
    ]);

  const outdated = useMemo(() => {
    const a = useEditor.getState().session?.api;
    if (!a) return [] as { def: ComponentDef; count: number }[];
    const scene = a.getSceneElements();
    return all.map((def) => ({ def, count: outdatedInstances(scene, def).length })).filter((x) => x.count > 0);
  }, [all, selection]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-2">
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} disabled={!selection.length} onClick={createFromSelection} className="flex-1">
          From selection
        </Button>
        <IconButton label="Import library" size="md" onClick={importLib}>
          <Upload className="size-4" />
        </IconButton>
        <IconButton label="Export library" size="md" disabled={!items.length} onClick={() => exportLib(items, "My components")}>
          <Download className="size-4" />
        </IconButton>
      </div>

      {selectedInstance && (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">Selected instance</p>
          <p className="text-sm font-[600]">
            {selectedInstance.def.name} <span className="text-faint font-normal">v{selectedInstance.ref.version}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" icon={<UploadCloud className="size-3.5" />} onClick={pushChanges}>
              Push changes to component
            </Button>
            {selectedInstance.ref.version < selectedInstance.def.version && (
              <Button size="sm" icon={<ArrowUpCircle className="size-3.5" />} onClick={() => {
                const a = s().api!;
                a.updateScene({ elements: syncInstances(a.getSceneElements(), selectedInstance.def, new Set([selectedInstance.ref.instanceId])), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
              }}>
                Update to v{selectedInstance.def.version}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Unlink className="size-3.5" />} onClick={() => {
              const a = s().api!;
              a.updateScene({ elements: detachInstance(a.getSceneElements(), selectedInstance.ref.instanceId), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
              toast({ kind: "info", title: "Instance detached", message: "It no longer follows the component." });
            }}>
              Detach
            </Button>
          </div>
        </div>
      )}

      {outdated.map(({ def, count }) => (
        <div key={def.id} className="flex items-center gap-2 rounded-lg border border-border bg-accent-soft px-3 py-2 text-xs">
          <span className="flex-1">
            {count} instance{count > 1 ? "s" : ""} of “{def.name}” can be updated to v{def.version}.
          </span>
          <Button size="sm" variant="secondary" onClick={() => updateAll(def)}>
            Update
          </Button>
        </div>
      ))}

      <Input icon={<Search className="size-3.5" />} placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" />

      {all.length === 0 ? (
        <EmptyState icon={<Puzzle className="size-5" />} title="No components yet" body="Select shapes on the canvas and choose From selection. Components are shared by every drawing in this workspace." />
      ) : (
        Object.entries(byCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cat, list]) => (
            <section key={cat}>
              <h3 className="mb-1.5 text-2xs font-[600] text-faint">{cat}</h3>
              <div className="grid grid-cols-2 gap-2">
                {list.map((def) => (
                  <div key={def.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => insert(def)}
                      className="w-full rounded-lg p-1 text-left hover:bg-hover cursor-pointer"
                      data-tip="Click to insert"
                    >
                      <Preview def={def} />
                      <p className="mt-1 truncate px-0.5 text-xs text-text">{def.name}</p>
                    </button>
                    <IconButton label="Component options" size="sm" className="absolute right-1.5 top-1.5 bg-raised opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={(e) => itemMenu(e.currentTarget, def)}>
                      <MoreHorizontal className="size-3.5" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
