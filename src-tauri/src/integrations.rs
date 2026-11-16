//! Integrations: Obsidian vault detection, Google Drive (desktop sync folder + optional
//! direct API upload), Notion (optional direct API upload), and secure secret storage.
//!
//! Tokens are stored in the Windows Credential Manager through `keyring` and never sent to
//! the frontend.
use crate::error::{AppError, AppResult};
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const KEYRING_SERVICE: &str = "app.aven.desktop";

// ---------------------------------------------------------------- secrets

pub fn secret_set(key: &str, value: &str) -> AppResult<()> {
    keyring::Entry::new(KEYRING_SERVICE, key)?.set_password(value)?;
    Ok(())
}

pub fn secret_get(key: &str) -> AppResult<Option<String>> {
    match keyring::Entry::new(KEYRING_SERVICE, key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn secret_delete(key: &str) -> AppResult<()> {
    match keyring::Entry::new(KEYRING_SERVICE, key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// ---------------------------------------------------------------- Obsidian

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub name: String,
    pub path: String,
    pub exists: bool,
}

/// Read Obsidian's own vault list (%APPDATA%/obsidian/obsidian.json).
pub fn detect_obsidian_vaults(appdata: Option<PathBuf>) -> Vec<VaultInfo> {
    let Some(base) = appdata.or_else(|| std::env::var_os("APPDATA").map(PathBuf::from)) else { return vec![] };
    let Ok(text) = std::fs::read_to_string(base.join("obsidian").join("obsidian.json")) else { return vec![] };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return vec![] };
    let mut out: Vec<VaultInfo> = v["vaults"]
        .as_object()
        .map(|m| {
            m.values()
                .filter_map(|vault| vault["path"].as_str())
                .map(|p| VaultInfo {
                    name: Path::new(p).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                    path: p.to_string(),
                    exists: Path::new(p).join(".obsidian").is_dir(),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

pub fn is_obsidian_vault(path: &Path) -> bool {
    path.join(".obsidian").is_dir()
}

// ---------------------------------------------------------------- Google Drive (desktop)

/// Find Google Drive for desktop sync folders ("My Drive" in any UI language).
pub fn detect_gdrive_folders() -> Vec<String> {
    const NAMES: [&str; 10] = [
        "My Drive", "Mon Drive", "Mi unidad", "Meine Ablage", "Il mio Drive", "Meu Drive", "Mijn Drive", "Mój dysk",
        "マイドライブ", "내 드라이브",
    ];
    let mut out = vec![];
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        for n in NAMES {
            let p = Path::new(&root).join(n);
            if p.is_dir() {
                out.push(p.to_string_lossy().to_string());
            }
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        for n in ["Google Drive", "GoogleDrive"] {
            let p = Path::new(&home).join(n);
            if p.is_dir() {
                for sub in NAMES {
                    let s = p.join(sub);
                    if s.is_dir() {
                        out.push(s.to_string_lossy().to_string());
                    }
                }
                out.push(p.to_string_lossy().to_string());
            }
        }
    }
    out.dedup();
    out
}

// ---------------------------------------------------------------- Google Drive (API)

const GDRIVE_TOKEN_KEY: &str = "gdrive.refresh_token";
const GDRIVE_CLIENT_KEY: &str = "gdrive.client";

fn pkce_pair() -> (String, String) {
    use sha2::{Digest, Sha256};
    let verifier = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// OAuth 2.0 for installed apps (loopback redirect + PKCE). Opens the browser through the
/// provided callback, waits for Google to redirect back, then stores the refresh token.
pub async fn gdrive_connect(client_id: &str, client_secret: &str, open_url: impl Fn(&str)) -> AppResult<String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let (verifier, challenge) = pkce_pair();
    let state = uuid::Uuid::new_v4().simple().to_string();
    let mut auth = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", "https://www.googleapis.com/auth/drive.file")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state);
    open_url(auth.as_str());

    let accept = tokio::time::timeout(std::time::Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| AppError::Integration("Google sign-in timed out after 5 minutes.".into()))??;
    let (mut sock, _) = accept;
    let mut buf = vec![0u8; 8192];
    let n = sock.read(&mut buf).await?;
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    let path = req.split_whitespace().nth(1).unwrap_or("/");
    let url = url::Url::parse(&format!("http://127.0.0.1{path}")).unwrap();
    let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    let ok = q.get("state") == Some(&state) && q.contains_key("code");
    let page = if ok {
        "<h2 style='font-family:sans-serif'>Aven is connected to Google Drive. You can close this tab.</h2>"
    } else {
        "<h2 style='font-family:sans-serif'>Google Drive connection was cancelled.</h2>"
    };
    let _ = sock
        .write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len()).as_bytes())
        .await;
    if !ok {
        return Err(AppError::Integration(q.get("error").cloned().unwrap_or_else(|| "Sign-in was cancelled.".into())));
    }
    let code = &q["code"];
    let res: Value = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await?
        .json()
        .await?;
    let refresh = res["refresh_token"]
        .as_str()
        .ok_or_else(|| AppError::Integration(format!("Google did not return a refresh token: {res}")))?;
    secret_set(GDRIVE_TOKEN_KEY, refresh)?;
    secret_set(GDRIVE_CLIENT_KEY, &json!({ "id": client_id, "secret": client_secret }).to_string())?;
    Ok("connected".into())
}

pub fn gdrive_connected() -> bool {
    matches!(secret_get(GDRIVE_TOKEN_KEY), Ok(Some(_)))
}

pub fn gdrive_disconnect() -> AppResult<()> {
    secret_delete(GDRIVE_TOKEN_KEY)?;
    secret_delete(GDRIVE_CLIENT_KEY)
}

async fn gdrive_access_token(http: &reqwest::Client) -> AppResult<String> {
    let refresh = secret_get(GDRIVE_TOKEN_KEY)?.ok_or_else(|| AppError::Integration("Google Drive is not connected.".into()))?;
    let client: Value = serde_json::from_str(&secret_get(GDRIVE_CLIENT_KEY)?.unwrap_or_default()).unwrap_or(json!({}));
    let res: Value = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh.as_str()),
            ("client_id", client["id"].as_str().unwrap_or_default()),
            ("client_secret", client["secret"].as_str().unwrap_or_default()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await?
        .json()
        .await?;
    res["access_token"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| AppError::Integration(format!("Could not refresh the Google token: {res}")))
}

async fn gdrive_folder(http: &reqwest::Client, token: &str, name: &str) -> AppResult<String> {
    let q = format!(
        "mimeType='application/vnd.google-apps.folder' and name='{}' and trashed=false",
        name.replace('\'', "\\'")
    );
    let found: Value = http
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .query(&[("q", q.as_str()), ("fields", "files(id,name)"), ("spaces", "drive")])
        .send()
        .await?
        .json()
        .await?;
    if let Some(id) = found["files"].get(0).and_then(|f| f["id"].as_str()) {
        return Ok(id.to_string());
    }
    let created: Value = http
        .post("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .json(&json!({ "name": name, "mimeType": "application/vnd.google-apps.folder" }))
        .send()
        .await?
        .json()
        .await?;
    created["id"].as_str().map(String::from).ok_or_else(|| AppError::Integration(format!("Could not create the Drive folder: {created}")))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    pub id: String,
    pub url: String,
}

pub async fn gdrive_upload(folder_name: &str, files: Vec<(String, String, Vec<u8>)>) -> AppResult<Vec<UploadResult>> {
    let http = reqwest::Client::new();
    let token = gdrive_access_token(&http).await?;
    let folder = gdrive_folder(&http, &token, folder_name).await?;
    let mut out = vec![];
    for (name, mime, bytes) in files {
        let meta = reqwest::multipart::Part::text(json!({ "name": name, "parents": [folder] }).to_string())
            .mime_str("application/json; charset=UTF-8")?;
        let body = reqwest::multipart::Part::bytes(bytes).mime_str(&mime)?;
        let form = reqwest::multipart::Form::new().part("metadata", meta).part("file", body);
        let res: Value = http
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink")
            .bearer_auth(&token)
            .multipart(form)
            .send()
            .await?
            .json()
            .await?;
        let id = res["id"].as_str().ok_or_else(|| AppError::Integration(format!("Upload failed: {res}")))?;
        out.push(UploadResult { id: id.into(), url: res["webViewLink"].as_str().unwrap_or_default().into() });
    }
    Ok(out)
}

// ---------------------------------------------------------------- Notion (API)

const NOTION_TOKEN_KEY: &str = "notion.token";
const NOTION_VERSION: &str = "2022-06-28";

pub fn notion_connected() -> bool {
    matches!(secret_get(NOTION_TOKEN_KEY), Ok(Some(_)))
}

pub fn notion_set_token(token: &str) -> AppResult<()> {
    if token.trim().is_empty() {
        return secret_delete(NOTION_TOKEN_KEY);
    }
    secret_set(NOTION_TOKEN_KEY, token.trim())
}

fn notion_token() -> AppResult<String> {
    secret_get(NOTION_TOKEN_KEY)?.ok_or_else(|| AppError::Integration("Add a Notion integration token in Settings first.".into()))
}

pub async fn notion_check() -> AppResult<String> {
    let res: Value = reqwest::Client::new()
        .get("https://api.notion.com/v1/users/me")
        .bearer_auth(notion_token()?)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await?
        .json()
        .await?;
    res["name"]
        .as_str()
        .or(res["bot"]["workspace_name"].as_str())
        .map(String::from)
        .ok_or_else(|| AppError::Integration(res["message"].as_str().unwrap_or("Invalid Notion token.").to_string()))
}

/// Create a page under `parent_page_id` containing the uploaded image and a description.
pub async fn notion_publish(parent_page_id: &str, title: &str, description: &str, png: Vec<u8>, file_name: &str) -> AppResult<UploadResult> {
    let http = reqwest::Client::new();
    let token = notion_token()?;
    let created: Value = http
        .post("https://api.notion.com/v1/file_uploads")
        .bearer_auth(&token)
        .header("Notion-Version", NOTION_VERSION)
        .json(&json!({ "filename": file_name, "content_type": "image/png" }))
        .send()
        .await?
        .json()
        .await?;
    let upload_id = created["id"].as_str().ok_or_else(|| AppError::Integration(format!("Notion upload failed: {created}")))?.to_string();
    let part = reqwest::multipart::Part::bytes(png).file_name(file_name.to_string()).mime_str("image/png")?;
    let sent: Value = http
        .post(format!("https://api.notion.com/v1/file_uploads/{upload_id}/send"))
        .bearer_auth(&token)
        .header("Notion-Version", NOTION_VERSION)
        .multipart(reqwest::multipart::Form::new().part("file", part))
        .send()
        .await?
        .json()
        .await?;
    if sent["status"].as_str() != Some("uploaded") {
        return Err(AppError::Integration(format!("Notion upload failed: {sent}")));
    }
    let mut children = vec![json!({ "type": "image", "image": { "type": "file_upload", "file_upload": { "id": upload_id } } })];
    if !description.trim().is_empty() {
        children.push(json!({ "type": "paragraph", "paragraph": { "rich_text": [{ "type": "text", "text": { "content": description.chars().take(1900).collect::<String>() } }] } }));
    }
    let page: Value = http
        .post("https://api.notion.com/v1/pages")
        .bearer_auth(&token)
        .header("Notion-Version", NOTION_VERSION)
        .json(&json!({
            "parent": { "page_id": parent_page_id.replace('-', "") },
            "properties": { "title": { "title": [{ "text": { "content": title } }] } },
            "children": children
        }))
        .send()
        .await?
        .json()
        .await?;
    let id = page["id"].as_str().ok_or_else(|| AppError::Integration(page["message"].as_str().unwrap_or("Could not create the Notion page.").to_string()))?;
    Ok(UploadResult { id: id.into(), url: page["url"].as_str().unwrap_or_default().into() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_vaults_from_obsidian_config() {
        let d = tempfile::tempdir().unwrap();
        let vault = d.path().join("Notes");
        std::fs::create_dir_all(vault.join(".obsidian")).unwrap();
        std::fs::create_dir_all(d.path().join("obsidian")).unwrap();
        std::fs::write(
            d.path().join("obsidian/obsidian.json"),
            json!({"vaults": {"abc": {"path": vault.to_string_lossy(), "ts": 1}, "def": {"path": "Z:/gone"}}}).to_string(),
        )
        .unwrap();
        let v = detect_obsidian_vaults(Some(d.path().to_path_buf()));
        assert_eq!(v.len(), 2);
        let notes = v.iter().find(|x| x.name == "Notes").unwrap();
        assert!(notes.exists);
        assert!(is_obsidian_vault(&vault));
    }

    #[test]
    fn pkce_challenge_is_url_safe() {
        let (v, c) = pkce_pair();
        assert!(v.len() >= 43);
        assert!(!c.contains('=') && !c.contains('+') && !c.contains('/'));
    }
}
