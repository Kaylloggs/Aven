//! Tauri command surface. Each command is a thin wrapper over the modules above.
use crate::backup::{self, RecoveryEntry, SnapshotInfo};
use crate::db::{Db, LinkRow, RecentEntry, SearchDoc, SearchHit};
use crate::error::{AppError, AppResult};
use crate::fsops::{self, atomic_write, now_ms, safe_name, unique_path};
use crate::integrations::{self, UploadResult, VaultInfo};
use crate::workspace::{self as ws, BackupPolicy, FileEntry, Registry, TrashEntry, WorkspaceInfo, WorkspaceTree, WriteResult};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Db>,
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub documents_dir: Option<PathBuf>,
}

impl AppState {
    fn registry(&self) -> Registry {
        ws::load_registry(&self.config_dir)
    }
    fn workspace(&self, id: &str) -> AppResult<WorkspaceInfo> {
        self.registry()
            .workspaces
            .into_iter()
            .find(|w| w.id == id)
            .ok_or_else(|| AppError::NotFound("This workspace is no longer registered.".into()))
    }
    fn root(&self, id: &str) -> AppResult<PathBuf> {
        Ok(PathBuf::from(self.workspace(id)?.path))
    }
}

fn b64(data: &str) -> AppResult<Vec<u8>> {
    let raw = data.split_once("base64,").map(|(_, d)| d).unwrap_or(data);
    base64::engine::general_purpose::STANDARD.decode(raw).map_err(|e| AppError::Invalid(e.to_string()))
}

// ---------------------------------------------------------------- app

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    config_dir: String,
    data_dir: String,
    documents_dir: Option<String>,
    version: String,
}

#[tauri::command]
pub fn app_paths(state: State<AppState>) -> AppPaths {
    AppPaths {
        config_dir: state.config_dir.to_string_lossy().into(),
        data_dir: state.data_dir.to_string_lossy().into(),
        documents_dir: state.documents_dir.as_ref().map(|d| d.to_string_lossy().into()),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

/// A `.aven` file passed on the command line (double-click in Explorer).
#[tauri::command]
pub fn startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".aven") && Path::new(a).is_file())
}

#[tauri::command]
pub fn settings_load(state: State<AppState>) -> Value {
    std::fs::read_to_string(state.config_dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn settings_save(state: State<AppState>, settings: Value) -> AppResult<()> {
    atomic_write(&state.config_dir.join("settings.json"), serde_json::to_string_pretty(&settings)?.as_bytes())
}

// ---------------------------------------------------------------- workspaces

#[tauri::command]
pub fn ws_list(state: State<AppState>) -> Registry {
    state.registry()
}

fn register(state: &AppState, info: WorkspaceInfo) -> AppResult<WorkspaceInfo> {
    let mut reg = state.registry();
    reg.workspaces.retain(|w| w.id != info.id && w.path != info.path);
    reg.workspaces.push(info.clone());
    reg.active = Some(info.id.clone());
    ws::save_registry(&state.config_dir, &reg)?;
    Ok(info)
}

#[tauri::command]
pub fn ws_create(state: State<AppState>, name: String, parent: String) -> AppResult<WorkspaceInfo> {
    let root = unique_path(&Path::new(&parent).join(safe_name(&name)));
    let info = ws::init_workspace_dir(&root, &name)?;
    register(&state, info)
}

#[tauri::command]
pub fn ws_open_folder(state: State<AppState>, path: String) -> AppResult<WorkspaceInfo> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(AppError::NotFound(format!("{path} does not exist.")));
    }
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Workspace".into());
    let info = ws::init_workspace_dir(p, &name)?;
    register(&state, info)
}

#[tauri::command]
pub fn ws_set_active(state: State<AppState>, id: String) -> AppResult<()> {
    let mut reg = state.registry();
    if let Some(w) = reg.workspaces.iter_mut().find(|w| w.id == id) {
        w.last_opened_at = now_ms();
    }
    reg.active = Some(id);
    ws::save_registry(&state.config_dir, &reg)
}

