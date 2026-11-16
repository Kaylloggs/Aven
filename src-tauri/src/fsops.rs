//! Low-level, data-safe filesystem helpers.
use crate::error::{AppError, AppResult};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Atomically replace `path` with `bytes`: write a sibling temp file, fsync it, then rename
/// over the destination. A crash leaves either the old file or the new file, never a mix.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::Invalid(format!("No parent folder for {}", path.display())))?;
    fs::create_dir_all(dir)?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = dir.join(format!(".{}.{}.tmp", name, uuid::Uuid::new_v4().simple()));
    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Recursively copy a directory tree.
pub fn copy_dir(src: &Path, dest: &Path) -> AppResult<()> {
    fs::create_dir_all(dest)?;
    for entry in walkdir::WalkDir::new(src).min_depth(1) {
        let entry = entry.map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dest.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(p) = target.parent() {
                fs::create_dir_all(p)?;
            }
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Move a file or folder; falls back to copy + delete across volumes.
pub fn move_path(src: &Path, dest: &Path) -> AppResult<()> {
    if dest.exists() {
        return Err(AppError::Conflict(format!("{} already exists", dest.display())));
    }
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p)?;
    }
    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            if src.is_dir() {
                copy_dir(src, dest)?;
                fs::remove_dir_all(src)?;
            } else {
                fs::copy(src, dest)?;
                fs::remove_file(src)?;
            }
            Ok(())
        }
    }
}

pub fn dir_size(path: &Path) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// Make a string safe to use as a Windows file or folder name.
pub fn safe_name(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    out = out.trim().trim_end_matches('.').trim().to_string();
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if out.is_empty() {
        out = "Untitled".into();
    }
    if RESERVED.contains(&out.to_uppercase().as_str()) {
        out.push('_');
    }
    if out.chars().count() > 120 {
        out = out.chars().take(120).collect();
    }
    out
}

/// Return a path that does not exist yet by appending " (2)", " (3)"… before the extension.
pub fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("item").to_string();
    let ext = path.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let is_dir = path.is_dir();
    for i in 2..10_000 {
        let candidate = if is_dir {
            parent.join(format!("{} ({})", path.file_name().unwrap().to_string_lossy(), i))
        } else {
            parent.join(format!("{stem} ({i}){ext}"))
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}-{}{ext}", uuid::Uuid::new_v4().simple()))
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.aven");
        atomic_write(&p, b"one").unwrap();
        atomic_write(&p, b"two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        // no temp files left behind
        let leftovers: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(leftovers.len(), 1);
    }

    #[test]
    fn safe_name_strips_invalid_chars() {
        assert_eq!(safe_name("a/b:c*?"), "a-b-c--");
        assert_eq!(safe_name("  CON "), "CON_");
        assert_eq!(safe_name("..."), "Untitled");
    }

    #[test]
    fn unique_path_appends_counter() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.aven");
        fs::write(&p, "").unwrap();
        assert_eq!(unique_path(&p), dir.path().join("x (2).aven"));
    }

    #[test]
    fn move_and_copy_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        fs::create_dir_all(a.join("sub")).unwrap();
        fs::write(a.join("sub/f.txt"), "hi").unwrap();
        let b = dir.path().join("b");
        copy_dir(&a, &b).unwrap();
        assert_eq!(fs::read_to_string(b.join("sub/f.txt")).unwrap(), "hi");
        let c = dir.path().join("c");
        move_path(&a, &c).unwrap();
        assert!(!a.exists() && c.join("sub/f.txt").exists());
        assert!(move_path(&b, &c).is_err(), "never overwrite an existing target");
        assert_eq!(dir_size(&c), 2);
    }
}
