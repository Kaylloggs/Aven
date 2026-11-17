//! Workspaces, projects, folders and drawings on disk.
//!
//! Layout of a workspace folder (portable, self-contained):
//! ```text
//! <root>/aven-workspace.json   workspace identity
//! <root>/Projects/<name>/      one folder per project (+ .aven-project.json)
//! <root>/Drawings/             drawings that do not belong to a project
//! <root>/Templates/            personal templates (*.aven)
//! <root>/Libraries/            component / shape libraries
//! <root>/Archives/<name>/      archived projects
//! <root>/.aven/                backups, thumbnails, trash, workspace state
//! ```
use crate::db::{CachedHeader, Db};
use crate::error::{AppError, AppResult};
use crate::fsops::{self, atomic_write, mtime_ms, now_ms, safe_name, unique_path};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const WORKSPACE_FILE: &str = "aven-workspace.json";
pub const PROJECT_FILE: &str = ".aven-project.json";
pub const DRAWING_EXT: &str = "aven";
pub const BOARD_EXT: &str = "avenboard";
/// Notes are plain Markdown files, readable by Obsidian, Notion and any editor.
pub const NOTE_EXT: &str = "md";
pub const DIRS: [&str; 5] = ["Projects", "Drawings", "Templates", "Libraries", "Archives"];

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: i64,
    #[serde(default)]
    pub last_opened_at: i64,
    #[serde(default)]
    pub available: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub workspaces: Vec<WorkspaceInfo>,
    pub active: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DrawingEntry {
    pub id: String,
    pub title: String,
    pub path: String,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub updated: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub name: String,
    pub path: String,
    pub folders: Vec<FolderNode>,
    pub drawings: Vec<DrawingEntry>,
    /// Kanban boards (`*.avenboard`), listed with the same header fields as drawings
    pub boards: Vec<DrawingEntry>,
    /// Markdown notes (`*.md`): title is the file name, id is derived from the path
    pub notes: Vec<DrawingEntry>,
    pub assets: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectNode {
    pub path: String,
    pub meta: Value,
    pub root: FolderNode,
    pub archived: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub original_path: String,
    pub deleted_at: i64,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTree {
    pub info: WorkspaceInfo,
    pub projects: Vec<ProjectNode>,
    pub archives: Vec<ProjectNode>,
    pub inbox: FolderNode,
    pub templates: Vec<DrawingEntry>,
    pub libraries: Vec<FileEntry>,
    pub trash: Vec<TrashEntry>,
    pub state: Value,
}

// ---------------------------------------------------------------- registry

pub fn registry_path(config_dir: &Path) -> PathBuf {
    config_dir.join("workspaces.json")
}

pub fn load_registry(config_dir: &Path) -> Registry {
    let mut reg: Registry = fs::read_to_string(registry_path(config_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    for w in &mut reg.workspaces {
        w.available = Path::new(&w.path).join(WORKSPACE_FILE).is_file();
    }
    reg
}

pub fn save_registry(config_dir: &Path, reg: &Registry) -> AppResult<()> {
    atomic_write(&registry_path(config_dir), serde_json::to_string_pretty(reg)?.as_bytes())
}

/// Create the standard folder structure and identity file (idempotent).
pub fn init_workspace_dir(root: &Path, name: &str) -> AppResult<WorkspaceInfo> {
    fs::create_dir_all(root)?;
    for d in DIRS {
        fs::create_dir_all(root.join(d))?;
    }
    fs::create_dir_all(root.join(".aven"))?;
    let file = root.join(WORKSPACE_FILE);
    let info: Value = if file.is_file() {
        serde_json::from_str(&fs::read_to_string(&file)?)?
    } else {
        let v = json!({
            "type": "aven-workspace",
            "formatVersion": 1,
            "id": uuid::Uuid::new_v4().to_string(),
            "name": name,
            "createdAt": now_ms(),
        });
        atomic_write(&file, serde_json::to_string_pretty(&v)?.as_bytes())?;
        v
    };
    Ok(WorkspaceInfo {
        id: info["id"].as_str().unwrap_or_default().to_string(),
        name: info["name"].as_str().unwrap_or(name).to_string(),
        path: root.to_string_lossy().to_string(),
        created_at: info["createdAt"].as_i64().unwrap_or_else(now_ms),
        last_opened_at: now_ms(),
        available: true,
    })
}

pub fn rename_workspace_file(root: &Path, name: &str) -> AppResult<()> {
    let file = root.join(WORKSPACE_FILE);
    let mut v: Value = serde_json::from_str(&fs::read_to_string(&file)?)?;
    v["name"] = json!(name);
    atomic_write(&file, serde_json::to_string_pretty(&v)?.as_bytes())
}

// ---------------------------------------------------------------- scanning

#[derive(Deserialize)]
struct DrawingHeader {
    id: Option<String>,
    title: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<i64>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<i64>,
}

fn is_drawing(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case(DRAWING_EXT)).unwrap_or(false)
}

fn is_board(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case(BOARD_EXT)).unwrap_or(false)
}

pub fn is_note(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case(NOTE_EXT)).unwrap_or(false)
}

/// A note is listed without reading it: Markdown has no header to parse.
fn note_entry(path: &Path, meta: &fs::Metadata) -> DrawingEntry {
    let key = path.to_string_lossy().to_string();
    let mtime = mtime_ms(meta);
    let created = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(mtime);
    DrawingEntry {
        id: format!("path:{key}"),
        title: path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        path: key,
        size: meta.len(),
        modified: mtime,
        created: created.min(mtime),
        updated: mtime,
    }
}

/// Any Aven JSON document with its own identity (drawing or board).
fn is_document(p: &Path) -> bool {
    is_drawing(p) || is_board(p)
}

fn is_asset(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "svg" | "webp" | "gif" | "pdf")
    )
}