#[tauri::command]
pub fn ws_forget(state: State<AppState>, id: String) -> AppResult<()> {
    let mut reg = state.registry();
    reg.workspaces.retain(|w| w.id != id);
    if reg.active.as_deref() == Some(id.as_str()) {
        reg.active = reg.workspaces.first().map(|w| w.id.clone());
    }
    ws::save_registry(&state.config_dir, &reg)
}

#[tauri::command]
pub fn ws_rename(state: State<AppState>, id: String, name: String) -> AppResult<()> {
    let root = state.root(&id)?;
    ws::rename_workspace_file(&root, &name)?;
    let mut reg = state.registry();
    if let Some(w) = reg.workspaces.iter_mut().find(|w| w.id == id) {
        w.name = name;
    }
    ws::save_registry(&state.config_dir, &reg)
}

/// Move a whole workspace folder to a new parent folder (safe: copy, verify, then delete).
#[tauri::command]
pub fn ws_relocate(state: State<AppState>, id: String, new_parent: String) -> AppResult<WorkspaceInfo> {
    let mut info = state.workspace(&id)?;
    let src = PathBuf::from(&info.path);
    let target = unique_path(&Path::new(&new_parent).join(src.file_name().unwrap()));
    if target.starts_with(&src) {
        return Err(AppError::Invalid("Pick a folder outside the workspace.".into()));
    }
    fsops::copy_dir(&src, &target)?;
    if fsops::dir_size(&target) != fsops::dir_size(&src) {
        let _ = std::fs::remove_dir_all(&target);
        return Err(AppError::Io(std::io::Error::other("Copy verification failed; nothing was moved.")));
    }
    std::fs::remove_dir_all(&src)?;
    state.db.lock().unwrap().rename_prefix(&info.path, &target.to_string_lossy())?;
    info.path = target.to_string_lossy().to_string();
    info.available = true;
    register(&state, info)
}

#[tauri::command]
pub fn ws_scan(state: State<AppState>, id: String) -> AppResult<WorkspaceTree> {
    let info = state.workspace(&id)?;
    let db = state.db.lock().unwrap();
    ws::scan_workspace(Some(&db), &info)
}

#[tauri::command]
pub fn ws_save_state(state: State<AppState>, id: String, data: Value) -> AppResult<()> {
    let root = state.root(&id)?;
    atomic_write(&root.join(".aven/state.json"), serde_json::to_string_pretty(&data)?.as_bytes())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    total: u64,
    content: u64,
    backups: u64,
    thumbnails: u64,
    trash: u64,
    path: String,
}

#[tauri::command]
pub fn ws_storage(state: State<AppState>, id: String) -> AppResult<StorageUsage> {
    let root = state.root(&id)?;
    let backups = fsops::dir_size(&root.join(".aven/backups"));
    let thumbnails = fsops::dir_size(&root.join(".aven/thumbs"));
    let trash = fsops::dir_size(&root.join(".aven/trash"));
    let total = fsops::dir_size(&root);
    Ok(StorageUsage { total, content: total.saturating_sub(backups + thumbnails + trash), backups, thumbnails, trash, path: root.to_string_lossy().into() })
}

// ---------------------------------------------------------------- projects & items

#[tauri::command]
pub fn project_create(state: State<AppState>, ws_id: String, name: String, meta: Option<Value>) -> AppResult<(String, Value)> {
    let root = state.root(&ws_id)?;
    let (p, v) = ws::create_project(&root, &name, meta)?;
    Ok((p.to_string_lossy().into(), v))
}

#[tauri::command]
pub fn project_save_meta(path: String, meta: Value) -> AppResult<()> {
    atomic_write(&Path::new(&path).join(ws::PROJECT_FILE), serde_json::to_string_pretty(&meta)?.as_bytes())
}

#[tauri::command]
pub fn project_set_archived(state: State<AppState>, ws_id: String, path: String, archived: bool) -> AppResult<String> {
    let root = state.root(&ws_id)?;
    let target = ws::set_archived(&root, Path::new(&path), archived)?;
    let t = target.to_string_lossy().to_string();
    state.db.lock().unwrap().rename_prefix(&path, &t)?;
    Ok(t)
}

#[tauri::command]
pub fn folder_create(parent: String, name: String) -> AppResult<String> {
    let p = unique_path(&Path::new(&parent).join(safe_name(&name)));
    std::fs::create_dir_all(&p)?;
    Ok(p.to_string_lossy().into())
}

