// In-memory stand-in for the Rust backend, used when Aven runs in a plain browser
// (UI development and tests). It mimics the on-disk layout closely enough for every screen.
import { basename, dirname, extname, join, norm, safeFileName, stem } from "@/lib/path";

type Node = { dir: true; mtime: number } | { dir: false; mtime: number; content: string };

const fs = new Map<string, Node>();
const now = () => Date.now();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

let registry: { workspaces: any[]; active: string | null } = { workspaces: [], active: null };
let settings: unknown = null;
const recents: any[] = [];
const searchDocs = new Map<string, any>();
const links: any[] = [];
const recovery = new Map<string, any>();

// Persist the mock between page reloads (dev convenience only).
const KEY = "aven.mock.v1";
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  if (saved) {
    for (const [k, v] of saved.fs) fs.set(k, v);
    registry = saved.registry;
    settings = saved.settings;
    recents.push(...saved.recents);
  }
} catch {
  /* ignore */
}
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ fs: [...fs.entries()], registry, settings, recents }));
    } catch {
      /* quota: ignore */
    }
  }, 200);
}

function mkdir(p: string) {
  p = norm(p);
  const parts = p.split("\\");
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join("\\");
    if (!fs.has(sub)) fs.set(sub, { dir: true, mtime: now() });
  }
}
function write(p: string, content: string) {
  p = norm(p);
  mkdir(dirname(p));
  fs.set(p, { dir: false, mtime: now(), content });
}
function read(p: string): string {
  const n = fs.get(norm(p));
  if (!n || n.dir) throw { kind: "not_found", message: `${p} does not exist.` };
  return n.content;
}
function children(p: string) {
  const prefix = norm(p) + "\\";
  return [...fs.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("\\"));
}
function unique(p: string) {
  if (!fs.has(norm(p))) return norm(p);
  const isDir = fs.get(norm(p))!.dir;
  const ext = isDir ? "" : extname(p);
  const base = isDir ? basename(p) : stem(p);
  for (let i = 2; ; i++) {
    const c = join(dirname(p), `${base} (${i})${ext ? "." + ext : ""}`);
    if (!fs.has(c)) return c;
  }
}
function moveTree(from: string, to: string) {
  from = norm(from);
  to = norm(to);
  for (const [k, v] of [...fs.entries()]) {
    if (k === from || k.startsWith(from + "\\")) {
      fs.delete(k);
      fs.set(to + k.slice(from.length), v);
    }
  }
  mkdir(dirname(to));
}
function copyTree(from: string, to: string) {
  for (const [k, v] of [...fs.entries()]) {
    if (k === from || k.startsWith(from + "\\")) fs.set(to + k.slice(from.length), { ...v });
  }
}
function header(p: string) {
  const n = fs.get(p) as any;
  try {
    const j = JSON.parse(n.content);
    return { id: j.id ?? `path:${p}`, title: j.title ?? stem(p), created: j.createdAt ?? n.mtime, updated: j.updatedAt ?? n.mtime };
  } catch {
    return { id: `path:${p}`, title: stem(p), created: n.mtime, updated: n.mtime };
  }
}
function scanFolder(p: string): any {
  const node = { name: basename(p), path: p, folders: [] as any[], drawings: [] as any[], boards: [] as any[], assets: [] as any[] };
  for (const c of children(p)) {
    if (basename(c).startsWith(".")) continue;
    const n = fs.get(c)!;
    if (n.dir) node.folders.push(scanFolder(c));
    else if (extname(c) === "aven" || extname(c) === "avenboard") {
      const h = header(c);
      (extname(c) === "aven" ? node.drawings : node.boards).push({ ...h, path: c, size: (n as any).content.length, modified: n.mtime });
    } else if (["png", "jpg", "svg", "webp", "md"].includes(extname(c)))
      node.assets.push({ name: basename(c), path: c, size: (n as any).content.length, modified: n.mtime });
  }
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.drawings.sort((a, b) => b.updated - a.updated);
  return node;
}
function projectMeta(p: string) {
  const f = join(p, ".aven-project.json");
  if (fs.has(f)) return JSON.parse(read(f));
  const meta = { type: "aven-project", formatVersion: 1, id: uid(), name: basename(p), color: "coral", description: "", createdAt: now(), updatedAt: now(), favorite: false, pinned: false, links: [] };
  write(f, JSON.stringify(meta));
  return meta;
}
function ws(id: string) {
  const w = registry.workspaces.find((x) => x.id === id);
  if (!w) throw { kind: "not_found", message: "Workspace not registered" };
  return w;
}
function initWs(root: string, name: string) {
  for (const d of ["Projects", "Drawings", "Templates", "Libraries", "Archives", ".aven"]) mkdir(join(root, d));
  const f = join(root, "aven-workspace.json");
  if (!fs.has(f)) write(f, JSON.stringify({ type: "aven-workspace", formatVersion: 1, id: uid(), name, createdAt: now() }));
  const j = JSON.parse(read(f));
  const info = { id: j.id, name: j.name, path: root, createdAt: j.createdAt, lastOpenedAt: now(), available: true };
  registry.workspaces = registry.workspaces.filter((w) => w.id !== info.id);
  registry.workspaces.push(info);
  registry.active = info.id;
  return info;
}
function trashDir(root: string) {
  return join(root, ".aven", "trash");
}

