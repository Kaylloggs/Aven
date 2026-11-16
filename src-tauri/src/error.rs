use serde::Serialize;

/// Error type returned to the frontend. Serialises as `{ kind, message }` so the UI can
/// react to specific failures (e.g. offer a backup restore when a file is corrupt).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Archive error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Secure storage error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Corrupt(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Integration(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Io(e) if e.kind() == std::io::ErrorKind::NotFound => "not_found",
            AppError::Io(e) if e.kind() == std::io::ErrorKind::PermissionDenied => "permission",
            AppError::Io(_) => "io",
            AppError::Json(_) => "invalid",
            AppError::Db(_) => "db",
            AppError::Zip(_) => "archive",
            AppError::Http(_) => "network",
            AppError::Keyring(_) => "secrets",
            AppError::NotFound(_) => "not_found",
            AppError::Corrupt(_) => "corrupt",
            AppError::Conflict(_) => "conflict",
            AppError::Invalid(_) => "invalid",
            AppError::Integration(_) => "integration",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
