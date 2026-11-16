//! SQLite metadata store: recent files, drawing header cache, full-text search and the
//! link graph between drawings. Everything here can be rebuilt from the workspace files,
//! so the files on disk stay the single source of truth.
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub struct Db {
    pub conn: Connection,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub drawing_id: String,
    pub title: String,
    pub workspace_id: String,
    pub opened_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchDoc {
    pub path: String,
    pub drawing_id: String,
    pub workspace_id: String,
    pub kind: String,
    pub title: String,
    pub project: String,
    pub body: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub drawing_id: String,
    pub workspace_id: String,
    pub kind: String,
    pub title: String,
    pub project: String,
    pub snippet: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkRow {
    pub source_id: String,
    pub source_path: String,
    pub source_title: String,
    pub target_id: String,
    pub label: String,
}

pub struct CachedHeader {
    pub id: String,
    pub title: String,
    pub created: i64,
    pub updated: i64,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> AppResult<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS recents(
                path TEXT PRIMARY KEY, drawing_id TEXT NOT NULL, title TEXT NOT NULL,
                workspace_id TEXT NOT NULL, opened_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS file_index(
                path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
                id TEXT NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
             CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
                path UNINDEXED, drawing_id UNINDEXED, workspace_id UNINDEXED, kind UNINDEXED,
                title, project, body, tokenize='unicode61 remove_diacritics 2');
             CREATE TABLE IF NOT EXISTS links(
                source_id TEXT NOT NULL, source_path TEXT NOT NULL, source_title TEXT NOT NULL,
                target_id TEXT NOT NULL, label TEXT NOT NULL DEFAULT '');
             CREATE INDEX IF NOT EXISTS links_target ON links(target_id);
             CREATE INDEX IF NOT EXISTS links_source ON links(source_id);
             INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', '1');",
        )?;
        Ok(Db { conn })
    }

    // ---------- recents
    pub fn add_recent(&self, r: &RecentEntry) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO recents(path, drawing_id, title, workspace_id, opened_at) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(path) DO UPDATE SET drawing_id=?2, title=?3, workspace_id=?4, opened_at=?5",
            params![r.path, r.drawing_id, r.title, r.workspace_id, r.opened_at],
        )?;
        // keep the table small
        self.conn.execute(
            "DELETE FROM recents WHERE path NOT IN (SELECT path FROM recents ORDER BY opened_at DESC LIMIT 200)",
            [],
        )?;
        Ok(())
    }

    pub fn list_recents(&self, workspace_id: Option<&str>, limit: i64) -> AppResult<Vec<RecentEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT path, drawing_id, title, workspace_id, opened_at FROM recents
             WHERE (?1 IS NULL OR workspace_id = ?1) ORDER BY opened_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![workspace_id, limit], |r| {
            Ok(RecentEntry {
                path: r.get(0)?,
                drawing_id: r.get(1)?,
                title: r.get(2)?,
                workspace_id: r.get(3)?,
                opened_at: r.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn remove_recent(&self, path: &str) -> AppResult<()> {
        self.conn.execute("DELETE FROM recents WHERE path = ?1", params![path])?;
        Ok(())
    }

    /// Re-point records after a file or folder was moved/renamed.
    pub fn rename_prefix(&self, from: &str, to: &str) -> AppResult<()> {
        for table in ["recents", "file_index", "search"] {
            let sql = format!(
                "UPDATE {table} SET path = ?2 || substr(path, length(?1) + 1) WHERE path = ?1 OR path LIKE ?3"
            );
            let like = format!("{}{}%", from.replace('%', "\\%"), std::path::MAIN_SEPARATOR);
            self.conn.execute(&sql, params![from, to, like])?;
        }
        self.conn.execute(
            "UPDATE links SET source_path = ?2 || substr(source_path, length(?1) + 1) WHERE source_path = ?1 OR source_path LIKE ?3",
            params![from, to, format!("{}{}%", from, std::path::MAIN_SEPARATOR)],
        )?;
        Ok(())
    }

    // ---------- header cache
    pub fn cached_header(&self, path: &str, mtime: i64, size: i64) -> AppResult<Option<CachedHeader>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, title, created, updated FROM file_index WHERE path=?1 AND mtime=?2 AND size=?3",
                params![path, mtime, size],
                |r| {
                    Ok(CachedHeader { id: r.get(0)?, title: r.get(1)?, created: r.get(2)?, updated: r.get(3)? })
                },
            )
            .optional()?)
    }

    pub fn store_header(&self, path: &str, mtime: i64, size: i64, h: &CachedHeader) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO file_index(path, mtime, size, id, title, created, updated) VALUES(?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(path) DO UPDATE SET mtime=?2, size=?3, id=?4, title=?5, created=?6, updated=?7",
            params![path, mtime, size, h.id, h.title, h.created, h.updated],
        )?;
        Ok(())
    }

    // ---------- search
    pub fn index_doc(&self, d: &SearchDoc) -> AppResult<()> {
        self.conn.execute("DELETE FROM search WHERE path = ?1", params![d.path])?;
        self.conn.execute(
            "INSERT INTO search(path, drawing_id, workspace_id, kind, title, project, body) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![d.path, d.drawing_id, d.workspace_id, d.kind, d.title, d.project, d.body],
        )?;
        Ok(())
    }

    pub fn unindex(&self, path: &str) -> AppResult<()> {
        let like = format!("{}{}%", path, std::path::MAIN_SEPARATOR);
        self.conn.execute("DELETE FROM search WHERE path = ?1 OR path LIKE ?2", params![path, like])?;
        self.conn.execute("DELETE FROM file_index WHERE path = ?1 OR path LIKE ?2", params![path, like])?;
        Ok(())
    }

    pub fn search(&self, query: &str, workspace_id: Option<&str>, limit: i64) -> AppResult<Vec<SearchHit>> {
        let fts = to_fts_query(query);
        if fts.is_empty() {
            return Ok(vec![]);
        }
        let mut stmt = self.conn.prepare(
            "SELECT path, drawing_id, workspace_id, kind, title, project,
                    snippet(search, 6, '[', ']', '…', 12)
             FROM search WHERE search MATCH ?1 AND (?2 IS NULL OR workspace_id = ?2)
             ORDER BY bm25(search, 0, 0, 0, 0, 8.0, 3.0, 1.0) LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![fts, workspace_id, limit], |r| {
            Ok(SearchHit {
                path: r.get(0)?,
                drawing_id: r.get(1)?,
                workspace_id: r.get(2)?,
                kind: r.get(3)?,
                title: r.get(4)?,
                project: r.get(5)?,
                snippet: r.get(6)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ---------- links
    pub fn set_links(&self, source_id: &str, source_path: &str, source_title: &str, targets: &[(String, String)]) -> AppResult<()> {
        self.conn.execute("DELETE FROM links WHERE source_id = ?1", params![source_id])?;
        for (target, label) in targets {
            self.conn.execute(
                "INSERT INTO links(source_id, source_path, source_title, target_id, label) VALUES(?1,?2,?3,?4,?5)",
                params![source_id, source_path, source_title, target, label],
            )?;
        }
        Ok(())
    }

    pub fn backlinks(&self, target_id: &str) -> AppResult<Vec<LinkRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT source_id, source_path, source_title, target_id, label FROM links WHERE target_id = ?1",
        )?;
        let rows = stmt.query_map(params![target_id], map_link)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn all_links(&self) -> AppResult<Vec<LinkRow>> {
        let mut stmt = self.conn.prepare("SELECT source_id, source_path, source_title, target_id, label FROM links")?;
        let rows = stmt.query_map([], map_link)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

fn map_link(r: &rusqlite::Row) -> rusqlite::Result<LinkRow> {
    Ok(LinkRow {
        source_id: r.get(0)?,
        source_path: r.get(1)?,
        source_title: r.get(2)?,
        target_id: r.get(3)?,
        label: r.get(4)?,
    })
}

/// Turn free text into a safe FTS5 prefix query: `foo bar` → `"foo"* "bar"*`.
pub fn to_fts_query(q: &str) -> String {
    q.split_whitespace()
        .map(|t| t.replace('"', ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(path: &str, title: &str, body: &str) -> SearchDoc {
        SearchDoc {
            path: path.into(),
            drawing_id: format!("id-{path}"),
            workspace_id: "w1".into(),
            kind: "drawing".into(),
            title: title.into(),
            project: "Proj".into(),
            body: body.into(),
        }
    }

    #[test]
    fn search_finds_by_title_and_body_with_prefix_and_accents() {
        let db = Db::open_in_memory().unwrap();
        db.index_doc(&doc("a", "Roadmap Q3", "launch plan marketing")).unwrap();
        db.index_doc(&doc("b", "Café menu", "espresso")).unwrap();
        assert_eq!(db.search("road", None, 10).unwrap()[0].path, "a");
        assert_eq!(db.search("market", None, 10).unwrap()[0].path, "a");
        assert_eq!(db.search("cafe", None, 10).unwrap()[0].path, "b");
        assert!(db.search("zzz", None, 10).unwrap().is_empty());
        assert!(db.search("\"", None, 10).unwrap().is_empty());
        // re-indexing replaces the old entry
        db.index_doc(&doc("a", "Renamed", "nothing")).unwrap();
        assert!(db.search("road", None, 10).unwrap().is_empty());
    }

    #[test]
    fn recents_and_rename() {
        let db = Db::open_in_memory().unwrap();
        let sep = std::path::MAIN_SEPARATOR;
        let p = format!("C:{sep}W{sep}P{sep}d.aven");
        db.add_recent(&RecentEntry { path: p.clone(), drawing_id: "1".into(), title: "d".into(), workspace_id: "w".into(), opened_at: 5 }).unwrap();
        db.rename_prefix(&format!("C:{sep}W{sep}P"), &format!("C:{sep}W{sep}Q")).unwrap();
        let r = db.list_recents(Some("w"), 10).unwrap();
        assert_eq!(r[0].path, format!("C:{sep}W{sep}Q{sep}d.aven"));
    }

    #[test]
    fn links_and_backlinks() {
        let db = Db::open_in_memory().unwrap();
        db.set_links("a", "/a", "A", &[("b".into(), "see".into()), ("c".into(), "".into())]).unwrap();
        db.set_links("a", "/a", "A", &[("b".into(), "see".into())]).unwrap();
        assert_eq!(db.backlinks("b").unwrap().len(), 1);
        assert!(db.backlinks("c").unwrap().is_empty());
    }
}
