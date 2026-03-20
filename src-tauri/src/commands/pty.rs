use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Resolve the user's real login PATH by running `$SHELL -l -c 'printf "%s" "$PATH"'`.
/// On macOS, GUI apps inherit a stripped PATH — this restores what the user sees in their
/// terminal (Homebrew, Go, nvm, pyenv, custom installs, etc.).
fn resolve_login_path() -> String {
    let login_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    if let Ok(out) = std::process::Command::new(&login_shell)
        .args(["-l", "-c", "printf '%s' \"$PATH\""])
        .output()
    {
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !p.is_empty() { return p; }
    }
    std::env::var("PATH").unwrap_or_default()
}

/// Returns true when `shell` is a known interactive shell (not an AI CLI binary).
/// Only real shells should receive the `-l` (login) flag.
fn is_real_shell(shell: &str) -> bool {
    let name = std::path::Path::new(shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    matches!(name, "zsh" | "bash" | "sh" | "fish" | "ksh" | "csh" | "tcsh" | "dash")
}

// MasterPty is not Send/Sync in the trait, but the Unix impl is fd-backed and safe to share.
struct RawMaster(Box<dyn MasterPty>);
unsafe impl Send for RawMaster {}
unsafe impl Sync for RawMaster {}

struct PtySession {
    writer:   Arc<Mutex<Box<dyn Write + Send>>>,
    master:   Arc<Mutex<RawMaster>>,
    shutdown: Arc<AtomicBool>,
}

pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self { sessions: Arc::new(Mutex::new(HashMap::new())) }
    }
}

