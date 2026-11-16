import { create } from "zustand";
import { api } from "@/platform/api";
import type {
  DrawingEntry,
  FolderNode,
  ProjectMeta,
  ProjectNode,
  RecentEntry,
  Registry,
  WorkspaceInfo,
  WorkspaceState,
  WorkspaceTree,
} from "@/platform/types";
import { createDocument, serializeDocument } from "@/engine/format";
import { backgroundFor } from "@/engine/canvasStyle";
import { createBoard as createBoardDoc, serializeBoard, type BoardPreset } from "@/engine/board";
import type { AvenDocument } from "@/engine/types";
import { basename, dirname, isInside, join } from "@/lib/path";
import { errorMessage } from "@/lib/utils";
import { toast } from "./ui";
import { useSettings } from "./settings";

export interface DrawingRef extends DrawingEntry {
  project: ProjectNode | null;
  folderPath: string;
}

interface WorkspaceStore {
  registry: Registry;
  active: WorkspaceInfo | null;
  tree: WorkspaceTree | null;
  loading: boolean;
  error: string | null;
  recents: RecentEntry[];
  thumbs: Record<string, string | null | undefined>;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  switchTo: (id: string) => Promise<void>;
  createWorkspace: (name: string, parent: string) => Promise<WorkspaceInfo>;
  openFolder: (path: string) => Promise<WorkspaceInfo>;
  forget: (id: string) => Promise<void>;
  saveState: (patch: Partial<WorkspaceState>) => Promise<void>;
  createProject: (name: string, meta?: Partial<ProjectMeta>) => Promise<string>;
  updateProject: (path: string, patch: Partial<ProjectMeta>) => Promise<void>;
  createFolder: (parent: string, name: string) => Promise<string>;
  createDrawing: (dir: string, title: string, doc?: AvenDocument) => Promise<string>;
  createBoard: (dir: string, title: string, preset?: BoardPreset) => Promise<string>;
  rename: (path: string, name: string) => Promise<string>;
  move: (path: string, destDir: string) => Promise<string>;
  duplicate: (path: string) => Promise<string>;
  trash: (path: string, label: string) => Promise<void>;
  setArchived: (path: string, archived: boolean) => Promise<string>;
  toggleFavoriteDrawing: (id: string) => Promise<void>;
  addRecent: (d: { path: string; id: string; title: string }) => Promise<void>;
  loadThumb: (id: string) => Promise<void>;
  setThumb: (id: string, dataUrl: string | null) => void;
}

export function flattenFolder(f: FolderNode, project: ProjectNode | null, out: DrawingRef[] = []): DrawingRef[] {
  for (const d of f.drawings) out.push({ ...d, project, folderPath: f.path });
  for (const sub of f.folders) flattenFolder(sub, project, out);
  return out;
}

export function allDrawings(tree: WorkspaceTree | null, includeArchived = false): DrawingRef[] {
  if (!tree) return [];
  const out: DrawingRef[] = [];
  for (const p of tree.projects) flattenFolder(p.root, p, out);
  if (includeArchived) for (const p of tree.archives) flattenFolder(p.root, p, out);
  flattenFolder(tree.inbox, null, out);
  return out;
}

export function flattenBoards(f: FolderNode, project: ProjectNode | null, out: DrawingRef[] = []): DrawingRef[] {
  for (const d of f.boards ?? []) out.push({ ...d, project, folderPath: f.path });
  for (const sub of f.folders) flattenBoards(sub, project, out);
  return out;
}

export function allBoards(tree: WorkspaceTree | null): DrawingRef[] {
  if (!tree) return [];
  const out: DrawingRef[] = [];
  for (const p of tree.projects) flattenBoards(p.root, p, out);
  flattenBoards(tree.inbox, null, out);
  return out;
}

export function findFolder(root: FolderNode, path: string): FolderNode | null {
  if (root.path.toLowerCase() === path.toLowerCase()) return root;
  for (const f of root.folders) {
    const r = findFolder(f, path);
    if (r) return r;
  }
  return null;
}

export function projectFor(tree: WorkspaceTree | null, path: string): ProjectNode | null {
  if (!tree) return null;
  return [...tree.projects, ...tree.archives].find((p) => isInside(path, p.path)) ?? null;
}

export function countDrawings(f: FolderNode): number {
  return f.drawings.length + f.folders.reduce((n, s) => n + countDrawings(s), 0);
}

export function newDrawingDocument(title: string): AvenDocument {
  const s = useSettings.getState().settings;
  const doc = createDocument(title);
  doc.scene.appState = {
    ...doc.scene.appState,
    viewBackgroundColor: backgroundFor(s.appearance.canvasStyle),
    canvasStyle: s.appearance.canvasStyle,
    gridSize: s.appearance.gridSize,
    gridStep: s.appearance.gridStep,
    gridModeEnabled: s.appearance.showGrid,
    objectsSnapModeEnabled: s.editor.objectSnapping,
  };
  return doc;
}

