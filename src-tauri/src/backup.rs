//! Workspace / project archives (zip) and crash-recovery snapshots.
use crate::error::{AppError, AppResult};
use crate::fsops::{atomic_write, mtime_ms, now_ms, safe_name, unique_path};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

/// Folders inside `.aven/` that are caches and can be skipped in archives.
const SKIP: [&str; 3] = [".aven/thumbs", ".aven/trash", ".aven/snapshots"];

fn rel_unix(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/")
}

/// Zip a folder. `include_backups` controls whether `.aven/backups` is archived too.
pub fn zip_dir(src: &Path, dest_file: &Path, include_backups: bool) -> AppResult<u64> {
    if let Some(p) = dest_file.parent() {
        fs::create_dir_all(p)?;
    }
    let tmp = dest_file.with_extension("partial");
    {
        let file = File::create(&tmp)?;
        let mut zw = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(true);
        for entry in walkdir::WalkDir::new(src).min_depth(1).into_iter().filter_entry(|e| {
            let rel = rel_unix(src, e.path());
            !SKIP.iter().any(|s| rel == *s || rel.starts_with(&format!("{s}/")))
                && (include_backups || !(rel == ".aven/backups" || rel.starts_with(".aven/backups/")))
                && !rel.ends_with(".tmp")
        }) {
            let entry = entry.map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
            let rel = rel_unix(src, entry.path());
            if entry.file_type().is_dir() {
                zw.add_directory(format!("{rel}/"), opts)?;
            } else {
                zw.start_file(rel, opts)?;
                let mut f = File::open(entry.path())?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)?;
                zw.write_all(&buf)?;
            }
        }
        zw.finish()?.sync_all()?;
    }
    if dest_file.exists() {
        fs::remove_file(dest_file)?;
    }
    fs::rename(&tmp, dest_file)?;
    Ok(fs::metadata(dest_file)?.len())
}

