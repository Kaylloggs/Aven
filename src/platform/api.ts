// Single entry point to the native backend. Inside the desktop app every call goes to a Rust
// command; in a plain browser (UI development, tests) an in-memory mock answers instead.
import type * as T from "./types";
import { mockInvoke } from "./mock";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export class AppError extends Error {
  kind: T.AppErrorPayload["kind"];
  constructor(payload: T.AppErrorPayload) {
    super(payload.message);
    this.kind = payload.kind;
  }
}

async function call<R>(cmd: string, args?: Record<string, unknown>): Promise<R> {
  try {
    if (isDesktop) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<R>(cmd, args);
    }
    return (await mockInvoke(cmd, args ?? {})) as R;
  } catch (e) {
    if (e && typeof e === "object" && "kind" in e && "message" in e) throw new AppError(e as T.AppErrorPayload);
    if (e instanceof Error) throw e;
    throw new Error(String(e));
  }
}

export const api = {
  appPaths: () => call<T.AppPaths>("app_paths"),
  startupFile: () => call<string | null>("startup_file"),
  settingsLoad: () => call<unknown>("settings_load"),
  settingsSave: (settings: unknown) => call<void>("settings_save", { settings }),

  wsList: () => call<T.Registry>("ws_list"),
  wsCreate: (name: string, parent: string) => call<T.WorkspaceInfo>("ws_create", { name, parent }),
  wsOpenFolder: (path: string) => call<T.WorkspaceInfo>("ws_open_folder", { path }),
  wsSetActive: (id: string) => call<void>("ws_set_active", { id }),
  wsForget: (id: string) => call<void>("ws_forget", { id }),
  wsRename: (id: string, name: string) => call<void>("ws_rename", { id, name }),
  wsRelocate: (id: string, newParent: string) => call<T.WorkspaceInfo>("ws_relocate", { id, newParent }),
  wsScan: (id: string) => call<T.WorkspaceTree>("ws_scan", { id }),
  wsSaveState: (id: string, data: T.WorkspaceState) => call<void>("ws_save_state", { id, data }),
  wsStorage: (id: string) => call<T.StorageUsage>("ws_storage", { id }),

  projectCreate: (wsId: string, name: string, meta?: Partial<T.ProjectMeta>) =>
    call<[string, T.ProjectMeta]>("project_create", { wsId, name, meta }),
  projectSaveMeta: (path: string, meta: T.ProjectMeta) => call<void>("project_save_meta", { path, meta }),
  projectSetArchived: (wsId: string, path: string, archived: boolean) =>
    call<string>("project_set_archived", { wsId, path, archived }),
  projectExport: (path: string, destFile: string) => call<number>("project_export", { path, destFile }),
  projectImport: (wsId: string, file: string) => call<string>("project_import", { wsId, file }),

  folderCreate: (parent: string, name: string) => call<string>("folder_create", { parent, name }),
  itemRename: (path: string, name: string) => call<string>("item_rename", { path, name }),
  itemMove: (path: string, destDir: string) => call<string>("item_move", { path, destDir }),
  itemDuplicate: (path: string) => call<string>("item_duplicate", { path }),
  itemTrash: (wsId: string, path: string) => call<T.TrashEntry>("item_trash", { wsId, path }),
  trashRestore: (wsId: string, id: string) => call<string>("trash_restore", { wsId, id }),
  trashPurge: (wsId: string, id?: string, olderThanDays?: number) =>
    call<number>("trash_purge", { wsId, id, olderThanDays }),

  drawingRead: (path: string) => call<string>("drawing_read", { path }),
  drawingWrite: (args: {
    wsId?: string;
    path: string;
    content: string;
    drawingId: string;
    policy: T.BackupPolicy;
    expectedModified?: number;
  }) => call<T.WriteResult>("drawing_write", args),
  drawingCreate: (dir: string, title: string, content: string, ext?: "aven" | "avenboard" | "md") =>
    call<string>("drawing_create", { dir, title, content, ext }),
  drawingBackups: (wsId: string, drawingId: string) => call<T.FileEntry[]>("drawing_backups", { wsId, drawingId }),
  thumbWrite: (wsId: string, drawingId: string, data: string) => call<void>("thumb_write", { wsId, drawingId, data }),
  thumbRead: (wsId: string, drawingId: string) => call<string | null>("thumb_read", { wsId, drawingId }),

  fileWriteText: (path: string, text: string) => call<void>("file_write_text", { path, text }),
  fileWriteBase64: (path: string, data: string) => call<void>("file_write_base64", { path, data }),
  fileReadText: (path: string) => call<string>("file_read_text", { path }),
  fileReadBase64: (path: string) => call<string>("file_read_base64", { path }),
  pathExists: (path: string) => call<boolean>("path_exists", { path }),
  dirCreate: (path: string) => call<void>("dir_create", { path }),
  uniqueFilePath: (path: string) => call<string>("unique_file_path", { path }),

  wsSnapshot: (wsId: string, destDir: string | null, keep: number) =>
    call<T.SnapshotInfo>("ws_snapshot", { wsId, destDir, keep }),
  wsSnapshots: (wsId: string, destDir: string | null) => call<T.SnapshotInfo[]>("ws_snapshots", { wsId, destDir }),
  wsRestoreSnapshot: (file: string, parent: string, name: string) =>
    call<T.WorkspaceInfo>("ws_restore_snapshot", { file, parent, name }),

  recoveryWrite: (entry: T.RecoveryEntry) => call<void>("recovery_write", { entry }),
  recoveryList: () => call<T.RecoveryEntry[]>("recovery_list"),
  recoveryRead: (drawingId: string) => call<T.RecoveryEntry>("recovery_read", { drawingId }),
  recoveryClear: (drawingId: string) => call<void>("recovery_clear", { drawingId }),

  recentsAdd: (entry: T.RecentEntry) => call<void>("recents_add", { entry }),
  recentsList: (wsId: string | null, limit: number) => call<T.RecentEntry[]>("recents_list", { wsId, limit }),
  searchIndex: (doc: T.SearchDoc) => call<void>("search_index", { doc }),
  searchQuery: (query: string, wsId: string | null, limit: number) =>
    call<T.SearchHit[]>("search_query", { query, wsId, limit }),
  linksSet: (sourceId: string, sourcePath: string, sourceTitle: string, targets: { id: string; label: string }[]) =>
    call<void>("links_set", { sourceId, sourcePath, sourceTitle, targets }),
  linksBacklinks: (targetId: string) => call<T.LinkRow[]>("links_backlinks", { targetId }),
  linksAll: () => call<T.LinkRow[]>("links_all"),

  obsidianVaults: () => call<T.VaultInfo[]>("obsidian_vaults"),
  obsidianIsVault: (path: string) => call<boolean>("obsidian_is_vault", { path }),
  gdriveFolders: () => call<string[]>("gdrive_folders"),
  integrationsStatus: () => call<{ gdriveConnected: boolean; notionConnected: boolean }>("integrations_status"),
  gdriveConnect: (clientId: string, clientSecret: string) => call<string>("gdrive_connect", { clientId, clientSecret }),
  gdriveDisconnect: () => call<void>("gdrive_disconnect"),
  gdriveUpload: (folder: string, files: { name: string; mime: string; data: string }[]) =>
    call<T.UploadResult[]>("gdrive_upload", { folder, files }),
  notionSetToken: (token: string) => call<void>("notion_set_token", { token }),
  notionCheck: () => call<string>("notion_check"),
  notionPublish: (args: { parentPageId: string; title: string; description: string; png: string; fileName: string }) =>
    call<T.UploadResult>("notion_publish", args),
};

// ---------------------------------------------------------------- native dialogs & shell

export async function pickFolder(title: string, defaultPath?: string): Promise<string | null> {
  if (!isDesktop) return window.prompt(title, defaultPath ?? "C:\\Users\\me\\Documents") || null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title, defaultPath });
  return typeof r === "string" ? r : null;
}

export async function pickFile(
  title: string,
  filters: { name: string; extensions: string[] }[],
  multiple = false,
): Promise<string[]> {
  if (!isDesktop) {
    const p = window.prompt(title);
    return p ? [p] : [];
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, filters, multiple, directory: false });
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

export async function pickSavePath(
  title: string,
  defaultPath: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!isDesktop) return window.prompt(title, defaultPath) || null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return (await save({ title, defaultPath, filters })) ?? null;
}

export async function confirmNative(message: string, title = "Aven"): Promise<boolean> {
  if (!isDesktop) return window.confirm(message);
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, { title, kind: "warning" });
}

export async function revealInExplorer(path: string) {
  if (!isDesktop) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export async function openExternal(url: string) {
  if (!isDesktop) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function openPath(path: string) {
  if (!isDesktop) return;
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(path);
}

export async function setWindowTitle(title: string) {
  if (!isDesktop) {
    document.title = title;
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}
