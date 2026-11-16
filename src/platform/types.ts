// Types mirrored from the Rust backend (src-tauri/src/*.rs). Keep in sync.

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number;
  available: boolean;
}

export interface Registry {
  workspaces: WorkspaceInfo[];
  active: string | null;
}

export interface DrawingEntry {
  id: string;
  title: string;
  path: string;
  size: number;
  modified: number;
  created: number;
  updated: number;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: number;
}

export interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  drawings: DrawingEntry[];
  /** Kanban boards (.avenboard) */
  boards: DrawingEntry[];
  assets: FileEntry[];
}

export type ProjectColor = "honey" | "coral" | "violet" | "blue" | "green" | "graphite";

export interface ProjectMeta {
  type?: "aven-project";
  formatVersion?: number;
  id: string;
  name: string;
  color: ProjectColor;
  description: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  pinned: boolean;
  links: { id: string; label?: string }[];
}

export interface ProjectNode {
  path: string;
  meta: ProjectMeta;
  root: FolderNode;
  archived: boolean;
}

export interface TrashEntry {
  id: string;
  name: string;
  kind: "drawing" | "board" | "folder" | "project";
  originalPath: string;
  deletedAt: number;
  path: string;
}

export interface WorkspaceState {
  favorites?: string[]; // drawing ids
  templateFavorites?: string[];
  recentTemplates?: string[];
  [key: string]: unknown;
}

export interface WorkspaceTree {
  info: WorkspaceInfo;
  projects: ProjectNode[];
  archives: ProjectNode[];
  inbox: FolderNode;
  templates: DrawingEntry[];
  libraries: FileEntry[];
  trash: TrashEntry[];
  state: WorkspaceState;
}

export interface BackupPolicy {
  enabled: boolean;
  minIntervalSec: number;
  keep: number;
}

export interface WriteResult {
  path: string;
  modified: number;
  size: number;
  backupCreated: boolean;
}

export interface StorageUsage {
  total: number;
  content: number;
  backups: number;
  thumbnails: number;
  trash: number;
  path: string;
}

export interface SnapshotInfo {
  name: string;
  path: string;
  size: number;
  created: number;
}

export interface RecoveryEntry {
  drawingId: string;
  path: string;
  title: string;
  savedAt: number;
  content: string;
}

export interface RecentEntry {
  path: string;
  drawingId: string;
  title: string;
  workspaceId: string;
  openedAt: number;
}

export interface SearchDoc {
  path: string;
  drawingId: string;
  workspaceId: string;
  kind: "drawing" | "board" | "template" | "project";
  title: string;
  project: string;
  body: string;
}

export interface SearchHit extends Omit<SearchDoc, "body"> {
  snippet: string;
}

export interface LinkRow {
  sourceId: string;
  sourcePath: string;
  sourceTitle: string;
  targetId: string;
  label: string;
}

export interface VaultInfo {
  name: string;
  path: string;
  exists: boolean;
}

export interface UploadResult {
  id: string;
  url: string;
}

export interface AppPaths {
  configDir: string;
  dataDir: string;
  documentsDir: string | null;
  version: string;
}

export interface AppErrorPayload {
  kind:
    | "not_found"
    | "permission"
    | "io"
    | "invalid"
    | "db"
    | "archive"
    | "network"
    | "secrets"
    | "corrupt"
    | "conflict"
    | "integration";
  message: string;
}
