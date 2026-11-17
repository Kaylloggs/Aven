// One open drawing: bridges the Excalidraw canvas and Aven's document, autosave, recovery,
// backups, thumbnails, search indexing and the optional layer system.
// Kept outside React so canvas events never trigger needless re-renders.
import { create } from "zustand";
import { CaptureUpdateAction, getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { api, AppError } from "@/platform/api";
import { extractLinkTargets, extractText, serializeDocument } from "@/engine/format";
import { applyLayers, assignNewElements, isSorted, isVisible, layerIdOf, sortByLayer } from "@/engine/layers";
import { renderThumbnail } from "@/engine/export";
import type { AvenDocument, ComponentDef, DrawingLink, LayerState, SavedAppState } from "@/engine/types";
import { backgroundFor, inferStyle, type CanvasStyle } from "@/engine/canvasStyle";
import { chartIdsIn, rebuildChart } from "@/engine/charts";
import { gaugeData, gaugeIdsIn, layoutGauge } from "@/engine/gauge";
import { separateDuplicates } from "@/engine/generated";
import { useSettings } from "@/store/settings";
import { projectFor, useWorkspace } from "@/store/workspace";
import { toast } from "@/store/ui";
import { debounce, errorMessage } from "@/lib/utils";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface EditorUIState {
  session: EditorSession | null;
  title: string;
  path: string;
  saveState: SaveState;
  lastSavedAt: number;
  error: string | null;
  activeTool: string;
  toolLocked: boolean;
  selection: string[];
  layers: LayerState | null;
  components: ComponentDef[];
  links: DrawingLink[];
  meta: AvenDocument["meta"];
  zoom: number;
  panel: "layers" | "components" | "info" | null;
  /** the Layers panel docks bottom-right and can be open together with another panel */
  layersOpen: boolean;
  viewMode: boolean;
  zenMode: boolean;
  gridMode: boolean;
  snapMode: boolean;
  background: string;
  canvasStyle: CanvasStyle;
  /** increments whenever the drawing content changes (cheap signal for panels) */
  sceneTick: number;
  /** scroll and zoom, so floating bars can follow the selected object */
  view: { scrollX: number; scrollY: number; zoom: number; offsetLeft: number; offsetTop: number };
  /** true while shapes are being dragged, resized or rotated (floating bars step aside) */
  busy: boolean;
}

export const useEditor = create<EditorUIState>(() => ({
  session: null,
  title: "",
  path: "",
  saveState: "saved",
  lastSavedAt: 0,
  error: null,
  activeTool: "selection",
  toolLocked: false,
  selection: [],
  layers: null,
  components: [],
  links: [],
  meta: { tags: [], description: "" },
  zoom: 1,
  panel: null,
  layersOpen: false,
  viewMode: false,
  zenMode: false,
  gridMode: false,
  snapMode: false,
  background: "#ffffff",
  canvasStyle: "dots",
  sceneTick: 0,
  view: { scrollX: 0, scrollY: 0, zoom: 1, offsetLeft: 0, offsetTop: 0 },
  busy: false,
}));

const set = useEditor.setState;

function pickAppState(a: AppState): SavedAppState {
  return {
    viewBackgroundColor: a.viewBackgroundColor,
    canvasStyle: useEditor.getState().canvasStyle,
    gridSize: a.gridSize,
    gridStep: a.gridStep,
    gridModeEnabled: a.gridModeEnabled,
    objectsSnapModeEnabled: a.objectsSnapModeEnabled,
    scrollX: a.scrollX,
    scrollY: a.scrollY,
    zoom: a.zoom.value,
    currentItemFontFamily: a.currentItemFontFamily,
    currentItemStrokeColor: a.currentItemStrokeColor,
    currentItemBackgroundColor: a.currentItemBackgroundColor,
    currentItemRoughness: a.currentItemRoughness,
    currentItemStrokeWidth: a.currentItemStrokeWidth,
  };
}

export function layersActive(): boolean {
  const s = useSettings.getState().settings.advanced;
  return s.enabled && s.layers;
}

export function componentsActive(): boolean {
  const s = useSettings.getState().settings.advanced;
  return s.enabled && s.components;
}

export class EditorSession {
  api: ExcalidrawImperativeAPI | null = null;
  doc: AvenDocument;
  path: string;
  modified: number;
  private contentKey = "";
  private saving: Promise<void> | null = null;
  private again = false;
  private disposed = false;
  private applyingLayers = false;
  private onPath: (p: string) => void;

  constructor(doc: AvenDocument, path: string, modified: number, onPath: (p: string) => void) {
    this.doc = doc;
    this.path = path;
    this.modified = modified;
    this.onPath = onPath;
    set({
      session: this,
      title: doc.title,
      path,
      saveState: "saved",
      lastSavedAt: modified,
      error: null,
      layers: doc.layers,
      components: doc.components,
      links: doc.links,
      meta: doc.meta,
      selection: [],
      background: doc.scene.appState.viewBackgroundColor,
      canvasStyle: inferStyle(doc.scene.appState),
      gridMode: doc.scene.appState.gridModeEnabled,
      snapMode: doc.scene.appState.objectsSnapModeEnabled,
    });
  }

  private primed = false;
  private repairedOnLoad = false;

  attach(a: ExcalidrawImperativeAPI) {
    this.api = a;
  }

  private keyFor(els: readonly ExcalidrawElement[], a: AppState, files: BinaryFiles) {
    return `${getSceneVersion(els)}|${Object.keys(files).length}|${a.viewBackgroundColor}|${a.gridModeEnabled}|${a.gridSize}|${a.gridStep}|${a.objectsSnapModeEnabled}`;
  }

  // ------------------------------------------------------------------ canvas events

  onChange = (els: readonly ExcalidrawElement[], a: AppState, files: BinaryFiles) => {
    if (this.disposed || !this.api) return;
    const st = useEditor.getState();
    const tool = a.activeTool.type;
    if (tool !== st.activeTool || a.activeTool.locked !== st.toolLocked) set({ activeTool: tool, toolLocked: a.activeTool.locked });
    const sel = Object.keys(a.selectedElementIds).filter((k) => a.selectedElementIds[k]);
    if (sel.length !== st.selection.length || sel.some((id, i) => st.selection[i] !== id)) set({ selection: sel });
    if (a.zoom.value !== st.zoom) set({ zoom: a.zoom.value });
    const v = st.view;
    if (v.scrollX !== a.scrollX || v.scrollY !== a.scrollY || v.zoom !== a.zoom.value || v.offsetLeft !== a.offsetLeft || v.offsetTop !== a.offsetTop)
      set({ view: { scrollX: a.scrollX, scrollY: a.scrollY, zoom: a.zoom.value, offsetLeft: a.offsetLeft, offsetTop: a.offsetTop } });
    const busy = !!(a.selectedElementsAreBeingDragged || a.isResizing || a.isRotating || a.editingTextElement);
    if (busy !== st.busy) set({ busy });
    if (a.viewModeEnabled !== st.viewMode || a.zenModeEnabled !== st.zenMode || a.gridModeEnabled !== st.gridMode || a.objectsSnapModeEnabled !== st.snapMode || a.viewBackgroundColor !== st.background)
      set({ viewMode: a.viewModeEnabled, zenMode: a.zenModeEnabled, gridMode: a.gridModeEnabled, snapMode: a.objectsSnapModeEnabled, background: a.viewBackgroundColor });

    if (a.isResizing) this.resizing = true;
    else if (this.resizing) {
      this.resizing = false;
      this.relayoutGenerated(sel);
    }
    if (a.isRotating) this.rotating = true;
    else if (this.rotating) {
      this.rotating = false;
      this.snapRotation(sel);
    }

    const idle = a.cursorButton === "up" && !a.newElement && !a.multiElement && !a.editingTextElement && !a.isResizing && !a.isRotating && !a.selectedElementsAreBeingDragged;
    if (idle && !this.applyingLayers && this.doc.layers && layersActive()) this.reconcileLayers(els);

    const key = this.keyFor(els, a, files);
    // A duplicated gauge or chart must not share its data with the original.
    if (idle && key !== this.contentKey) {
      const separated = separateDuplicates(els);
      if (separated) {
        this.api.updateScene({ elements: separated, captureUpdate: CaptureUpdateAction.NEVER });
        if (!this.primed) {
          // repaired while loading: the next change primes the session, then saves the repair
          this.repairedOnLoad = true;
          return;
        }
      }
    }
    if (!this.primed) {
      // the first change is the engine loading the document, not an edit
      if (!els.length && this.doc.scene.elements.length) return;
      this.primed = true;
      this.contentKey = key;
      if (this.repairedOnLoad) {
        this.repairedOnLoad = false;
        this.markDirty();
      }
      // refresh thumbnail + search index for files created or imported elsewhere
      this.afterSave(this.buildDocument());
      return;
    }
    if (key === this.contentKey) return;
    this.contentKey = key;
    set({ sceneTick: useEditor.getState().sceneTick + 1 });
    this.markDirty();
  };

  private rotating = false;
  private resizing = false;

  /** Charts and gauges are rebuilt from their data after a resize so text stays crisp. */
  private relayoutGenerated(selectedIds: string[]) {
    const api = this.api;
    if (!api || !selectedIds.length) return;
    let scene = api.getSceneElements() as ExcalidrawElement[];
    const charts = chartIdsIn(scene, selectedIds);
    const gauges = gaugeIdsIn(scene, selectedIds);
    if (!charts.length && !gauges.length) return;
    for (const id of charts) scene = rebuildChart(scene, id);
    for (const gid of gauges) {
      const members = scene.filter((e) => gaugeData(e)?.gaugeId === gid);
      const value = members.map(gaugeData).find((g) => g?.role === "track")?.value ?? 0;
      const next = new Map(layoutGauge(members, value).map((e) => [e.id, e]));
      scene = scene.map((e) => next.get(e.id) ?? e);
    }
    api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
  }

  /**
   * After a rotation ends close to upright (0/90/180/270 degrees, within 4 degrees), make it
   * exactly upright so shapes can always be straightened by hand. Shift still gives 15° steps.
   */
  private snapRotation(selectedIds: string[]) {
    const api = this.api;
    if (!api || !selectedIds.length) return;
    const scene = api.getSceneElements();
    const sel = new Set(selectedIds);
    const primary = scene.filter((e) => sel.has(e.id));
    const targets = scene.filter((e) => sel.has(e.id) || ((e as any).containerId && sel.has((e as any).containerId)));
    if (!primary.length) return;
    const TAU = Math.PI * 2;
    const norm = (x: number) => ((x % TAU) + TAU) % TAU;
    const a0 = norm(primary[0].angle);
    const diff = (x: number) => Math.min(norm(x - a0), TAU - norm(x - a0));
    if (targets.some((e) => diff(e.angle) > 0.002)) return; // elements at different angles: leave them
    const QUARTER = Math.PI / 2;
    const target = Math.round(a0 / QUARTER) * QUARTER;
    const delta = target - a0;
    if (Math.abs(delta) < 1e-6 || Math.abs(delta) > (4 * Math.PI) / 180) return;
    // rotate positions around the centre of the selected elements so a group stays together
    const centers = primary.map((e) => [e.x + e.width / 2, e.y + e.height / 2]);
    const cx = (Math.min(...centers.map((c) => c[0])) + Math.max(...centers.map((c) => c[0]))) / 2;
    const cy = (Math.min(...centers.map((c) => c[1])) + Math.max(...centers.map((c) => c[1]))) / 2;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const ids = new Set(targets.map((t) => t.id));
    api.updateScene({
      elements: scene.map((e) => {
        if (!ids.has(e.id)) return e;
        const ex = e.x + e.width / 2 - cx;
        const ey = e.y + e.height / 2 - cy;
        const nx = cx + ex * cos - ey * sin;
        const ny = cy + ex * sin + ey * cos;
        return { ...e, x: nx - e.width / 2, y: ny - e.height / 2, angle: norm(target) as any, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) };
      }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private reconcileLayers(els: readonly ExcalidrawElement[]) {
    const ls = this.doc.layers!;
    const live = els.filter((e) => !e.isDeleted);
    const assigned = assignNewElements(live, ls);
    const strays = assigned.elements.some((e) => !isVisible(ls, layerIdOf(e, ls)));
    if (!assigned.changed && !strays && isSorted(assigned.elements, ls)) return;
    this.applyingLayers = true;
    try {
      const r = strays ? applyLayers(assigned.elements, ls) : { scene: sortByLayer(assigned.elements, ls), state: ls };
      this.doc = { ...this.doc, layers: r.state };
      this.api!.updateScene({ elements: r.scene, captureUpdate: CaptureUpdateAction.NEVER });
      set({ layers: r.state });
    } finally {
      this.applyingLayers = false;
    }
  }

  /** Apply a new layer state (visibility, locks, opacity, order) to the canvas. */
  setLayers(state: LayerState, sceneOverride?: readonly ExcalidrawElement[]) {
    if (!this.api) return;
    const scene = sceneOverride ?? this.api.getSceneElements();
    const r = applyLayers(scene, state);
    this.applyingLayers = true;
    try {
      this.doc = { ...this.doc, layers: r.state };
      this.api.updateScene({ elements: r.scene, captureUpdate: CaptureUpdateAction.NEVER });
    } finally {
      this.applyingLayers = false;
    }
    set({ layers: r.state });
    this.markDirty();
  }

  /** Switch between the dotted, off-white and dark canvas. */
  setCanvasStyle(style: CanvasStyle) {
    set({ canvasStyle: style });
    this.api?.updateScene({ appState: { viewBackgroundColor: backgroundFor(style) } as any, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    this.markDirty();
  }

  setComponents(components: ComponentDef[]) {
    this.doc = { ...this.doc, components };
    set({ components });
    this.markDirty();
  }

  setLinks(links: DrawingLink[]) {
    this.doc = { ...this.doc, links };
    set({ links });
    this.markDirty();
  }

  setMeta(meta: AvenDocument["meta"]) {
    this.doc = { ...this.doc, meta };
    set({ meta });
    this.markDirty();
  }

  markDirty() {
    if (this.disposed) return;
    if (useEditor.getState().saveState !== "conflict") set({ saveState: "dirty" });
    const ws = useSettings.getState().settings.workspace;
    if (ws.autosave) this.autosave();
    this.recovery();
  }

  private autosave = debounce(() => void this.save("auto"), Math.max(400, useSettings.getState().settings.workspace.autosaveDelaySec * 1000));

  private recovery = debounce(() => {
    if (this.disposed || useEditor.getState().saveState === "saved") return;
    const doc = this.buildDocument();
    api.recoveryWrite({ drawingId: doc.id, path: this.path, title: doc.title, savedAt: Date.now(), content: serializeDocument(doc) }).catch(() => {});
  }, 1200);

  // ------------------------------------------------------------------ document

  buildDocument(): AvenDocument {
    if (!this.api) return this.doc;
    const a = this.api.getAppState();
    const elements = this.api.getSceneElements() as ExcalidrawElement[];
    return {
      ...this.doc,
      title: useEditor.getState().title,
      updatedAt: Date.now(),
      scene: { elements, appState: pickAppState(a), files: this.api.getFiles() },
    };
  }

  async save(reason: "auto" | "manual" | "close" | "force" = "manual"): Promise<boolean> {
    if (!this.api) return true;
    if (this.saving) {
      this.again = true;
      await this.saving;
      return useEditor.getState().saveState === "saved";
    }
    const st = useEditor.getState();
    if (st.saveState === "conflict" && reason !== "force") return false;
    if (st.saveState === "saved" && reason !== "force" && reason !== "manual") return true;
    const doc = this.buildDocument();
    const settings = useSettings.getState().settings.workspace;
    const wsId = useWorkspace.getState().active?.id;
    set({ saveState: "saving" });
    let ok = false;
    this.saving = (async () => {
      try {
        const r = await api.drawingWrite({
          wsId,
          path: this.path,
          content: serializeDocument(doc),
          drawingId: doc.id,
          policy: { enabled: settings.backups.enabled, minIntervalSec: settings.backups.minIntervalMin * 60, keep: settings.backups.keep },
          expectedModified: reason === "force" ? undefined : this.modified,
        });
        this.modified = r.modified;
        this.doc = doc;
        ok = true;
        set({ saveState: useEditor.getState().saveState === "saving" ? "saved" : useEditor.getState().saveState, lastSavedAt: Date.now(), error: null });
        api.recoveryClear(doc.id).catch(() => {});
        this.afterSave(doc);
      } catch (e) {
        if (e instanceof AppError && e.kind === "conflict") {
          set({ saveState: "conflict", error: e.message });
        } else {
          set({ saveState: "error", error: errorMessage(e) });
          if (reason !== "auto") toast({ kind: "error", title: "Save failed", message: errorMessage(e) });
        }
      }
    })();
    await this.saving;
    this.saving = null;
    if (this.again) {
      this.again = false;
      if (useEditor.getState().saveState === "dirty") return this.save(reason);
    }
    return ok;
  }

  private afterSave = debounce((doc: AvenDocument) => {
    if (this.disposed) return;
    const ws = useWorkspace.getState();
    const wsId = ws.active?.id;
    if (!wsId) return;
    const project = projectFor(ws.tree, this.path);
    api
      .searchIndex({ path: this.path, drawingId: doc.id, workspaceId: wsId, kind: "drawing", title: doc.title, project: project?.meta.name ?? "", body: extractText(doc) })
      .catch(() => {});
    api.linksSet(doc.id, this.path, doc.title, extractLinkTargets(doc)).catch(() => {});
    renderThumbnail(doc)
      .then(async (thumb) => {
        if (thumb) await api.thumbWrite(wsId, doc.id, thumb);
        useWorkspace.getState().setThumb(doc.id, thumb);
      })
      .catch(() => {});
  }, 2500);

  async resolveConflict(choice: "overwrite" | "copy") {
    if (choice === "overwrite") {
      set({ saveState: "dirty" });
      await this.save("force");
      return;
    }
    const doc = { ...this.buildDocument(), id: crypto.randomUUID(), title: `${useEditor.getState().title} (my version)` };
    const dir = this.path.slice(0, this.path.lastIndexOf("\\"));
    const p = await api.drawingCreate(dir, doc.title, serializeDocument(doc));
    toast({ kind: "success", title: "Your version was saved as a copy", message: p });
    await useWorkspace.getState().refresh();
  }

  async rename(title: string) {
    const clean = title.trim();
    if (!clean || clean === this.doc.title) return;
    set({ title: clean });
    try {
      const newPath = await api.itemRename(this.path, clean);
      this.path = newPath;
      set({ path: newPath });
      this.onPath(newPath);
      // the file was renamed by us; refresh mtime expectations on next save
      this.modified = 0;
      await this.save("force");
      await useWorkspace.getState().refresh();
    } catch (e) {
      toast({ kind: "error", title: "Could not rename", message: errorMessage(e) });
    }
  }

  async flush() {
    this.autosave.cancel();
    const st = useEditor.getState().saveState;
    if (st === "dirty" || st === "error") await this.save("close");
    else if (this.saving) await this.saving;
  }

  private mounts = 0;

  /** Called when the editor mounts; safe across React's dev double-mount and hot reloads. */
  activate() {
    this.mounts++;
    this.disposed = false;
    if (useEditor.getState().session !== this) set({ session: this });
  }

  /** Called when the editor unmounts: saves pending work, then releases the session. */
  async deactivate() {
    this.mounts--;
    await this.flush();
    if (this.mounts <= 0) this.dispose();
  }

  dispose() {
    this.disposed = true;
    this.autosave.cancel();
    this.recovery.cancel();
    this.afterSave.cancel();
    if (useEditor.getState().session === this) set({ session: null });
  }
}

/** React hook: which optional subsystems are switched on. */
export function useAdvanced() {
  const adv = useSettings((s) => s.settings.advanced);
  return { layers: adv.enabled && adv.layers, components: adv.enabled && adv.components };
}
