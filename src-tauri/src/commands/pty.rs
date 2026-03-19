use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

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
    let base_path = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", format!("{}:{}", shim_dir.to_string_lossy(), base_path));

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

    std::thread::spawn(move || {
        use std::sync::mpsc::RecvTimeoutError;
        const FLUSH_LEN: usize = 32 * 1024;
        let flush_interval = Duration::from_millis(8);
        let mut batch = Vec::<u8>::with_capacity(FLUSH_LEN);

        loop {
            match rx.recv_timeout(flush_interval) {
                Ok(data) => {
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
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        // Drain any final buffered output
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
