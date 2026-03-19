use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use serde_json::Value;
use tokio::io::BufReader;
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, warn};

use crate::{
    protocol::{make_notification, make_request, read_message, write_message},
    types::{CompletionItem, Diagnostic, Hover, Location, Position, TextDocumentItem},
};

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

/// Events pushed from the LSP server to the editor (notifications).
#[derive(Debug)]
pub enum LspEvent {
    Diagnostics {
        uri:         String,
        diagnostics: Vec<Diagnostic>,
    },
    LogMessage(String),
    ShowMessage(String),
}

pub struct LspClient {
    next_id:  u64,
    stdin:    tokio::process::ChildStdin,
    pending:  PendingMap,
    _root_uri: String,
}

impl LspClient {
    /// Spawn the language server and perform `initialize`.
    pub async fn start(
        argv:       &[String],
        root_path:  PathBuf,
        event_tx:   mpsc::Sender<LspEvent>,
    ) -> Result<Self> {
        let root_uri = format!(
            "file://{}",
            root_path.to_string_lossy().trim_start_matches('/')
        );

        let mut child = Command::new(&argv[0])
            .args(&argv[1..])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .with_context(|| format!("spawning LSP server {:?}", argv))?;

        let stdin  = child.stdin.take().context("LSP stdin")?;
        let stdout = child.stdout.take().context("LSP stdout")?;

        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let pending_rx = pending.clone();

        // Spawn reader task
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            loop {
                let msg = match read_message(&mut reader).await {
                    Ok(m)  => m,
                    Err(e) => { warn!("LSP read error: {e}"); break; }
                };
                debug!("LSP ← {}", msg);

                if let Some(id) = msg.get("id") {
                    // It is a response to a request we sent
                    let id_u64 = id.as_u64().unwrap_or(0);
                    if let Some(tx) = pending_rx.lock().await.remove(&id_u64) {
                        let _ = tx.send(msg);
                    }
                } else if let Some(method) = msg.get("method").and_then(Value::as_str) {
                    // Server-initiated notification
                    match method {
                        "textDocument/publishDiagnostics" => {
                            if let Some(params) = msg.get("params") {
                                let uri = params["uri"].as_str().unwrap_or("").to_string();
                                let diags: Vec<Diagnostic> = serde_json::from_value(
                                    params["diagnostics"].clone(),
                                )
                                .unwrap_or_default();
                                let _ = event_tx.send(LspEvent::Diagnostics { uri, diagnostics: diags }).await;
                            }
                        }
                        "window/logMessage" => {
                            let msg_str = msg["params"]["message"].as_str().unwrap_or("").to_string();
                            let _ = event_tx.send(LspEvent::LogMessage(msg_str)).await;
                        }
                        "window/showMessage" => {
                            let msg_str = msg["params"]["message"].as_str().unwrap_or("").to_string();
                            let _ = event_tx.send(LspEvent::ShowMessage(msg_str)).await;
                        }
                        _ => {}
                    }
                }
            }
        });

        // Keep the child alive
        tokio::spawn(async move { let _ = child.wait().await; });

        let mut client = Self {
            next_id:  1,
            stdin,
            pending,
            _root_uri: root_uri.clone(),
        };

        // initialize handshake
        let init_params = serde_json::json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "synchronization": { "openClose": true, "change": 2 },
                    "completion":      { "completionItem": { "snippetSupport": false } },
                    "hover":           { "contentFormat": ["plaintext", "markdown"] },
                    "definition":      {},
                    "references":      {},
                    "publishDiagnostics": {},
                }
            },
            "initializationOptions": null,
        });

        let _init_resp = client.request("initialize", init_params).await?;
        client.notify("initialized", serde_json::json!({})).await?;

        Ok(client)
    }

    // ── Low-level RPC ────────────────────────────────────────────────────────

    async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id  = self.next_id;
        self.next_id += 1;
        let msg = make_request(id, method, params);
        debug!("LSP → {}", msg);

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        write_message(&mut self.stdin, &msg).await?;
        rx.await.context("LSP server did not respond")
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<()> {
        let msg = make_notification(method, params);
        debug!("LSP → {}", msg);
        write_message(&mut self.stdin, &msg).await
    }

    // ── Document sync ────────────────────────────────────────────────────────

    pub async fn open_document(&mut self, item: TextDocumentItem) -> Result<()> {
        self.notify(
            "textDocument/didOpen",
            serde_json::json!({ "textDocument": item }),
        )
        .await
    }

    pub async fn change_document(&mut self, uri: &str, version: i64, text: &str) -> Result<()> {
        self.notify(
            "textDocument/didChange",
            serde_json::json!({
                "textDocument":   { "uri": uri, "version": version },
                "contentChanges": [{ "text": text }],
            }),
        )
        .await
    }

    pub async fn close_document(&mut self, uri: &str) -> Result<()> {
        self.notify(
            "textDocument/didClose",
            serde_json::json!({ "textDocument": { "uri": uri } }),
        )
        .await
    }

    pub async fn save_document(&mut self, uri: &str, text: Option<&str>) -> Result<()> {
        let text_val = text.map(|t| serde_json::json!(t)).unwrap_or(Value::Null);
        self.notify(
            "textDocument/didSave",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "text":         text_val,
            }),
        )
        .await
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub async fn hover(&mut self, uri: &str, pos: Position) -> Result<Option<Hover>> {
        let resp = self
            .request(
                "textDocument/hover",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "position":     pos,
                }),
            )
            .await?;
        if resp["result"].is_null() {
            return Ok(None);
        }
        Ok(serde_json::from_value(resp["result"].clone()).ok())
    }

    pub async fn goto_definition(&mut self, uri: &str, pos: Position) -> Result<Vec<Location>> {
        let resp = self
            .request(
                "textDocument/definition",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "position":     pos,
                }),
            )
            .await?;
        let locations: Vec<Location> = serde_json::from_value(resp["result"].clone())
            .unwrap_or_default();
        Ok(locations)
    }

    pub async fn references(&mut self, uri: &str, pos: Position) -> Result<Vec<Location>> {
        let resp = self
            .request(
                "textDocument/references",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "position":     pos,
                    "context":      { "includeDeclaration": true },
                }),
            )
            .await?;
        let locations: Vec<Location> = serde_json::from_value(resp["result"].clone())
            .unwrap_or_default();
        Ok(locations)
    }

    pub async fn completion(
        &mut self,
        uri: &str,
        pos: Position,
    ) -> Result<Vec<CompletionItem>> {
        let resp = self
            .request(
                "textDocument/completion",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "position":     pos,
                }),
            )
            .await?;
        // Result can be CompletionList or CompletionItem[]
        let items: Vec<CompletionItem> = if resp["result"]["items"].is_array() {
            serde_json::from_value(resp["result"]["items"].clone()).unwrap_or_default()
        } else {
            serde_json::from_value(resp["result"].clone()).unwrap_or_default()
        };
        Ok(items)
    }

    pub async fn rename(&mut self, uri: &str, pos: Position, new_name: &str) -> Result<Value> {
        let resp = self
            .request(
                "textDocument/rename",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "position":     pos,
                    "newName":      new_name,
                }),
            )
            .await?;
        Ok(resp["result"].clone())
    }

    pub async fn format_document(&mut self, uri: &str, tab_size: u32, insert_spaces: bool) -> Result<Value> {
        let resp = self
            .request(
                "textDocument/formatting",
                serde_json::json!({
                    "textDocument": { "uri": uri },
                    "options": {
                        "tabSize":      tab_size,
                        "insertSpaces": insert_spaces,
                    },
                }),
            )
            .await?;
        Ok(resp["result"].clone())
    }

    pub async fn shutdown(&mut self) -> Result<()> {
        self.request("shutdown", Value::Null).await?;
        self.notify("exit", Value::Null).await
    }
}
