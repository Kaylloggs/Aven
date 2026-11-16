//! Aven desktop backend: storage, safety (atomic writes, backups, recovery), indexing and
//! integrations. The drawing engine lives in the frontend; everything that touches the disk
//! or the network goes through the commands registered here.
pub mod backup;
pub mod commands;
pub mod db;
pub mod error;
pub mod fsops;
pub mod integrations;
pub mod workspace;

use commands::*;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&config_dir)?;
            std::fs::create_dir_all(&data_dir)?;
            let db = db::Db::open(&data_dir.join("aven.db"))
                .or_else(|_| {
                    // A damaged index is disposable: move it aside and start fresh.
                    let _ = std::fs::rename(data_dir.join("aven.db"), data_dir.join(format!("aven.db.broken-{}", fsops::now_ms())));
                    db::Db::open(&data_dir.join("aven.db"))
                })
                .map_err(|e| e.to_string())?;
            app.manage(AppState {
                db: Mutex::new(db),
                config_dir,
                data_dir,
                documents_dir: app.path().document_dir().ok(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_paths,
            startup_file,
            settings_load,
            settings_save,
            ws_list,
            ws_create,
            ws_open_folder,
            ws_set_active,
            ws_forget,
            ws_rename,
            ws_relocate,
            ws_scan,
            ws_save_state,
            ws_storage,
            project_create,
            project_save_meta,
            project_set_archived,
            folder_create,
            item_rename,
            item_move,
            item_duplicate,
            item_trash,
            trash_restore,
            trash_purge,
            drawing_read,
            drawing_write,
            drawing_create,
            drawing_backups,
            thumb_write,
            thumb_read,
            file_write_text,
            file_write_base64,
            file_read_text,
            file_read_base64,
            path_exists,
            dir_create,
            unique_file_path,
            ws_snapshot,
            ws_snapshots,
            ws_restore_snapshot,
            project_export,
            project_import,
            recovery_write,
            recovery_list,
            recovery_read,
            recovery_clear,
            recents_add,
            recents_list,
            search_index,
            search_query,
            links_set,
            links_backlinks,
            links_all,
            obsidian_vaults,
            obsidian_is_vault,
            gdrive_folders,
            integrations_status,
            gdrive_connect,
            gdrive_disconnect,
            gdrive_upload,
            notion_set_token,
            notion_check,
            notion_publish,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aven");
}
