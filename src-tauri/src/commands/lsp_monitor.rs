use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    process::Stdio,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::{Child, Command},
};

const MAX_LOGS: usize = 2_000;
const UNRESPONSIVE_AFTER_MS: u64 = 45_000;
const SLOW_LATENCY_MS: u64 = 750;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LspServerStatus {
    Starting,
    Running,
    Stopped,
    Crashed,
    Unresponsive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LspHealth {
    Healthy,
    Slow,
    Unresponsive,
    Crashed,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LspLogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspLogEntry {
    pub id: String,
    pub server_id: String,
    pub timestamp: u64,
    pub level: LspLogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsHealth {
    pub error_count: u32,
    pub warning_count: u32,
    pub info_count: u32,
    pub update_count: u64,
    pub last_update_at: Option<u64>,
    pub last_success_at: Option<u64>,
    pub response_latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspServerSnapshot {
    pub id: String,
    pub language: String,
    pub server_type: String,
    pub workspace_root: String,
    pub pid: Option<u32>,
    pub command: Vec<String>,
    pub status: LspServerStatus,
    pub health: LspHealth,
    pub started_at: Option<u64>,
    pub last_event_at: Option<u64>,
    pub restart_count: u32,
    pub auto_restarts: u32,
    pub diagnostics: DiagnosticsHealth,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub server_id: Option<String>,
    pub workspace_root: String,
    pub language: String,
    pub error_count: u32,
    pub warning_count: u32,
    pub info_count: Option<u32>,
    pub response_latency_ms: Option<u64>,
}

struct ManagedServer {
    id: String,
    language: String,
    server_type: String,
    workspace_root: String,
    command: Vec<String>,
    pid: Option<u32>,
    status: LspServerStatus,
    started_at: Option<u64>,
    last_event_at: Option<u64>,
    restart_count: u32,
    auto_restarts: u32,
    diagnostics: DiagnosticsHealth,
    child: Option<Child>,
}

#[derive(Default)]
struct MonitorInner {
    servers: HashMap<String, ManagedServer>,
    logs: VecDeque<LspLogEntry>,
}

#[derive(Clone, Default)]
pub struct LspMonitorState {
    inner: Arc<Mutex<MonitorInner>>,
}

impl LspMonitorState {
    pub fn new() -> Self {
        Self::default()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn make_server_id(workspace_root: &str, language: &str) -> String {
    let mut key = format!("{}::{}", workspace_root, language).replace('\\', "/");
    key.retain(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/'));
    key.replace('/', "_")
}

fn command_for_language(language: &str) -> Option<Vec<String>> {
    match language {
        "rust" => Some(vec!["rust-analyzer".into()]),
        "typescript" | "javascript" => Some(vec!["typescript-language-server".into(), "--stdio".into()]),
        "python" => Some(vec!["pylsp".into()]),
        "go" => Some(vec!["gopls".into()]),
        "json" => Some(vec!["vscode-json-language-server".into(), "--stdio".into()]),
        "html" => Some(vec!["vscode-html-language-server".into(), "--stdio".into()]),
        "css" => Some(vec!["vscode-css-language-server".into(), "--stdio".into()]),
        _ => None,
    }
}

fn health_for(server: &ManagedServer, now: u64) -> LspHealth {
    match server.status {
        LspServerStatus::Crashed => return LspHealth::Crashed,
        LspServerStatus::Stopped => return LspHealth::Stopped,
        _ => {}
    }
    if let Some(last) = server.diagnostics.last_success_at.or(server.last_event_at) {
        if now.saturating_sub(last) > UNRESPONSIVE_AFTER_MS {
            return LspHealth::Unresponsive;
        }
    }
    if server
        .diagnostics
        .response_latency_ms
        .is_some_and(|latency| latency > SLOW_LATENCY_MS)
    {
        return LspHealth::Slow;
    }
    LspHealth::Healthy
}

fn snapshot(server: &ManagedServer) -> LspServerSnapshot {
    let now = now_ms();
    let health = health_for(server, now);
    let status = if matches!(health, LspHealth::Unresponsive) {
        LspServerStatus::Unresponsive
    } else {
        server.status.clone()
    };
    LspServerSnapshot {
        id: server.id.clone(),
        language: server.language.clone(),
        server_type: server.server_type.clone(),
        workspace_root: server.workspace_root.clone(),
        pid: server.pid,
        command: server.command.clone(),
        status,
        health,
        started_at: server.started_at,
        last_event_at: server.last_event_at,
        restart_count: server.restart_count,
        auto_restarts: server.auto_restarts,
        diagnostics: server.diagnostics.clone(),
    }
}

fn push_log(inner: &mut MonitorInner, server_id: &str, level: LspLogLevel, message: impl Into<String>) -> LspLogEntry {
    let entry = LspLogEntry {
        id: format!("{}-{}", server_id, now_ms()),
        server_id: server_id.to_string(),
        timestamp: now_ms(),
        level,
        message: message.into(),
    };
    inner.logs.push_back(entry.clone());
    while inner.logs.len() > MAX_LOGS {
        inner.logs.pop_front();
    }
    entry
}

fn emit_state(app: &AppHandle, state: &LspMonitorState) {
    let servers = {
        let inner = state.inner.lock().unwrap();
        inner.servers.values().map(snapshot).collect::<Vec<_>>()
    };
    let _ = app.emit("lsp://servers", servers);
}

fn emit_log(app: &AppHandle, entry: &LspLogEntry) {
    let _ = app.emit("lsp://log", entry);
}

fn refresh_process_statuses(inner: &mut MonitorInner) {
    let mut crashed = Vec::new();
    for server in inner.servers.values_mut() {
        let Some(child) = server.child.as_mut() else { continue };
        match child.try_wait() {
            Ok(Some(status)) => {
                server.status = if status.success() {
                    LspServerStatus::Stopped
                } else {
                    LspServerStatus::Crashed
                };
                server.pid = None;
                server.child = None;
                crashed.push((server.id.clone(), status.to_string()));
            }
            Ok(None) => {}
            Err(err) => {
                server.status = LspServerStatus::Crashed;
                server.pid = None;
                server.child = None;
                crashed.push((server.id.clone(), err.to_string()));
            }
        }
    }
    for (id, reason) in crashed {
        push_log(inner, &id, LspLogLevel::Error, format!("LSP process exited: {reason}"));
    }
}

fn spawn_server(app: AppHandle, state: LspMonitorState, server_id: String) -> Result<LspServerSnapshot, String> {
    let (workspace_root, command) = {
        let inner = state.inner.lock().unwrap();
        let server = inner
            .servers
            .get(&server_id)
            .ok_or_else(|| "LSP server is not registered".to_string())?;
        (server.workspace_root.clone(), server.command.clone())
    };

    if command.is_empty() {
        return Err("LSP server command is empty".into());
    }

    let mut child = Command::new(&command[0])
        .args(&command[1..])
        .current_dir(&workspace_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start {}: {e}", command.join(" ")))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stderr) = stderr {
        let state_for_stderr = state.clone();
        let app_for_stderr = app.clone();
        let id_for_stderr = server_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let entry = {
                    let mut inner = state_for_stderr.inner.lock().unwrap();
                    if let Some(server) = inner.servers.get_mut(&id_for_stderr) {
                        server.last_event_at = Some(now_ms());
                    }
                    push_log(&mut inner, &id_for_stderr, LspLogLevel::Warn, line)
                };
                emit_log(&app_for_stderr, &entry);
            }
        });
    }

    if let Some(mut stdout) = stdout {
        let state_for_stdout = state.clone();
        let id_for_stdout = server_id.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let mut inner = state_for_stdout.inner.lock().unwrap();
                        if let Some(server) = inner.servers.get_mut(&id_for_stdout) {
                            server.last_event_at = Some(now_ms());
                        }
                    }
                }
            }
        });
    }

    let snapshot = {
        let mut inner = state.inner.lock().unwrap();
        let server = inner
            .servers
            .get_mut(&server_id)
            .ok_or_else(|| "LSP server disappeared during start".to_string())?;
        server.pid = pid;
        server.status = LspServerStatus::Running;
        server.started_at = Some(now_ms());
        server.last_event_at = Some(now_ms());
        server.child = Some(child);
        let entry = push_log(
            &mut inner,
            &server_id,
            LspLogLevel::Info,
            format!("Started {} with pid {:?}", command.join(" "), pid),
        );
        emit_log(&app, &entry);
        snapshot(inner.servers.get(&server_id).unwrap())
    };

    emit_state(&app, &state);
    Ok(snapshot)
}