/// Extract an archive into `dest` (which must not exist yet). Rejects path traversal.
pub fn unzip_to(zip_file: &Path, dest: &Path) -> AppResult<()> {
    if dest.exists() && fs::read_dir(dest)?.next().is_some() {
        return Err(AppError::Conflict(format!("{} is not empty.", dest.display())));
    }
    let mut archive = zip::ZipArchive::new(File::open(zip_file)?)?;
    fs::create_dir_all(dest)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(rel) = entry.enclosed_name() else {
            return Err(AppError::Invalid(format!("Unsafe path in archive: {}", entry.name())));
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(p) = out.parent() {
                fs::create_dir_all(p)?;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            fs::write(&out, buf)?;
        }
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: i64,
}

/// Write a timestamped workspace snapshot into `dest_dir` and keep the newest `keep`.
pub fn snapshot_workspace(root: &Path, ws_name: &str, dest_dir: &Path, keep: usize) -> AppResult<SnapshotInfo> {
    if dest_dir.starts_with(root) && !dest_dir.starts_with(root.join(".aven")) {
        return Err(AppError::Invalid("Choose a backup folder outside the workspace content.".into()));
    }
    let name = format!("{} {}.avenbackup", safe_name(ws_name), chrono::Local::now().format("%Y-%m-%d %H-%M-%S"));
    let file = dest_dir.join(&name);
    let size = zip_dir(root, &file, true)?;
    let mut all = list_snapshots(dest_dir, ws_name);
    all.sort_by(|a, b| b.created.cmp(&a.created));
    for old in all.iter().skip(keep.max(1)) {
        let _ = fs::remove_file(&old.path);
    }
    Ok(SnapshotInfo { name, path: file.to_string_lossy().to_string(), size, created: now_ms() })
}

pub fn list_snapshots(dir: &Path, ws_name: &str) -> Vec<SnapshotInfo> {
    let prefix = safe_name(ws_name);
    let mut v: Vec<SnapshotInfo> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.ends_with(".avenbackup") && n.starts_with(&prefix)
                })
                .filter_map(|e| {
                    let m = e.metadata().ok()?;
                    Some(SnapshotInfo {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: e.path().to_string_lossy().to_string(),
                        size: m.len(),
                        created: mtime_ms(&m),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| b.created.cmp(&a.created));
    v
}

/// Restore a snapshot as a NEW folder next to `parent` (never overwrites the original).
pub fn restore_snapshot(zip_file: &Path, parent: &Path, name: &str) -> AppResult<PathBuf> {
    let target = unique_path(&parent.join(safe_name(name)));
    unzip_to(zip_file, &target)?;
    Ok(target)
}

// ---------------------------------------------------------------- recovery

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntry {
    pub drawing_id: String,
    pub path: String,
    pub title: String,
    pub saved_at: i64,
    #[serde(default)]
    pub content: String,
}

fn recovery_file(data_dir: &Path, id: &str) -> PathBuf {
    data_dir.join("recovery").join(format!("{}.json", safe_name(id)))
}

pub fn write_recovery(data_dir: &Path, entry: &RecoveryEntry) -> AppResult<()> {
    atomic_write(&recovery_file(data_dir, &entry.drawing_id), serde_json::to_string(entry)?.as_bytes())
}

pub fn list_recovery(data_dir: &Path) -> Vec<RecoveryEntry> {
    fs::read_dir(data_dir.join("recovery"))
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let text = fs::read_to_string(e.path()).ok()?;
                    let mut r: RecoveryEntry = serde_json::from_str(&text).ok()?;
                    r.content.clear(); // listing stays light; content is read on demand
                    Some(r)
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn read_recovery(data_dir: &Path, id: &str) -> AppResult<RecoveryEntry> {
    Ok(serde_json::from_str(&fs::read_to_string(recovery_file(data_dir, id))?)?)
}

pub fn clear_recovery(data_dir: &Path, id: &str) -> AppResult<()> {
    let f = recovery_file(data_dir, id);
    if f.exists() {
        fs::remove_file(f)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::init_workspace_dir;

    #[test]
    fn snapshot_and_restore_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("WS");
        init_workspace_dir(&root, "My WS").unwrap();
        fs::write(root.join("Drawings/a.aven"), "{\"id\":\"a\"}").unwrap();
        fs::create_dir_all(root.join(".aven/thumbs")).unwrap();
        fs::write(root.join(".aven/thumbs/a.png"), "x").unwrap();
        let out = d.path().join("backups");
        let s1 = snapshot_workspace(&root, "My WS", &out, 2).unwrap();
        assert!(s1.size > 0);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        snapshot_workspace(&root, "My WS", &out, 2).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        snapshot_workspace(&root, "My WS", &out, 2).unwrap();
        assert_eq!(list_snapshots(&out, "My WS").len(), 2, "old snapshots are rotated");
        assert!(!Path::new(&s1.path).exists(), "the oldest snapshot was rotated out");
        let newest = list_snapshots(&out, "My WS").remove(0);
        let restored = restore_snapshot(Path::new(&newest.path), d.path(), "Restored").unwrap();
        assert_eq!(fs::read_to_string(restored.join("Drawings/a.aven")).unwrap(), "{\"id\":\"a\"}");
        assert!(!restored.join(".aven/thumbs").exists(), "caches are not archived");
        assert!(restore_snapshot(Path::new(&newest.path), d.path(), "Restored").unwrap().ends_with("Restored (2)"));
        assert!(snapshot_workspace(&root, "My WS", &root.join("Projects"), 2).is_err());
    }

    #[test]
    fn recovery_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        let e = RecoveryEntry { drawing_id: "id1".into(), path: "p".into(), title: "T".into(), saved_at: 1, content: "{}".into() };
        write_recovery(d.path(), &e).unwrap();
        let l = list_recovery(d.path());
        assert_eq!(l.len(), 1);
        assert!(l[0].content.is_empty());
        assert_eq!(read_recovery(d.path(), "id1").unwrap().content, "{}");
        clear_recovery(d.path(), "id1").unwrap();
        assert!(list_recovery(d.path()).is_empty());
    }
}
