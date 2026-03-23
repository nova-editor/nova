use std::{
    collections::HashMap,
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};

// ── Process registry ──────────────────────────────────────────────────────────

fn procs() -> &'static Mutex<HashMap<u32, Child>> {
    static P: OnceLock<Mutex<HashMap<u32, Child>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── Returned to the frontend ──────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct JupyterInfo {
    pub port:     u16,
    pub token:    String,
    pub pid:      u32,
    /// "lab" or "notebook"
    pub mode:     String,
    /// Notebook filename (basename), used to build the URL
    pub filename: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Find a free TCP port by binding to :0 and immediately releasing it.
fn free_port() -> Result<u16, String> {
    let l = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
    // `l` drops here, releasing the port
}

/// Generate a simple hex token (not cryptographic, but good enough for local use).
fn make_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    let pid = std::process::id() as u64;
    let a = ns.wrapping_mul(0x9e3779b97f4a7c15).wrapping_add(pid);
    let b = a.rotate_left(17).wrapping_mul(0x6c62272e07bb0142);
    format!("{a:016x}{b:016x}")
}

/// Locate the jupyter binary. Searches PATH first, then common conda/brew locations.
fn find_jupyter() -> Result<PathBuf, String> {
    let home = dirs::home_dir().unwrap_or_default();

    // Absolute paths to try (common conda / brew installs)
    let abs: &[&str] = &[
        "/usr/local/bin/jupyter",
        "/opt/homebrew/bin/jupyter",
    ];

    let home_prefixes: &[&str] = &[
        "miniforge3/bin/jupyter",
        "miniforge-pypy3/bin/jupyter",
        "miniconda3/bin/jupyter",
        "miniconda/bin/jupyter",
        "anaconda3/bin/jupyter",
        "anaconda/bin/jupyter",
        "opt/miniconda3/bin/jupyter",
        ".local/bin/jupyter",
        ".pyenv/shims/jupyter",
    ];

    // 1. Check PATH (most common when launched from a terminal)
    if Command::new("jupyter")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        // Resolve to absolute path so child spawns cleanly
        if let Ok(out) = Command::new("which").arg("jupyter").output() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Ok(PathBuf::from(p));
            }
        }
        return Ok(PathBuf::from("jupyter"));
    }

    // 2. Try home-relative locations
    for rel in home_prefixes {
        let p = home.join(rel);
        if p.exists() {
            return Ok(p);
        }
    }

    // 3. Try absolute locations
    for &path in abs {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }

    Err(
        "Jupyter is not installed or not on PATH.\n\
         Install with:  pip install jupyterlab\n\
         or:            conda install -c conda-forge jupyterlab"
            .to_string(),
    )
}

/// Return `true` if `jupyter lab` is available at the given binary path.
fn has_lab(jupyter: &PathBuf) -> bool {
    Command::new(jupyter)
        .args(["lab", "--version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Poll until the port accepts a TCP connection (max ~15 s).
fn wait_for_port(port: u16) -> bool {
    for _ in 0..75 {
        thread::sleep(Duration::from_millis(200));
        if TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
            return true;
        }
    }
    false
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Start a Jupyter Lab (preferred) or Notebook server for `notebook_path`.
/// Returns port, token, pid, mode and filename so the frontend can build the URL.
#[tauri::command]
pub async fn start_jupyter_server(notebook_path: String) -> Result<JupyterInfo, String> {
    tokio::task::spawn_blocking(move || start_blocking(notebook_path))
        .await
        .map_err(|e| e.to_string())?
}

fn start_blocking(notebook_path: String) -> Result<JupyterInfo, String> {
    let nb_path  = PathBuf::from(&notebook_path);
    let dir      = nb_path.parent().ok_or("Invalid notebook path")?.to_path_buf();
    let filename = nb_path
        .file_name()
        .ok_or("No filename")?
        .to_string_lossy()
        .into_owned();

    let jupyter = find_jupyter()?;
    let port    = free_port()?;
    let token   = make_token();

    let (subcommand, mode, app_prefix, root_arg) = if has_lab(&jupyter) {
        (
            "lab",
            "lab",
            "ServerApp",
            format!("--ServerApp.root_dir={}", dir.display()),
        )
    } else {
        (
            "notebook",
            "notebook",
            "NotebookApp",
            format!("--notebook-dir={}", dir.display()),
        )
    };

    let token_flag       = format!("--{app_prefix}.token={token}");
    let allow_flag       = format!("--{app_prefix}.allow_origin=*");
    let xsrf_flag        = format!("--{app_prefix}.disable_check_xsrf=True");
    let port_flag        = format!("--port={port}");

    let mut child = Command::new(&jupyter)
        .args([
            subcommand,
            "--no-browser",
            &port_flag,
            &token_flag,
            &allow_flag,
            &xsrf_flag,
            &root_arg,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn Jupyter: {e}"))?;

    let pid = child.id();

    if !wait_for_port(port) {
        let _ = child.kill();
        return Err(format!(
            "Jupyter server did not start within 15 seconds on port {port}."
        ));
    }

    procs().lock().unwrap().insert(pid, child);

    Ok(JupyterInfo {
        port,
        token,
        pid,
        mode: mode.to_string(),
        filename,
    })
}

/// Kill a previously started Jupyter server by PID.
#[tauri::command]
pub async fn stop_jupyter_server(pid: u32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if let Some(mut child) = procs().lock().unwrap().remove(&pid) {
            child.kill().map_err(|e| e.to_string())?;
            let _ = child.wait(); // reap the zombie
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