#[tauri::command]
pub fn item_rename(state: State<AppState>, path: String, name: String) -> AppResult<String> {
    let t = ws::rename_item(Path::new(&path), &name)?.to_string_lossy().to_string();
    state.db.lock().unwrap().rename_prefix(&path, &t)?;
    Ok(t)
}

#[tauri::command]
pub fn item_move(state: State<AppState>, path: String, dest_dir: String) -> AppResult<String> {
    let t = ws::move_into(Path::new(&path), Path::new(&dest_dir))?.to_string_lossy().to_string();
    state.db.lock().unwrap().rename_prefix(&path, &t)?;
    Ok(t)
}

#[tauri::command]
pub fn item_duplicate(path: String) -> AppResult<String> {
    Ok(ws::duplicate(Path::new(&path))?.to_string_lossy().into())
}

#[tauri::command]
pub fn item_trash(state: State<AppState>, ws_id: String, path: String) -> AppResult<TrashEntry> {
    let root = state.root(&ws_id)?;
    let t = ws::trash_item(&root, Path::new(&path))?;
    let db = state.db.lock().unwrap();
    db.unindex(&path)?;
    db.remove_recent(&path)?;
    Ok(t)
}

#[tauri::command]
pub fn trash_restore(state: State<AppState>, ws_id: String, id: String) -> AppResult<String> {
    Ok(ws::restore_trash(&state.root(&ws_id)?, &id)?.to_string_lossy().into())
}

#[tauri::command]
pub fn trash_purge(state: State<AppState>, ws_id: String, id: Option<String>, older_than_days: Option<i64>) -> AppResult<usize> {
    ws::purge_trash(&state.root(&ws_id)?, id.as_deref(), older_than_days)
}

// ---------------------------------------------------------------- drawings

#[tauri::command]
pub fn drawing_read(path: String) -> AppResult<String> {
    ws::read_drawing(Path::new(&path))
}

#[tauri::command]
pub fn drawing_write(
    state: State<AppState>,
    ws_id: Option<String>,
    path: String,
    content: String,
    drawing_id: String,
    policy: BackupPolicy,
    expected_modified: Option<i64>,
) -> AppResult<WriteResult> {
    let root = ws_id.and_then(|id| state.root(&id).ok());
    ws::write_drawing(root.as_deref(), Path::new(&path), &content, &drawing_id, &policy, expected_modified)
}

#[tauri::command]
pub fn drawing_create(dir: String, title: String, content: String, ext: Option<String>) -> AppResult<String> {
    let ext = match ext.as_deref() {
        Some("avenboard") => ws::BOARD_EXT,
        Some("md") => ws::NOTE_EXT,
        _ => ws::DRAWING_EXT,
    };
    let p = unique_path(&Path::new(&dir).join(format!("{}.{}", safe_name(&title), ext)));
    if ext != ws::NOTE_EXT {
        serde_json::from_str::<Value>(&content)?;
    }
    atomic_write(&p, content.as_bytes())?;
    Ok(p.to_string_lossy().into())
}

#[tauri::command]
pub fn drawing_backups(state: State<AppState>, ws_id: String, drawing_id: String) -> AppResult<Vec<FileEntry>> {
    Ok(ws::list_backups(&state.root(&ws_id)?, &drawing_id))
}

#[tauri::command]
pub fn thumb_write(state: State<AppState>, ws_id: String, drawing_id: String, data: String) -> AppResult<()> {
    let root = state.root(&ws_id)?;
    atomic_write(&root.join(".aven/thumbs").join(format!("{}.png", safe_name(&drawing_id))), &b64(&data)?)
}

#[tauri::command]
pub fn thumb_read(state: State<AppState>, ws_id: String, drawing_id: String) -> AppResult<Option<String>> {
    let root = state.root(&ws_id)?;
    let f = root.join(".aven/thumbs").join(format!("{}.png", safe_name(&drawing_id)));
    Ok(std::fs::read(f).ok().map(|b| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b))))
}

// ---------------------------------------------------------------- generic files (exports)