pub fn read_drawing_entry(db: Option<&Db>, path: &Path) -> Option<DrawingEntry> {
    let meta = fs::metadata(path).ok()?;
    let mtime = mtime_ms(&meta);
    let size = meta.len();
    let key = path.to_string_lossy().to_string();
    let header = db
        .and_then(|db| db.cached_header(&key, mtime, size as i64).ok().flatten())
        .or_else(|| {
            let text = fs::read_to_string(path).ok()?;
            let h: DrawingHeader = serde_json::from_str(&text).ok()?;
            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let ch = CachedHeader {
                id: h.id.unwrap_or_else(|| format!("path:{key}")),
                title: h.title.filter(|t| !t.trim().is_empty()).unwrap_or(stem),
                created: h.created_at.unwrap_or(mtime),
                updated: h.updated_at.unwrap_or(mtime),
            };
            if let Some(db) = db {
                let _ = db.store_header(&key, mtime, size as i64, &ch);
            }
            Some(ch)
        });
    let h = header.unwrap_or(CachedHeader {
        // Unreadable file: still list it so the user can open it and get recovery options.
        id: format!("path:{key}"),
        title: path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        created: mtime,
        updated: mtime,
    });
    Some(DrawingEntry { id: h.id, title: h.title, path: key, size, modified: mtime, created: h.created, updated: h.updated })
}