export async function mockInvoke(cmd: string, a: any): Promise<unknown> {
  const r = await mockInvokeInner(cmd, a);
  persist();
  return r;
}

async function mockInvokeInner(cmd: string, a: any): Promise<unknown> {
  switch (cmd) {
    case "app_paths":
      return { configDir: "C:\\mock\\config", dataDir: "C:\\mock\\data", documentsDir: "C:\\Users\\me\\Documents", version: "1.0.0-web" };
    case "startup_file":
      return null;
    case "settings_load":
      return settings;
    case "settings_save":
      settings = a.settings;
      return;
    case "ws_list":
      return registry;
    case "ws_create":
      return initWs(unique(join(a.parent, safeFileName(a.name))), a.name);
    case "ws_open_folder":
      return initWs(norm(a.path), basename(a.path));
    case "ws_set_active":
      registry.active = a.id;
      return;
    case "ws_forget":
      registry.workspaces = registry.workspaces.filter((w) => w.id !== a.id);
      return;
    case "ws_rename":
      ws(a.id).name = a.name;
      return;
    case "ws_relocate": {
      const w = ws(a.id);
      const to = join(a.newParent, basename(w.path));
      moveTree(w.path, to);
      w.path = to;
      return w;
    }
    case "ws_scan": {
      const w = ws(a.id);
      const root = w.path;
      const projects = (dir: string, archived: boolean) =>
        children(join(root, dir))
          .filter((c) => fs.get(c)!.dir)
          .map((c) => ({ path: c, meta: projectMeta(c), root: scanFolder(c), archived }));
      const trash = children(trashDir(root)).map((slot) => {
        const t = JSON.parse(read(join(slot, "trash.json")));
        return { ...t, path: join(slot, t.name) };
      });
      const stateFile = join(root, ".aven", "state.json");
      return {
        info: w,
        projects: projects("Projects", false),
        archives: projects("Archives", true),
        inbox: scanFolder(join(root, "Drawings")),
        templates: scanFolder(join(root, "Templates")).drawings,
        libraries: children(join(root, "Libraries")).map((c) => ({ name: basename(c), path: c, size: 1, modified: now() })),
        trash,
        state: fs.has(stateFile) ? JSON.parse(read(stateFile)) : {},
      };
    }
    case "ws_save_state":
      write(join(ws(a.id).path, ".aven", "state.json"), JSON.stringify(a.data));
      return;
    case "ws_storage":
      return { total: 1_200_000, content: 1_000_000, backups: 120_000, thumbnails: 60_000, trash: 20_000, path: ws(a.id).path };
    case "project_create": {
      const p = unique(join(ws(a.wsId).path, "Projects", safeFileName(a.name)));
      mkdir(p);
      const meta = { ...projectMeta(p), ...(a.meta ?? {}), name: a.name };
      write(join(p, ".aven-project.json"), JSON.stringify(meta));
      return [p, meta];
    }
    case "project_save_meta":
      write(join(a.path, ".aven-project.json"), JSON.stringify(a.meta));
      return;
    case "project_set_archived": {
      const to = unique(join(ws(a.wsId).path, a.archived ? "Archives" : "Projects", basename(a.path)));
      moveTree(a.path, to);
      return to;
    }
    case "folder_create": {
      const p = unique(join(a.parent, safeFileName(a.name)));
      mkdir(p);
      return p;
    }
    case "item_rename": {
      const isDir = fs.get(norm(a.path))?.dir;
      const to = unique(join(dirname(a.path), safeFileName(a.name) + (isDir ? "" : "." + extname(a.path))));
      moveTree(a.path, to);
      return to;
    }
    case "item_move": {
      const to = unique(join(a.destDir, basename(a.path)));
      moveTree(a.path, to);
      return to;
    }
    case "item_duplicate": {
      const p = norm(a.path);
      const isDir = fs.get(p)?.dir;
      const to = unique(isDir ? `${p} copy` : join(dirname(p), `${stem(p)} copy.${extname(p) || "aven"}`));
      copyTree(p, to);
      if (!isDir) {
        const j = JSON.parse(read(to));
        write(to, JSON.stringify({ ...j, id: uid(), title: `${j.title} copy` }));
      }
      return to;
    }
    case "item_trash": {
      const root = ws(a.wsId).path;
      const id = `${now()}`;
      const slot = join(trashDir(root), id);
      const name = basename(a.path);
      const kind = fs.get(norm(a.path))?.dir ? (fs.has(join(a.path, ".aven-project.json")) ? "project" : "folder") : "drawing";
      const entry = { id, name, kind, originalPath: norm(a.path).slice(root.length + 1), deletedAt: now(), path: "" };
      moveTree(a.path, join(slot, name));
      write(join(slot, "trash.json"), JSON.stringify(entry));
      return entry;
    }
    case "trash_restore": {
      const root = ws(a.wsId).path;
      const slot = join(trashDir(root), a.id);
      const t = JSON.parse(read(join(slot, "trash.json")));
      const to = unique(join(root, t.originalPath));
      moveTree(join(slot, t.name), to);
      for (const k of [...fs.keys()]) if (k === slot || k.startsWith(slot + "\\")) fs.delete(k);
      return to;
    }
    case "trash_purge": {
      const root = ws(a.wsId).path;
      let n = 0;
      for (const slot of children(trashDir(root))) {
        if (a.id && basename(slot) !== a.id) continue;
        for (const k of [...fs.keys()]) if (k === slot || k.startsWith(slot + "\\")) fs.delete(k);
        n++;
      }
      return n;
    }
    case "drawing_read":
      return read(a.path);
    case "drawing_write":
      JSON.parse(a.content);
      write(a.path, a.content);
      return { path: norm(a.path), modified: now(), size: a.content.length, backupCreated: false };
    case "drawing_create": {
      const p = unique(join(a.dir, `${safeFileName(a.title)}.${a.ext === "avenboard" ? "avenboard" : "aven"}`));
      write(p, a.content);
      return p;
    }
    case "drawing_backups":
      return [];
    case "thumb_write":
      write(join(ws(a.wsId).path, ".aven", "thumbs", `${a.drawingId}.png`), a.data);
      return;
    case "thumb_read": {
      const f = join(ws(a.wsId).path, ".aven", "thumbs", `${a.drawingId}.png`);
      return fs.has(f) ? read(f) : null;
    }
    case "file_write_text":
    case "file_write_base64":
      write(a.path, a.text ?? a.data);
      return;
    case "file_read_text":
    case "file_read_base64":
      return read(a.path);
    case "path_exists":
      return fs.has(norm(a.path));
    case "dir_create":
      mkdir(a.path);
      return;
    case "unique_file_path":
      return unique(a.path);
    case "ws_snapshot":
      return { name: "snapshot.avenbackup", path: "C:\\mock\\snapshot.avenbackup", size: 1000, created: now() };
    case "ws_snapshots":
      return [];
    case "recovery_write":
      recovery.set(a.entry.drawingId, a.entry);
      return;
    case "recovery_list":
      return [...recovery.values()].map((r) => ({ ...r, content: "" }));
    case "recovery_read":
      return recovery.get(a.drawingId);
    case "recovery_clear":
      recovery.delete(a.drawingId);
      return;
    case "recents_add": {
      const i = recents.findIndex((r) => r.path === a.entry.path);
      if (i >= 0) recents.splice(i, 1);
      recents.unshift(a.entry);
      return;
    }
    case "recents_list":
      return recents.filter((r) => !a.wsId || r.workspaceId === a.wsId).slice(0, a.limit);
    case "search_index":
      searchDocs.set(a.doc.path, a.doc);
      return;
    case "search_query": {
      const q = String(a.query).toLowerCase().split(/\s+/).filter(Boolean);
      return [...searchDocs.values()]
        .filter((d) => q.every((t) => `${d.title} ${d.project} ${d.body}`.toLowerCase().includes(t)))
        .slice(0, a.limit)
        .map((d) => ({ ...d, snippet: d.body.slice(0, 80) }));
    }
    case "links_set":
      for (let i = links.length - 1; i >= 0; i--) if (links[i].sourceId === a.sourceId) links.splice(i, 1);
      for (const t of a.targets) links.push({ sourceId: a.sourceId, sourcePath: a.sourcePath, sourceTitle: a.sourceTitle, targetId: t.id, label: t.label });
      return;
    case "links_backlinks":
      return links.filter((l) => l.targetId === a.targetId);
    case "links_all":
      return links;
    case "obsidian_vaults":
      return [{ name: "Notes", path: "C:\\Users\\me\\Documents\\Notes", exists: true }];
    case "obsidian_is_vault":
      return true;
    case "gdrive_folders":
      return [];
    case "integrations_status":
      return { gdriveConnected: false, notionConnected: false };
    default:
      throw { kind: "integration", message: `"${cmd}" is only available in the desktop app.` };
  }
}

/** Test helper: wipe all mock state. */
export function resetMock() {
  fs.clear();
  registry = { workspaces: [], active: null };
  settings = null;
  recents.length = 0;
  searchDocs.clear();
  links.length = 0;
  recovery.clear();
}