#[tauri::command]
pub async fn lsp_ensure_server(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
    workspace_root: String,
    language: String,
) -> Result<LspServerSnapshot, String> {
    let command = match command_for_language(&language) {
        Some(command) => command,
        None => {
            let id = make_server_id(&workspace_root, &language);
            let snapshot = {
                let mut inner = state.inner.lock().unwrap();
                inner.servers.entry(id.clone()).or_insert_with(|| ManagedServer {
                    id: id.clone(),
                    language: language.clone(),
                    server_type: "unsupported".into(),
                    workspace_root: workspace_root.clone(),
                    command: Vec::new(),
                    pid: None,
                    status: LspServerStatus::Stopped,
                    started_at: None,
                    last_event_at: Some(now_ms()),
                    restart_count: 0,
                    auto_restarts: 0,
                    diagnostics: DiagnosticsHealth::default(),
                    child: None,
                });
                let entry = push_log(&mut inner, &id, LspLogLevel::Warn, format!("No known language server for {language}"));
                emit_log(&app, &entry);
                snapshot(inner.servers.get(&id).unwrap())
            };
            emit_state(&app, &state);
            return Ok(snapshot);
        }
    };

    let id = make_server_id(&workspace_root, &language);
    let already_running = {
        let mut inner = state.inner.lock().unwrap();
        let server = inner.servers.entry(id.clone()).or_insert_with(|| ManagedServer {
            id: id.clone(),
            language: language.clone(),
            server_type: command[0].clone(),
            workspace_root: workspace_root.clone(),
            command: command.clone(),
            pid: None,
            status: LspServerStatus::Starting,
            started_at: None,
            last_event_at: Some(now_ms()),
            restart_count: 0,
            auto_restarts: 0,
            diagnostics: DiagnosticsHealth::default(),
            child: None,
        });
        matches!(server.status, LspServerStatus::Running | LspServerStatus::Starting) && server.child.is_some()
    };

    if already_running {
        let inner = state.inner.lock().unwrap();
        return Ok(snapshot(inner.servers.get(&id).unwrap()));
    }

    spawn_server(app, state.inner().clone(), id)
}