pub fn scan_folder(db: Option<&Db>, dir: &Path, depth: usize) -> FolderNode {
    let mut node = FolderNode {
        name: dir.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        path: dir.to_string_lossy().to_string(),
        folders: vec![],
        drawings: vec![],
        boards: vec![],
        notes: vec![],
        assets: vec![],
    };
    let Ok(entries) = fs::read_dir(dir) else { return node };
    for e in entries.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            if depth < 24 {
                node.folders.push(scan_folder(db, &p, depth + 1));
            }
        } else if is_drawing(&p) {
            if let Some(d) = read_drawing_entry(db, &p) {
                node.drawings.push(d);
            }
        } else if is_board(&p) {
            if let Some(d) = read_drawing_entry(db, &p) {
                node.boards.push(d);
            }
        } else if is_note(&p) {
            if let Ok(m) = e.metadata() {
                node.notes.push(note_entry(&p, &m));
            }
        } else if is_asset(&p) {
            if let Ok(m) = e.metadata() {
                node.assets.push(FileEntry { name, path: p.to_string_lossy().to_string(), size: m.len(), modified: mtime_ms(&m) });
            }
        }
    }
    node.folders.sort_by_key(|f| f.name.to_lowercase());
    node.drawings.sort_by(|a, b| b.updated.cmp(&a.updated));
    node.boards.sort_by(|a, b| b.updated.cmp(&a.updated));
    node.notes.sort_by(|a, b| b.updated.cmp(&a.updated));
    node
}

/// Read (or create) a project's metadata file.
pub fn project_meta(dir: &Path) -> AppResult<Value> {
    let file = dir.join(PROJECT_FILE);
    if let Ok(text) = fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            if v.get("id").and_then(|i| i.as_str()).is_some() {
                return Ok(v);
            }
        }
    }
    let name = dir.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let meta = fs::metadata(dir).ok();
    let created = meta.as_ref().map(mtime_ms).unwrap_or_else(now_ms);
    let v = json!({
        "type": "aven-project",
        "formatVersion": 1,
        "id": uuid::Uuid::new_v4().to_string(),
        "name": name,
        "color": "coral",
        "description": "",
        "createdAt": created,
        "updatedAt": created,
        "favorite": false,
        "pinned": false,
        "links": []
    });
    // Best effort: a read-only folder still shows up as a project.
    let _ = atomic_write(&file, serde_json::to_string_pretty(&v)?.as_bytes());
    Ok(v)
}

fn scan_projects(db: Option<&Db>, dir: &Path, archived: bool) -> Vec<ProjectNode> {
    let mut out = vec![];
    let Ok(entries) = fs::read_dir(dir) else { return out };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() || e.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let meta = project_meta(&p).unwrap_or(json!({}));
        out.push(ProjectNode { path: p.to_string_lossy().to_string(), meta, root: scan_folder(db, &p, 0), archived });
    }
    out.sort_by_key(|p| p.meta["name"].as_str().unwrap_or_default().to_lowercase());
    out
}