#[tauri::command]
pub fn file_write_text(path: String, text: String) -> AppResult<()> {
    atomic_write(Path::new(&path), text.as_bytes())
}

#[tauri::command]
pub fn file_write_base64(path: String, data: String) -> AppResult<()> {
    atomic_write(Path::new(&path), &b64(&data)?)
}

#[tauri::command]
pub fn file_read_text(path: String) -> AppResult<String> {
    Ok(std::fs::read_to_string(path)?)
}

#[tauri::command]
pub fn file_read_base64(path: String) -> AppResult<String> {
    Ok(base64::engine::general_purpose::STANDARD.encode(std::fs::read(path)?))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn dir_create(path: String) -> AppResult<()> {
    Ok(std::fs::create_dir_all(path)?)
}

#[tauri::command]
pub fn unique_file_path(path: String) -> String {
    unique_path(Path::new(&path)).to_string_lossy().into()
}

// ---------------------------------------------------------------- backups & archives

#[tauri::command]
pub fn ws_snapshot(state: State<AppState>, ws_id: String, dest_dir: Option<String>, keep: usize) -> AppResult<SnapshotInfo> {
    let info = state.workspace(&ws_id)?;
    let root = PathBuf::from(&info.path);
    let dest = dest_dir.map(PathBuf::from).unwrap_or_else(|| root.join(".aven/snapshots"));
    backup::snapshot_workspace(&root, &info.name, &dest, keep)
}

#[tauri::command]
pub fn ws_snapshots(state: State<AppState>, ws_id: String, dest_dir: Option<String>) -> AppResult<Vec<SnapshotInfo>> {
    let info = state.workspace(&ws_id)?;
    let dest = dest_dir.map(PathBuf::from).unwrap_or_else(|| PathBuf::from(&info.path).join(".aven/snapshots"));
    Ok(backup::list_snapshots(&dest, &info.name))
}

#[tauri::command]
pub fn ws_restore_snapshot(state: State<AppState>, file: String, parent: String, name: String) -> AppResult<WorkspaceInfo> {
    let target = backup::restore_snapshot(Path::new(&file), Path::new(&parent), &name)?;
    // A restored copy is a distinct workspace: give it a fresh id so both can coexist.
    let wf = target.join(ws::WORKSPACE_FILE);
    if let Ok(text) = std::fs::read_to_string(&wf) {
        let mut v: Value = serde_json::from_str(&text)?;
        v["id"] = Value::String(uuid::Uuid::new_v4().to_string());
        v["name"] = Value::String(name.clone());
        atomic_write(&wf, serde_json::to_string_pretty(&v)?.as_bytes())?;
    }
    let info = ws::init_workspace_dir(&target, &name)?;
    register(&state, info)
}

#[tauri::command]
pub fn project_export(path: String, dest_file: String) -> AppResult<u64> {
    backup::zip_dir(Path::new(&path), Path::new(&dest_file), false)
}

#[tauri::command]
pub fn project_import(state: State<AppState>, ws_id: String, file: String) -> AppResult<String> {
    let root = state.root(&ws_id)?;
    let stem = Path::new(&file).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Imported".into());
    let target = unique_path(&root.join("Projects").join(safe_name(&stem)));
    backup::unzip_to(Path::new(&file), &target)?;
    // Imported projects get new identities to avoid clashing with an existing copy.
    let pf = target.join(ws::PROJECT_FILE);
    let mut meta = ws::project_meta(&target)?;
    meta["id"] = Value::String(uuid::Uuid::new_v4().to_string());
    atomic_write(&pf, serde_json::to_string_pretty(&meta)?.as_bytes())?;
    Ok(target.to_string_lossy().into())
}

#[tauri::command]
pub fn recovery_write(state: State<AppState>, entry: RecoveryEntry) -> AppResult<()> {
    backup::write_recovery(&state.data_dir, &entry)
}

#[tauri::command]
pub fn recovery_list(state: State<AppState>) -> Vec<RecoveryEntry> {
    backup::list_recovery(&state.data_dir)
}

#[tauri::command]
pub fn recovery_read(state: State<AppState>, drawing_id: String) -> AppResult<RecoveryEntry> {
    backup::read_recovery(&state.data_dir, &drawing_id)
}

#[tauri::command]
pub fn recovery_clear(state: State<AppState>, drawing_id: String) -> AppResult<()> {
    backup::clear_recovery(&state.data_dir, &drawing_id)
}

// ---------------------------------------------------------------- index (recents, search, links)

#[tauri::command]
pub fn recents_add(state: State<AppState>, entry: RecentEntry) -> AppResult<()> {
    state.db.lock().unwrap().add_recent(&entry)
}

#[tauri::command]
pub fn recents_list(state: State<AppState>, ws_id: Option<String>, limit: i64) -> AppResult<Vec<RecentEntry>> {
    state.db.lock().unwrap().list_recents(ws_id.as_deref(), limit)
}

#[tauri::command]
pub fn search_index(state: State<AppState>, doc: SearchDoc) -> AppResult<()> {
    state.db.lock().unwrap().index_doc(&doc)
}

#[tauri::command]
pub fn search_query(state: State<AppState>, query: String, ws_id: Option<String>, limit: i64) -> AppResult<Vec<SearchHit>> {
    state.db.lock().unwrap().search(&query, ws_id.as_deref(), limit)
}

#[derive(Deserialize)]
pub struct LinkTarget {
    id: String,
    label: String,
}

#[tauri::command]
pub fn links_set(state: State<AppState>, source_id: String, source_path: String, source_title: String, targets: Vec<LinkTarget>) -> AppResult<()> {
    let t: Vec<(String, String)> = targets.into_iter().map(|l| (l.id, l.label)).collect();
    state.db.lock().unwrap().set_links(&source_id, &source_path, &source_title, &t)
}

#[tauri::command]
pub fn links_backlinks(state: State<AppState>, target_id: String) -> AppResult<Vec<LinkRow>> {
    state.db.lock().unwrap().backlinks(&target_id)
}

#[tauri::command]
pub fn links_all(state: State<AppState>) -> AppResult<Vec<LinkRow>> {
    state.db.lock().unwrap().all_links()
}

// ---------------------------------------------------------------- integrations

#[tauri::command]
pub fn obsidian_vaults() -> Vec<VaultInfo> {
    integrations::detect_obsidian_vaults(None)
}

#[tauri::command]
pub fn obsidian_is_vault(path: String) -> bool {
    integrations::is_obsidian_vault(Path::new(&path))
}

#[tauri::command]
pub fn gdrive_folders() -> Vec<String> {
    integrations::detect_gdrive_folders()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    gdrive_connected: bool,
    notion_connected: bool,
}

#[tauri::command]
pub fn integrations_status() -> IntegrationStatus {
    IntegrationStatus { gdrive_connected: integrations::gdrive_connected(), notion_connected: integrations::notion_connected() }
}

#[tauri::command]
pub async fn gdrive_connect(app: tauri::AppHandle, client_id: String, client_secret: String) -> AppResult<String> {
    use tauri_plugin_opener::OpenerExt;
    integrations::gdrive_connect(&client_id, &client_secret, |url| {
        let _ = app.opener().open_url(url, None::<&str>);
    })
    .await
}

#[tauri::command]
pub fn gdrive_disconnect() -> AppResult<()> {
    integrations::gdrive_disconnect()
}

#[derive(Deserialize)]
pub struct UploadFile {
    name: String,
    mime: String,
    data: String,
}

#[tauri::command]
pub async fn gdrive_upload(folder: String, files: Vec<UploadFile>) -> AppResult<Vec<UploadResult>> {
    let mut decoded = vec![];
    for f in files {
        decoded.push((f.name, f.mime, b64(&f.data)?));
    }
    integrations::gdrive_upload(&folder, decoded).await
}

#[tauri::command]
pub fn notion_set_token(token: String) -> AppResult<()> {
    integrations::notion_set_token(&token)
}

#[tauri::command]
pub async fn notion_check() -> AppResult<String> {
    integrations::notion_check().await
}

#[tauri::command]
pub async fn notion_publish(parent_page_id: String, title: String, description: String, png: String, file_name: String) -> AppResult<UploadResult> {
    integrations::notion_publish(&parent_page_id, &title, &description, b64(&png)?, &file_name).await
}
