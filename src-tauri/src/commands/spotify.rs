/// Run an AppleScript and return stdout. Used to control the local Spotify app.
#[tauri::command]
pub async fn spotify_osascript(script: String) -> Result<String, String> {
    let out = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Open a spotify: URI or https URL with macOS `open`.
#[tauri::command]
pub async fn spotify_open_url(url: String) -> Result<(), String> {
    tokio::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