async function guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    toast({ kind: "error", title: `Could not ${what}`, message: errorMessage(e) });
    throw e;
  }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  registry: { workspaces: [], active: null },
  active: null,
  tree: null,
  loading: true,
  error: null,
  recents: [],
  thumbs: {},

  init: async () => {
    const registry = await api.wsList();
    const active = registry.workspaces.find((w) => w.id === registry.active) ?? registry.workspaces.find((w) => w.available) ?? null;
    set({ registry, active, loading: !!active });
    if (active) await get().refresh();
    else set({ loading: false });
  },

  refresh: async () => {
    const active = get().active;
    if (!active) return;
    try {
      const [tree, recents, registry] = await Promise.all([api.wsScan(active.id), api.recentsList(active.id, 40), api.wsList()]);
      set({ tree, recents, registry, error: null, loading: false, active: registry.workspaces.find((w) => w.id === active.id) ?? active });
    } catch (e) {
      set({ error: errorMessage(e), loading: false, tree: null });
    }
  },

  switchTo: async (id) => {
    const w = get().registry.workspaces.find((x) => x.id === id);
    if (!w) return;
    await api.wsSetActive(id);
    set({ active: w, tree: null, thumbs: {}, loading: true });
    await get().refresh();
  },

  createWorkspace: (name, parent) =>
    guard("create the workspace", async () => {
      const info = await api.wsCreate(name, parent);
      set({ active: info, thumbs: {}, tree: null });
      await get().refresh();
      return info;
    }),

  openFolder: (path) =>
    guard("open the folder", async () => {
      const info = await api.wsOpenFolder(path);
      set({ active: info, thumbs: {}, tree: null });
      await get().refresh();
      return info;
    }),

  forget: async (id) => {
    await api.wsForget(id);
    const registry = await api.wsList();
    const active = get().active?.id === id ? (registry.workspaces[0] ?? null) : get().active;
    set({ registry, active, tree: active ? get().tree : null });
    if (active) await get().switchTo(active.id);
  },

  saveState: async (patch) => {
    const { active, tree } = get();
    if (!active || !tree) return;
    const state = { ...tree.state, ...patch };
    set({ tree: { ...tree, state } });
    await api.wsSaveState(active.id, state);
  },

  createProject: (name, meta) =>
    guard("create the project", async () => {
      const [path] = await api.projectCreate(get().active!.id, name, meta);
      await get().refresh();
      return path;
    }),

  updateProject: (path, patch) =>
    guard("update the project", async () => {
      const p = [...(get().tree?.projects ?? []), ...(get().tree?.archives ?? [])].find((x) => x.path === path);
      if (!p) return;
      const meta = { ...p.meta, ...patch, updatedAt: Date.now() };
      await api.projectSaveMeta(path, meta);
      await get().refresh();
    }),

  createFolder: (parent, name) =>
    guard("create the folder", async () => {
      const p = await api.folderCreate(parent, name);
      await get().refresh();
      return p;
    }),

  createDrawing: (dir, title, doc) =>
    guard("create the drawing", async () => {
      const d = doc ?? newDrawingDocument(title);
      d.title = title;
      const path = await api.drawingCreate(dir, title, serializeDocument(d));
      await get().refresh();
      return path;
    }),

  createBoard: (dir, title, preset = "kanban") =>
    guard("create the board", async () => {
      const b = createBoardDoc(title, preset);
      const path = await api.drawingCreate(dir, title, serializeBoard(b), "avenboard");
      await get().refresh();
      return path;
    }),

  rename: (path, name) =>
    guard("rename", async () => {
      const p = await api.itemRename(path, name);
      await get().refresh();
      return p;
    }),

  move: (path, destDir) =>
    guard("move", async () => {
      if (dirname(path).toLowerCase() === destDir.toLowerCase()) return path;
      const p = await api.itemMove(path, destDir);
      await get().refresh();
      toast({ kind: "success", title: `Moved to ${basename(destDir)}` });
      return p;
    }),

  duplicate: (path) =>
    guard("duplicate", async () => {
      const p = await api.itemDuplicate(path);
      await get().refresh();
      return p;
    }),

  trash: (path, label) =>
    guard("move to trash", async () => {
      const active = get().active!;
      const entry = await api.itemTrash(active.id, path);
      await get().refresh();
      toast({
        kind: "info",
        title: `“${label}” moved to trash`,
        action: {
          label: "Undo",
          run: async () => {
            await api.trashRestore(active.id, entry.id);
            await get().refresh();
          },
        },
      });
    }),

  setArchived: (path, archived) =>
    guard(archived ? "archive the project" : "restore the project", async () => {
      const p = await api.projectSetArchived(get().active!.id, path, archived);
      await get().refresh();
      toast({ kind: "success", title: archived ? "Project archived" : "Project restored" });
      return p;
    }),

  toggleFavoriteDrawing: async (id) => {
    const favs = new Set(get().tree?.state.favorites ?? []);
    if (favs.has(id)) favs.delete(id);
    else favs.add(id);
    await get().saveState({ favorites: [...favs] });
  },

  addRecent: async ({ path, id, title }) => {
    const active = get().active;
    if (!active) return;
    await api.recentsAdd({ path, drawingId: id, title, workspaceId: active.id, openedAt: Date.now() }).catch(() => {});
    set({ recents: await api.recentsList(active.id, 40).catch(() => get().recents) });
  },

  loadThumb: async (id) => {
    const active = get().active;
    if (!active || get().thumbs[id] !== undefined) return;
    set((s) => ({ thumbs: { ...s.thumbs, [id]: null } }));
    const t = await api.thumbRead(active.id, id).catch(() => null);
    set((s) => ({ thumbs: { ...s.thumbs, [id]: t } }));
  },

  setThumb: (id, dataUrl) => set((s) => ({ thumbs: { ...s.thumbs, [id]: dataUrl } })),
}));

export function inboxPath(tree: WorkspaceTree) {
  return join(tree.info.path, "Drawings");
}