pub fn scan_workspace(db: Option<&Db>, info: &WorkspaceInfo) -> AppResult<WorkspaceTree> {
    let root = Path::new(&info.path);
    if !root.join(WORKSPACE_FILE).is_file() {
        return Err(AppError::NotFound(format!(
            "The workspace folder \"{}\" is missing or was moved.",
            info.path
        )));
    }
    for d in DIRS {
        let _ = fs::create_dir_all(root.join(d));
    }
    let templates = scan_folder(db, &root.join("Templates"), 0);
    let mut template_list = templates.drawings.clone();
    fn collect(f: &FolderNode, out: &mut Vec<DrawingEntry>) {
        for sub in &f.folders {
            out.extend(sub.drawings.iter().cloned());
            collect(sub, out);
        }
    }
    collect(&templates, &mut template_list);
    let libraries = fs::read_dir(root.join("Libraries"))
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_file())
                .filter_map(|e| {
                    let m = e.metadata().ok()?;
                    Some(FileEntry {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: e.path().to_string_lossy().to_string(),
                        size: m.len(),
                        modified: mtime_ms(&m),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let state = fs::read_to_string(root.join(".aven/state.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!({}));
    Ok(WorkspaceTree {
        info: info.clone(),
        projects: scan_projects(db, &root.join("Projects"), false),
        archives: scan_projects(db, &root.join("Archives"), true),
        inbox: scan_folder(db, &root.join("Drawings"), 0),
        templates: template_list,
        libraries,
        trash: list_trash(root),
        state,
    })
}

// ---------------------------------------------------------------- operations

pub fn create_project(root: &Path, name: &str, meta: Option<Value>) -> AppResult<(PathBuf, Value)> {
    let dir = unique_path(&root.join("Projects").join(safe_name(name)));
    fs::create_dir_all(&dir)?;
    let mut v = json!({
        "type": "aven-project",
        "formatVersion": 1,
        "id": uuid::Uuid::new_v4().to_string(),
        "name": name,
        "color": "coral",
        "description": "",
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        "favorite": false,
        "pinned": false,
        "links": []
    });
    if let Some(Value::Object(extra)) = meta {
        for (k, val) in extra {
            if k != "id" {
                v[k] = val;
            }
        }
    }
    atomic_write(&dir.join(PROJECT_FILE), serde_json::to_string_pretty(&v)?.as_bytes())?;
    Ok((dir, v))
}

/// Give a drawing file a fresh identity (used when duplicating).
pub fn reidentify_drawing(path: &Path, new_title: Option<&str>) -> AppResult<()> {
    let text = fs::read_to_string(path)?;
    let mut v: Value = serde_json::from_str(&text).map_err(|e| AppError::Corrupt(e.to_string()))?;
    v["id"] = json!(uuid::Uuid::new_v4().to_string());
    v["createdAt"] = json!(now_ms());
    v["updatedAt"] = json!(now_ms());
    if let Some(t) = new_title {
        v["title"] = json!(t);
    }
    atomic_write(path, serde_json::to_string(&v)?.as_bytes())
}

pub fn duplicate(path: &Path) -> AppResult<PathBuf> {
    if path.is_dir() {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let target = unique_path(&path.with_file_name(format!("{name} copy")));
        fsops::copy_dir(path, &target)?;
        // new identities for the copy
        let pf = target.join(PROJECT_FILE);
        if pf.is_file() {
            let mut v: Value = serde_json::from_str(&fs::read_to_string(&pf)?)?;
            v["id"] = json!(uuid::Uuid::new_v4().to_string());
            v["name"] = json!(target.file_name().unwrap().to_string_lossy());
            v["createdAt"] = json!(now_ms());
            v["updatedAt"] = json!(now_ms());
            v["favorite"] = json!(false);
            v["pinned"] = json!(false);
            atomic_write(&pf, serde_json::to_string_pretty(&v)?.as_bytes())?;
        }
        for e in walkdir::WalkDir::new(&target).into_iter().flatten() {
            if is_document(e.path()) {
                let _ = reidentify_drawing(e.path(), None);
            }
        }
        Ok(target)
    } else {
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| DRAWING_EXT.into());
        let target = unique_path(&path.with_file_name(format!("{stem} copy.{ext}")));
        fs::copy(path, &target)?;
        if is_document(&target) {
            reidentify_drawing(&target, Some(&format!("{stem} copy")))?;
        }
        Ok(target)
    }
}

pub fn rename_item(path: &Path, new_name: &str) -> AppResult<PathBuf> {
    let clean = safe_name(new_name);
    let target = if path.is_dir() {
        path.with_file_name(&clean)
    } else {
        let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        path.with_file_name(format!("{clean}{ext}"))
    };
    if target == path {
        return Ok(target);
    }
    // case-only renames on Windows need a two-step move
    if target.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase() {
        let tmp = path.with_file_name(format!(".rename-{}", uuid::Uuid::new_v4().simple()));
        fs::rename(path, &tmp)?;
        fs::rename(&tmp, &target)?;
        return Ok(target);
    }
    let target = unique_path(&target);
    fs::rename(path, &target)?;
    Ok(target)
}

pub fn move_into(path: &Path, dest_dir: &Path) -> AppResult<PathBuf> {
    if dest_dir.starts_with(path) {
        return Err(AppError::Invalid("A folder cannot be moved inside itself.".into()));
    }
    let target = unique_path(&dest_dir.join(path.file_name().unwrap()));
    fsops::move_path(path, &target)?;
    Ok(target)
}

// ---------------------------------------------------------------- trash

fn trash_dir(root: &Path) -> PathBuf {
    root.join(".aven").join("trash")
}

pub fn trash_item(root: &Path, path: &Path) -> AppResult<TrashEntry> {
    if !path.starts_with(root) {
        return Err(AppError::Invalid("Only items inside the workspace can be moved to the trash.".into()));
    }
    let id = format!("{}-{}", chrono::Utc::now().format("%Y%m%d%H%M%S"), &uuid::Uuid::new_v4().simple().to_string()[..6]);
    let slot = trash_dir(root).join(&id);
    fs::create_dir_all(&slot)?;
    let name = path.file_name().unwrap().to_string_lossy().to_string();
    let kind = if path.is_dir() {
        if path.join(PROJECT_FILE).exists() { "project" } else { "folder" }
    } else if is_board(path) {
        "board"
    } else if is_note(path) {
        "note"
    } else {
        "drawing"
    };
    let rel = path.strip_prefix(root).unwrap().to_string_lossy().to_string();
    let entry = TrashEntry { id: id.clone(), name: name.clone(), kind: kind.into(), original_path: rel, deleted_at: now_ms(), path: String::new() };
    fsops::move_path(path, &slot.join(&name))?;
    atomic_write(&slot.join("trash.json"), serde_json::to_string_pretty(&entry)?.as_bytes())?;
    Ok(entry)
}

pub fn list_trash(root: &Path) -> Vec<TrashEntry> {
    let mut out: Vec<TrashEntry> = fs::read_dir(trash_dir(root))
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let text = fs::read_to_string(e.path().join("trash.json")).ok()?;
                    let mut t: TrashEntry = serde_json::from_str(&text).ok()?;
                    t.path = e.path().join(&t.name).to_string_lossy().to_string();
                    Some(t)
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    out
}

pub fn restore_trash(root: &Path, id: &str) -> AppResult<PathBuf> {
    let slot = trash_dir(root).join(id);
    let t: TrashEntry = serde_json::from_str(&fs::read_to_string(slot.join("trash.json"))?)?;
    let target = unique_path(&root.join(&t.original_path));
    fsops::move_path(&slot.join(&t.name), &target)?;
    fs::remove_dir_all(&slot)?;
    Ok(target)
}

pub fn purge_trash(root: &Path, id: Option<&str>, older_than_days: Option<i64>) -> AppResult<usize> {
    let mut n = 0;
    for t in list_trash(root) {
        let expired = older_than_days.map(|d| now_ms() - t.deleted_at > d * 86_400_000).unwrap_or(false);
        if id == Some(t.id.as_str()) || (id.is_none() && (older_than_days.is_none() || expired)) {
            fs::remove_dir_all(trash_dir(root).join(&t.id))?;
            n += 1;
        }
    }
    Ok(n)
}

// ---------------------------------------------------------------- archive

pub fn set_archived(root: &Path, project: &Path, archived: bool) -> AppResult<PathBuf> {
    let dest = root.join(if archived { "Archives" } else { "Projects" });
    let target = unique_path(&dest.join(project.file_name().unwrap()));
    fsops::move_path(project, &target)?;
    Ok(target)
}

// ---------------------------------------------------------------- drawing IO

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupPolicy {
    pub enabled: bool,
    pub min_interval_sec: i64,
    pub keep: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub path: String,
    pub modified: i64,
    pub size: u64,
    pub backup_created: bool,
}

pub fn read_drawing(path: &Path) -> AppResult<String> {
    let text = fs::read_to_string(path)?;
    // Notes are free Markdown text: any content (including an empty new note) is valid.
    if is_note(path) {
        return Ok(text);
    }
    match serde_json::from_str::<Value>(&text) {
        Ok(v) if v.is_object() => Ok(text),
        Ok(_) => Err(AppError::Corrupt(format!("{} is not an Aven drawing.", path.display()))),
        Err(e) => Err(AppError::Corrupt(format!("{} is damaged ({e}).", path.display()))),
    }
}

pub fn backups_dir(root: &Path, drawing_id: &str) -> PathBuf {
    root.join(".aven").join("backups").join(safe_name(drawing_id))
}

/// Copy the current file into the backup folder when the newest backup is older than the
/// policy interval, then prune old backups. Returns true when a backup was written.
pub fn maybe_backup(root: &Path, drawing_id: &str, path: &Path, policy: &BackupPolicy) -> AppResult<bool> {
    if !policy.enabled || !path.is_file() {
        return Ok(false);
    }
    let dir = backups_dir(root, drawing_id);
    fs::create_dir_all(&dir)?;
    let mut existing = list_backups(root, drawing_id);
    let newest = existing.first().map(|b| b.modified).unwrap_or(0);
    let mut created = false;
    if now_ms() - newest >= policy.min_interval_sec * 1000 {
        let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S-%3f");
        let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| DRAWING_EXT.into());
        fs::copy(path, dir.join(format!("{stamp}.{ext}")))?;
        created = true;
        existing = list_backups(root, drawing_id);
    }
    for old in existing.iter().skip(policy.keep.max(1)) {
        let _ = fs::remove_file(&old.path);
    }
    Ok(created)
}

pub fn list_backups(root: &Path, drawing_id: &str) -> Vec<FileEntry> {
    let mut v: Vec<FileEntry> = fs::read_dir(backups_dir(root, drawing_id))
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let m = e.metadata().ok()?;
                    Some(FileEntry {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: e.path().to_string_lossy().to_string(),
                        size: m.len(),
                        modified: mtime_ms(&m),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| b.name.cmp(&a.name));
    v
}

pub fn write_drawing(
    root: Option<&Path>,
    path: &Path,
    content: &str,
    drawing_id: &str,
    policy: &BackupPolicy,
    expected_modified: Option<i64>,
) -> AppResult<WriteResult> {
    // Refuse to write a drawing or board that is not valid JSON: never replace good data with bad.
    // Notes are free Markdown text.
    if !is_note(path) {
        serde_json::from_str::<Value>(content).map_err(|e| AppError::Invalid(format!("Refusing to save invalid data: {e}")))?;
    }
    if let (Some(expected), Ok(meta)) = (expected_modified, fs::metadata(path)) {
        let current = mtime_ms(&meta);
        if (current - expected).abs() > 1500 {
            return Err(AppError::Conflict(
                "This drawing was changed on disk by another program since it was opened.".into(),
            ));
        }
    }
    let backup_created = match root {
        Some(r) => maybe_backup(r, drawing_id, path, policy)?,
        None => false,
    };
    atomic_write(path, content.as_bytes())?;
    let meta = fs::metadata(path)?;
    Ok(WriteResult { path: path.to_string_lossy().to_string(), modified: mtime_ms(&meta), size: meta.len(), backup_created })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ws() -> (tempfile::TempDir, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("WS");
        init_workspace_dir(&root, "Test").unwrap();
        (d, root)
    }

    fn drawing(id: &str, title: &str) -> String {
        json!({"type":"aven-drawing","version":1,"id":id,"title":title,"createdAt":1,"updatedAt":2,"scene":{"elements":[]}}).to_string()
    }

    #[test]
    fn workspace_structure_and_scan() {
        let (_d, root) = ws();
        for d in DIRS {
            assert!(root.join(d).is_dir());
        }
        let (proj, meta) = create_project(&root, "Brand: refresh?", None).unwrap();
        assert_eq!(proj.file_name().unwrap(), "Brand- refresh-");
        assert_eq!(meta["name"], "Brand: refresh?");
        fs::create_dir_all(proj.join("Sketches/Old")).unwrap();
        fs::write(proj.join("Sketches/a.aven"), drawing("a1", "Alpha")).unwrap();
        fs::write(proj.join("Sketches/Old/b.aven"), drawing("b1", "Beta")).unwrap();
        fs::write(root.join("Drawings/loose.aven"), drawing("c1", "Loose")).unwrap();
        fs::write(root.join("Drawings/broken.aven"), "{oops").unwrap();
        let info = init_workspace_dir(&root, "x").unwrap();
        let db = Db::open_in_memory().unwrap();
        let tree = scan_workspace(Some(&db), &info).unwrap();
        assert_eq!(tree.info.name, "Test");
        assert_eq!(tree.projects.len(), 1);
        let sk = &tree.projects[0].root.folders[0];
        assert_eq!(sk.name, "Sketches");
        assert_eq!(sk.drawings[0].title, "Alpha");
        assert_eq!(sk.folders[0].drawings[0].id, "b1");
        assert_eq!(tree.inbox.drawings.len(), 2, "broken files are still listed");
        // cached second scan gives identical results
        let tree2 = scan_workspace(Some(&db), &info).unwrap();
        assert_eq!(tree2.projects[0].root.folders[0].drawings[0].id, "a1");
    }

    #[test]
    fn notes_are_markdown_files_listed_saved_and_trashed() {
        let (_d, root) = ws();
        let (proj, _) = create_project(&root, "P", None).unwrap();
        fs::write(proj.join("Meeting notes.md"), "# Meeting\n\n- [ ] Follow up").unwrap();
        let info = init_workspace_dir(&root, "x").unwrap();
        let tree = scan_workspace(None, &info).unwrap();
        let note = &tree.projects[0].root.notes[0];
        assert_eq!(note.title, "Meeting notes");
        assert!(tree.projects[0].root.assets.is_empty(), "notes are no longer listed as assets");
        let policy = BackupPolicy { enabled: true, min_interval_sec: 0, keep: 5 };
        let p = proj.join("Meeting notes.md");
        write_drawing(Some(&root), &p, "# Meeting\n\nPlain *Markdown*, not JSON", "note-1", &policy, None).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "# Meeting\n\nPlain *Markdown*, not JSON");
        assert!(list_backups(&root, "note-1")[0].name.ends_with(".md"));
        // drawings still refuse invalid JSON
        assert!(write_drawing(None, &proj.join("x.aven"), "not json", "d", &policy, None).is_err());
        assert_eq!(read_drawing(&p).unwrap(), "# Meeting\n\nPlain *Markdown*, not JSON");
        // a brand-new note is an empty file and must open
        fs::write(proj.join("Untitled note.md"), "").unwrap();
        assert_eq!(read_drawing(&proj.join("Untitled note.md")).unwrap(), "");
        let copy = duplicate(&p).unwrap();
        assert!(copy.ends_with("Meeting notes copy.md"));
        assert_eq!(fs::read_to_string(&copy).unwrap(), fs::read_to_string(&p).unwrap());
        assert_eq!(trash_item(&root, &copy).unwrap().kind, "note");
    }

    #[test]
    fn boards_are_listed_and_duplicated_with_their_extension() {
        let (_d, root) = ws();
        let (proj, _) = create_project(&root, "P", None).unwrap();
        fs::write(proj.join("Sprint.avenboard"), json!({"type":"aven-board","version":1,"id":"b1","title":"Sprint","columns":[],"cards":{}}).to_string()).unwrap();
        let info = init_workspace_dir(&root, "x").unwrap();
        let tree = scan_workspace(None, &info).unwrap();
        assert_eq!(tree.projects[0].root.boards[0].id, "b1");
        assert!(tree.projects[0].root.drawings.is_empty());
        let copy = duplicate(&proj.join("Sprint.avenboard")).unwrap();
        assert!(copy.ends_with("Sprint copy.avenboard"));
        let v: Value = serde_json::from_str(&fs::read_to_string(&copy).unwrap()).unwrap();
        assert_ne!(v["id"], "b1");
        assert_eq!(trash_item(&root, &copy).unwrap().kind, "board");
    }

    #[test]
    fn trash_restore_and_purge() {
        let (_d, root) = ws();
        let (proj, _) = create_project(&root, "P", None).unwrap();
        let f = proj.join("x.aven");
        fs::write(&f, drawing("x", "X")).unwrap();
        let t = trash_item(&root, &f).unwrap();
        assert!(!f.exists());
        assert_eq!(list_trash(&root).len(), 1);
        let back = restore_trash(&root, &t.id).unwrap();
        assert_eq!(back, f);
        assert!(f.exists() && list_trash(&root).is_empty());
        let t2 = trash_item(&root, &proj).unwrap();
        assert_eq!(t2.kind, "project");
        assert_eq!(purge_trash(&root, None, Some(30)).unwrap(), 0, "recent items are kept");
        assert_eq!(purge_trash(&root, None, None).unwrap(), 1);
        assert!(trash_item(&root, Path::new("C:/Windows")).is_err());
    }

    #[test]
    fn duplicate_gives_new_ids() {
        let (_d, root) = ws();
        let (proj, meta) = create_project(&root, "P", None).unwrap();
        fs::write(proj.join("x.aven"), drawing("x", "X")).unwrap();
        let copy = duplicate(&proj).unwrap();
        let m2: Value = serde_json::from_str(&fs::read_to_string(copy.join(PROJECT_FILE)).unwrap()).unwrap();
        assert_ne!(m2["id"], meta["id"]);
        let d2: Value = serde_json::from_str(&fs::read_to_string(copy.join("x.aven")).unwrap()).unwrap();
        assert_ne!(d2["id"], "x");
        let fcopy = duplicate(&proj.join("x.aven")).unwrap();
        assert!(fcopy.ends_with("x copy.aven"));
    }

    #[test]
    fn write_with_backups_conflicts_and_validation() {
        let (_d, root) = ws();
        let f = root.join("Drawings/d.aven");
        let policy = BackupPolicy { enabled: true, min_interval_sec: 0, keep: 2 };
        let r1 = write_drawing(Some(&root), &f, &drawing("d", "v1"), "d", &policy, None).unwrap();
        assert!(!r1.backup_created, "nothing to back up on first save");
        for v in ["v2", "v3", "v4"] {
            std::thread::sleep(std::time::Duration::from_millis(5));
            write_drawing(Some(&root), &f, &drawing("d", v), "d", &policy, None).unwrap();
        }
        let b = list_backups(&root, "d");
        assert_eq!(b.len(), 2, "rotation keeps only the newest backups");
        assert!(fs::read_to_string(&b[0].path).unwrap().contains("v3"));
        assert!(write_drawing(Some(&root), &f, "{not json", "d", &policy, None).is_err());
        assert!(fs::read_to_string(&f).unwrap().contains("v4"), "bad data never replaces good data");
        let stale = write_drawing(Some(&root), &f, &drawing("d", "v5"), "d", &policy, Some(1));
        assert!(matches!(stale, Err(AppError::Conflict(_))));
        assert!(matches!(read_drawing(&root.join("missing.aven")), Err(AppError::Io(_))));
        fs::write(root.join("Drawings/bad.aven"), "[1,").unwrap();
        assert!(matches!(read_drawing(&root.join("Drawings/bad.aven")), Err(AppError::Corrupt(_))));
    }

    #[test]
    fn archive_roundtrip_and_rename() {
        let (_d, root) = ws();
        let (proj, _) = create_project(&root, "Old", None).unwrap();
        let a = set_archived(&root, &proj, true).unwrap();
        assert!(a.starts_with(root.join("Archives")));
        let p = set_archived(&root, &a, false).unwrap();
        assert!(p.starts_with(root.join("Projects")));
        let renamed = rename_item(&p, "old").unwrap();
        assert_eq!(renamed.file_name().unwrap(), "old");
        assert!(move_into(&renamed, &renamed.join("x")).is_err());
    }
}
