use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

// ── Types emitted to the frontend ────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

// ── Managed state — holds the Update object between check & install ───────────

pub struct PendingUpdate(pub Mutex<Option<tauri_plugin_updater::Update>>);

impl PendingUpdate {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Return the current running version of the app.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Check GitHub Releases for a newer version.
/// Returns Some(UpdateInfo) if one is available, None if already up to date.
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let current_version = app.package_info().version.to_string();

    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    match update {
        None => {
            *pending.0.lock().unwrap() = None;
            Ok(None)
        }
        Some(update) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                current_version,
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            };
            *pending.0.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
    }
}

/// Download and install the pending update.
/// Emits `update://progress` events during download, then relaunches the app.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "No pending update — call check_update first".to_string())?;

    let app_emit = app.clone();
    let mut downloaded: u64 = 0;

    update
        .download_and_install(
            move |chunk_len, total| {
                downloaded += chunk_len as u64;
                let _ = app_emit.emit(
                    "update://progress",
                    DownloadProgress {
                        downloaded,
                        total,
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}
