use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name:   String,
    pub path:   String,
    pub is_dir: bool,
    pub size:   u64,
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let mut dir = tokio::fs::read_dir(&path).await.map_err(|e| e.to_string())?;
    let mut result: Vec<FileEntry> = Vec::new();

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let p    = entry.path();
        let name = match p.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None    => continue,
        };
        let meta = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };
        result.push(FileEntry {
            name,
            path:   p.to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size:   meta.len(),
        });
    }

    // Dirs first, then alphabetical
    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    tokio::fs::metadata(&path).await.is_ok()
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if meta.is_dir() {
        tokio::fs::remove_dir_all(&path).await.map_err(|e| e.to_string())
    } else {
        tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn rename_path(from: String, to: String) -> Result<(), String> {
    tokio::fs::rename(&from, &to).await.map_err(|e| e.to_string())
}

/// Read any file as a base64-encoded data URL (for binary assets like images).
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let b64   = STANDARD.encode(&bytes);
    // Detect MIME type from extension
    let mime = match PathBuf::from(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png")                => "image/png",
        Some("gif")                => "image/gif",
        Some("webp")               => "image/webp",
        Some("avif")               => "image/avif",
        Some("svg")                => "image/svg+xml",
        _                          => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// Return all interactive shells listed in /etc/shells.
#[tauri::command]
pub async fn get_shells() -> Vec<String> {
    let default_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    match tokio::fs::read_to_string("/etc/shells").await {
        Ok(content) => {
            let mut shells: Vec<String> = content
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty() && !l.starts_with('#') && l.starts_with('/'))
                .collect();
            // Put the default shell first
            if let Some(pos) = shells.iter().position(|s| s == &default_shell) {
                shells.swap(0, pos);
            } else {
                shells.insert(0, default_shell);
            }
            shells.dedup();
            shells
        }
        Err(_) => vec![default_shell],
    }
}

#[tauri::command]
pub async fn get_cwd() -> Result<String, String> {
    let mut path = std::env::current_dir().map_err(|e| e.to_string())?;
    if path.file_name().map(|n| n == "src-tauri").unwrap_or(false) {
        if let Some(parent) = path.parent() {
            path = parent.to_path_buf();
        }
    }
    Ok(path.to_string_lossy().to_string())
}