#[tauri::command]
pub async fn lsp_servers(state: State<'_, LspMonitorState>) -> Result<Vec<LspServerSnapshot>, String> {
    let mut inner = state.inner.lock().unwrap();
    refresh_process_statuses(&mut inner);
    Ok(inner.servers.values().map(snapshot).collect())
}

#[tauri::command]
pub async fn lsp_logs(
    state: State<'_, LspMonitorState>,
    server_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LspLogEntry>, String> {
    let inner = state.inner.lock().unwrap();
    let limit = limit.unwrap_or(500).min(MAX_LOGS);
    let mut logs = inner
        .logs
        .iter()
        .rev()
        .filter(|entry| server_id.as_ref().map_or(true, |id| &entry.server_id == id))
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    logs.reverse();
    Ok(logs)
}

#[tauri::command]
pub async fn lsp_clear_logs(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
    server_id: Option<String>,
) -> Result<(), String> {
    {
        let mut inner = state.inner.lock().unwrap();
        if let Some(server_id) = server_id {
            inner.logs.retain(|entry| entry.server_id != server_id);
        } else {
            inner.logs.clear();
        }
    }
    let _ = app.emit("lsp://logs-cleared", ());
    Ok(())
}

#[tauri::command]
pub async fn lsp_report_diagnostics(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
    report: DiagnosticsReport,
) -> Result<(), String> {
    let id = report
        .server_id
        .clone()
        .unwrap_or_else(|| make_server_id(&report.workspace_root, &report.language));
    {
        let mut inner = state.inner.lock().unwrap();
        if let Some(server) = inner.servers.get_mut(&id) {
            server.diagnostics.error_count = report.error_count;
            server.diagnostics.warning_count = report.warning_count;
            server.diagnostics.info_count = report.info_count.unwrap_or_default();
            server.diagnostics.response_latency_ms = report.response_latency_ms;
            server.diagnostics.update_count += 1;
            server.diagnostics.last_update_at = Some(now_ms());
            server.diagnostics.last_success_at = Some(now_ms());
            server.last_event_at = Some(now_ms());
        }
    }
    emit_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn lsp_kill_server(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
    server_id: String,
) -> Result<LspServerSnapshot, String> {
    let mut child = {
        let mut inner = state.inner.lock().unwrap();
        let server = inner.servers.get_mut(&server_id).ok_or_else(|| "Unknown LSP server".to_string())?;
        server.status = LspServerStatus::Stopped;
        server.pid = None;
        server.child.take()
    };
    if let Some(child) = child.as_mut() {
        child.start_kill().map_err(|e| e.to_string())?;
    }
    let snapshot = {
        let mut inner = state.inner.lock().unwrap();
        let entry = push_log(&mut inner, &server_id, LspLogLevel::Warn, "Killed LSP server");
        emit_log(&app, &entry);
        snapshot(inner.servers.get(&server_id).unwrap())
    };
    emit_state(&app, &state);
    Ok(snapshot)
}

#[tauri::command]
pub async fn lsp_restart_server(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
    server_id: String,
) -> Result<LspServerSnapshot, String> {
    {
        let mut child = {
            let mut inner = state.inner.lock().unwrap();
            let server = inner.servers.get_mut(&server_id).ok_or_else(|| "Unknown LSP server".to_string())?;
            server.restart_count += 1;
            server.status = LspServerStatus::Starting;
            server.pid = None;
            server.child.take()
        };
        if let Some(child) = child.as_mut() {
            let _ = child.start_kill();
        }
    }
    spawn_server(app, state.inner().clone(), server_id)
}

#[tauri::command]
pub async fn lsp_restart_all(
    app: AppHandle,
    state: State<'_, LspMonitorState>,
) -> Result<Vec<LspServerSnapshot>, String> {
    let ids = {
        let inner = state.inner.lock().unwrap();
        inner
            .servers
            .values()
            .filter(|server| !server.command.is_empty())
            .map(|server| server.id.clone())
            .collect::<Vec<_>>()
    };
    let mut snapshots = Vec::new();
    for id in ids {
        snapshots.push(lsp_restart_server(app.clone(), state.clone(), id).await?);
    }
    Ok(snapshots)
}
