use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
    task::JoinHandle,
};

// ── Global server registry ────────────────────────────────────────────────────

fn servers() -> &'static Mutex<HashMap<u16, JoinHandle<()>>> {
    static S: OnceLock<Mutex<HashMap<u16, JoinHandle<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── MIME types ────────────────────────────────────────────────────────────────

fn mime_for(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" | "htm" => "text/html; charset=utf-8",
        "css"          => "text/css; charset=utf-8",
        "js" | "mjs"   => "application/javascript; charset=utf-8",
        "json"         => "application/json",
        "svg"          => "image/svg+xml",
        "png"          => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif"          => "image/gif",
        "ico"          => "image/x-icon",
        "woff"         => "font/woff",
        "woff2"        => "font/woff2",
        "ttf"          => "font/ttf",
        "eot"          => "application/vnd.ms-fontobject",
        "pdf"          => "application/pdf",
        _              => "application/octet-stream",
    }
}

// ── Minimal URL percent-decoder ───────────────────────────────────────────────

fn percent_decode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(n) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(n);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ── HTTP/1.1 connection handler ───────────────────────────────────────────────

async fn handle_connection(stream: tokio::net::TcpStream, base_dir: PathBuf) {
    let (reader_half, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader_half);

    // Read request line: "GET /path HTTP/1.1"
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await.is_err() {
        return;
    }

    // Drain remaining headers to keep the connection clean
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line).await {
            Ok(_) if line == "\r\n" || line.is_empty() => break,
            Err(_) => return,
            _ => {}
        }
    }

    // Parse the requested path and strip query string
    let raw_path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .split('?')
        .next()
        .unwrap_or("/")
        .to_owned();

    let decoded  = percent_decode(&raw_path);
    let rel      = decoded.trim_start_matches('/');
    let file_path = if rel.is_empty() {
        base_dir.join("index.html")
    } else {
        base_dir.join(rel)
    };

    match tokio::fs::read(&file_path).await {
        Ok(content) => {
            let mime   = mime_for(&file_path);
            let header = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: {mime}\r\n\
                 Content-Length: {len}\r\n\
                 Cache-Control: no-cache\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 \r\n",
                len = content.len(),
            );
            let _ = writer.write_all(header.as_bytes()).await;
            let _ = writer.write_all(&content).await;
        }
        Err(_) => {
            let body   = b"404 Not Found";
            let header = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\n\r\n",
                body.len()
            );
            let _ = writer.write_all(header.as_bytes()).await;
            let _ = writer.write_all(body).await;
        }
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Spawn a local HTTP file server for `path` and return the assigned port.
/// Each call starts a fresh server; call `stop_html_server` to clean up.
#[tauri::command]
pub async fn start_html_server(path: String) -> Result<u16, String> {
    let base_dir = PathBuf::from(&path);
    if !base_dir.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let handle = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let dir = base_dir.clone();
                    tokio::spawn(handle_connection(stream, dir));
                }
                Err(_) => break,
            }
        }
    });

    servers().lock().unwrap().insert(port, handle);
    Ok(port)
}

/// Abort the server that was started on `port`.
#[tauri::command]
pub async fn stop_html_server(port: u16) {
    if let Some(handle) = servers().lock().unwrap().remove(&port) {
        handle.abort();
    }
}