#[tauri::command]
pub async fn pty_spawn(
    app:        AppHandle,
    state:      State<'_, PtyState>,
    session_id: String,
    cwd:        String,
    rows:       u16,
    cols:       u16,
    shell:      Option<String>,
    args:       Option<Vec<String>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| {
            #[cfg(target_os = "windows")]
            { "powershell.exe".to_string() }
            #[cfg(not(target_os = "windows"))]
            { "/bin/sh".to_string() }
        })
    });
    let mut cmd = CommandBuilder::new(&shell);
    // Start real shells as login shells so ~/.zprofile / /etc/profile are sourced,
    // giving the terminal the same PATH the user sees in an external terminal.
    if is_real_shell(&shell) {
        cmd.arg("-l");
    }
    // Extra args (e.g. ["--think"] for claude, nothing for regular shells).
    if let Some(extra) = args {
        for a in extra { cmd.arg(a); }
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("NOVA_TERMINAL", "1");

    // Shadow fastfetch/neofetch with no-ops by prepending a shim dir to PATH.
    let shim_dir = std::env::temp_dir().join("nova-shims");
    let _ = std::fs::create_dir_all(&shim_dir);
    for bin in &["fastfetch", "neofetch"] {
        let p = shim_dir.join(bin);
        if !p.exists() {
            if let Ok(()) = std::fs::write(&p, "#!/bin/sh\n") {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755));
                }
            }
        }
    }
    // Use the user's real login PATH instead of the stripped macOS GUI-app PATH.
    // Also explicitly prepend the most common tool locations so that ripgrep (rg),
    // fd, zoxide, bat, dust, bottom, tokei, hyperfine and similar Rust/Homebrew CLIs
    // are always found even on systems where resolve_login_path fails.
    let base_path = resolve_login_path();
    let home = dirs::home_dir().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default();
    // Ordered list: shims first, then per-user tool installs, then system Homebrew, then login PATH
    let tool_dirs = [
        shim_dir.to_string_lossy().as_ref().to_owned(),
        format!("{home}/.cargo/bin"),          // ripgrep, fd, bat, dust, bottom, tokei, hyperfine, zoxide
        format!("{home}/.local/bin"),
        "/opt/homebrew/bin".to_owned(),        // Apple Silicon Homebrew
        "/opt/homebrew/sbin".to_owned(),
        "/usr/local/bin".to_owned(),           // Intel Homebrew / manual installs
        "/usr/local/sbin".to_owned(),
        format!("{home}/go/bin"),              // Go tools
        format!("{home}/.nvm/current/bin"),    // nvm node
        format!("{home}/.volta/bin"),          // volta node
        "/usr/bin".to_owned(),
        "/bin".to_owned(),
        "/usr/sbin".to_owned(),
        "/sbin".to_owned(),
    ];
    // Merge with login PATH: tool_dirs takes priority, login PATH fills in the rest
    let mut seen = std::collections::HashSet::new();
    let mut path_parts: Vec<String> = Vec::new();
    let login_parts: Vec<String> = base_path.split(':').map(|s| s.to_owned()).collect();
    for part in tool_dirs.iter().chain(login_parts.iter()) {
        let p = part.trim().to_string();
        if !p.is_empty() && seen.insert(p.clone()) {
            path_parts.push(p);
        }
    }
    cmd.env("PATH", path_parts.join(":"));

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer   = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())? as Box<dyn Write + Send>));
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let master   = Arc::new(Mutex::new(RawMaster(pair.master)));
    let shutdown = Arc::new(AtomicBool::new(false));

    state.sessions.lock().unwrap().insert(
        session_id.clone(),
        PtySession { writer: writer.clone(), master: master.clone(), shutdown: shutdown.clone() },
    );

    // Two-thread reader design fixes the "blocked read" problem:
    //
    // OLD: Single thread — blocking read(), then check timer. Small outputs (shell
    //   prompt = 2 bytes) sit in the batch forever because read() never returns again.
    //
    // NEW:
    //   Thread 1 (reader): blocking read(), forwards raw chunks over a sync_channel.
    //   Thread 2 (emitter): recv_timeout(8ms) — flushes batch when data arrives OR
    //   when the 8ms deadline fires with no new data.
    //
    // This guarantees prompts and short outputs are displayed within ~8ms.
    let event_name = format!("pty-output-{}", session_id);
    let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(64);
    let shutdown_reader = shutdown.clone();

    std::thread::spawn(move || {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            if shutdown_reader.load(Ordering::Relaxed) { break; }
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() { break; }
                }
            }
        }
    });

    // EWMA-based adaptive flush interval.
    //
    // Problem with a fixed 8ms interval: interactive keystrokes (1–4 bytes) need fast
    // flushing, but `cat large_file` produces 50+ MB/s and re-emitting thousands of
    // tiny events per second wastes IPC budget.
    //
    // Solution — exponentially-weighted moving average of throughput:
    //   • Low throughput  (<  10 KB/s): interval = LOW_MS  (2ms)  → snappy prompts
    //   • High throughput (> 500 KB/s): interval = HIGH_MS (16ms) → fewer events
    //   • Intermediate: linearly interpolated between LOW_MS and HIGH_MS
    //   • EWMA decays toward 0 on timeout (idle) so it resets after a pause
    //
    // This is the same algorithm used in TCP congestion control and video-streaming
    // adaptive bitrate selection.
    std::thread::spawn(move || {
        use std::sync::mpsc::RecvTimeoutError;
        const FLUSH_LEN: usize  = 32 * 1024;
        const LOW_MS:    u64    = 2;
        const HIGH_MS:   u64    = 16;
        const HIGH_BPS:  f64    = 500_000.0; // bytes/sec considered "high throughput"
        const ALPHA:     f64    = 0.25;       // EWMA smoothing factor

        let mut ewma_bps: f64 = 0.0;
        let mut last_recv = std::time::Instant::now();
        let mut batch = Vec::<u8>::with_capacity(FLUSH_LEN);

        loop {
            // Adaptive interval: linear interpolation based on EWMA throughput
            let t        = (ewma_bps / HIGH_BPS).min(1.0);
            let interval = Duration::from_millis(LOW_MS + ((HIGH_MS - LOW_MS) as f64 * t) as u64);

            match rx.recv_timeout(interval) {
                Ok(data) => {
                    // Update EWMA: blend instantaneous bytes/sec into running average
                    let now = std::time::Instant::now();
                    let dt  = now.duration_since(last_recv).as_secs_f64().max(1e-9);
                    ewma_bps = ALPHA * (data.len() as f64 / dt) + (1.0 - ALPHA) * ewma_bps;
                    last_recv = now;

                    batch.extend_from_slice(&data);
                    if batch.len() >= FLUSH_LEN {
                        let text = String::from_utf8_lossy(&batch).into_owned();
                        let _ = app.emit(&event_name, text);
                        batch.clear();
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if !batch.is_empty() {
                        let text = String::from_utf8_lossy(&batch).into_owned();
                        let _ = app.emit(&event_name, text);
                        batch.clear();
                    }
                    // Decay EWMA toward 0 while idle — next interactive keypress
                    // will quickly drive the interval back down to LOW_MS.
                    ewma_bps *= 1.0 - ALPHA;
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        if !batch.is_empty() {
            let text = String::from_utf8_lossy(&batch).into_owned();
            let _ = app.emit(&event_name, text);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(
    state:      State<'_, PtyState>,
    session_id: String,
    data:       String,
) -> Result<(), String> {
    // Clone the Arc under the global lock, then release it before doing I/O.
    // This prevents the global sessions lock from being held during write_all,
    // unblocking resize and kill for other sessions.
    let writer_arc = {
        let guard = state.sessions.lock().unwrap();
        guard.get(&session_id).map(|s| s.writer.clone())
    };
    if let Some(arc) = writer_arc {
        arc.lock().unwrap().write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state:      State<'_, PtyState>,
    session_id: String,
    rows:       u16,
    cols:       u16,
) -> Result<(), String> {
    // Same pattern: clone Arc, release global lock, then resize.
    let master_arc = {
        let guard = state.sessions.lock().unwrap();
        guard.get(&session_id).map(|s| s.master.clone())
    };
    if let Some(arc) = master_arc {
        arc.lock().unwrap()
            .0
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(
    state:      State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    // Remove from map — reader thread will hit EOF or check shutdown flag next iteration.
    let session = state.sessions.lock().unwrap().remove(&session_id);
    if let Some(sess) = session {
        // Signal reader thread to stop
        sess.shutdown.store(true, Ordering::Relaxed);
        // Best-effort: send Ctrl+D (EOF) to prompt the shell to exit cleanly.
        // try_lock avoids a deadlock if the writer is currently mid-write.
        if let Ok(mut w) = sess.writer.try_lock() {
            let _ = w.write_all(&[0x04]); // Ctrl+D
        }
    }
    Ok(())
}
