use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt};

// ── Claude CLI non-interactive streaming ──────────────────────────────────────
//
// Uses `claude -p "prompt" --output-format stream-json [--resume <session_id>]`
// No API key required — uses whatever auth `claude` CLI already has.
//
// Emits per session_id:
//   claude-chat-delta-{id}    → String (text token)
//   claude-chat-session-{id}  → String (claude session_id for --resume)
//   claude-chat-done-{id}     → ()
//   claude-chat-error-{id}    → String

#[tauri::command]
pub async fn claude_cli_chat(
    app:             tauri::AppHandle,
    session_id:      String,
    claude_path:     String,
    prompt:          String,
    resume_session:  Option<String>,
    allowed_tools:   Option<String>,
) -> Result<(), String> {
    let mut args = vec![
        "-p".to_string(),
        prompt,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
        "--model".to_string(),
        "claude-haiku-4-5-20251001".to_string(),
        "--effort".to_string(),
        "low".to_string(),
    ];
    if let Some(tools) = allowed_tools {
        args.push("--allowedTools".to_string());
        args.push(tools);
    }
    if let Some(sid) = resume_session {
        args.push("--resume".to_string());
        args.push(sid);
    }

    let mut child = tokio::process::Command::new(&claude_path)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // Collect stderr in the background so stdout reads never block.
    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        tokio::io::BufReader::new(stderr).read_to_string(&mut buf).await.ok();
        buf
    });

    let reader = tokio::io::BufReader::new(stdout);
    let mut lines       = reader.lines();
    let mut sent_len    = 0usize;
    let mut got_result  = false;
    // Track which tool_use ids we've already emitted (each assistant event
    // carries the full accumulated content, so we'd duplicate without this).
    let mut emitted_tools: std::collections::HashSet<String> = std::collections::HashSet::new();

    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(ev) = serde_json::from_str::<serde_json::Value>(&line) else { continue };

        match ev["type"].as_str() {
            // ── Assistant turn: text, thinking, tool_use ──────────────────────
            Some("assistant") => {
                if let Some(content) = ev["message"]["content"].as_array() {
                    for block in content {
                        match block["type"].as_str() {
                            Some("text") => {
                                if let Some(text) = block["text"].as_str() {
                                    if text.len() > sent_len {
                                        let delta = &text[sent_len..];
                                        app.emit(&format!("claude-chat-delta-{session_id}"), delta).ok();
                                        sent_len = text.len();
                                    }
                                }
                            }
                            Some("thinking") => {
                                // Emit the full (growing) thinking text each tick;
                                // frontend replaces its thinking state.
                                if let Some(t) = block["thinking"].as_str() {
                                    app.emit(&format!("claude-chat-thinking-{session_id}"), t).ok();
                                }
                            }
                            Some("tool_use") => {
                                let id = block["id"].as_str().unwrap_or("").to_string();
                                // Only emit once per tool_use id, and only when
                                // the input object is fully populated (not null/empty).
                                if !id.is_empty()
                                    && !block["input"].is_null()
                                    && !emitted_tools.contains(&id)
                                {
                                    emitted_tools.insert(id.clone());
                                    let name = block["name"].as_str().unwrap_or("tool");
                                    let summary = match name {
                                        "bash" => block["input"]["command"].as_str()
                                            .unwrap_or("").chars().take(120).collect::<String>(),
                                        "str_replace_editor" | "str_replace_based_edit_tool" => {
                                            let cmd  = block["input"]["command"].as_str().unwrap_or("edit");
                                            let path = block["input"]["path"].as_str().unwrap_or("");
                                            format!("{cmd} {path}")
                                        }
                                        "read_file" | "view" => block["input"]["path"].as_str()
                                            .unwrap_or("").to_string(),
                                        "write_file" | "create" => block["input"]["path"].as_str()
                                            .unwrap_or("").to_string(),
                                        _ => serde_json::to_string(&block["input"])
                                            .unwrap_or_default().chars().take(100).collect::<String>(),
                                    };
                                    let diff_old: Option<String> = if matches!(name, "str_replace_editor" | "str_replace_based_edit_tool")
                                        && block["input"]["command"].as_str() == Some("str_replace")
                                    {
                                        block["input"]["old_str"].as_str().map(|s| s.chars().take(1500).collect())
                                    } else {
                                        None
                                    };
                                    let diff_new: Option<String> = if diff_old.is_some() {
                                        block["input"]["new_str"].as_str().map(|s| s.chars().take(1500).collect())
                                    } else {
                                        None
                                    };
                                    let payload = serde_json::json!({
                                        "id":      id,
                                        "name":    name,
                                        "summary": summary,
                                        "diffOld": diff_old,
                                        "diffNew": diff_new,
                                    });
                                    app.emit(&format!("claude-chat-tool-{session_id}"), payload.to_string()).ok();
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            // ── User turn: contains tool_result blocks after agent loops ──────
            Some("user") => {
                if let Some(content) = ev["message"]["content"].as_array() {
                    for block in content {
                        if block["type"].as_str() != Some("tool_result") { continue; }
                        let tool_use_id = block["tool_use_id"].as_str().unwrap_or("").to_string();
                        if tool_use_id.is_empty() { continue; }
                        // Content can be a plain string or an array of content blocks
                        let result_text = match &block["content"] {
                            serde_json::Value::String(s) => s.chars().take(800).collect::<String>(),
                            serde_json::Value::Array(arr) => arr.iter()
                                .filter_map(|b| if b["type"] == "text" { b["text"].as_str() } else { None })
                                .collect::<Vec<_>>()
                                .join("\n")
                                .chars().take(800).collect::<String>(),
                            _ => String::new(),
                        };
                        let is_error = block["is_error"].as_bool().unwrap_or(false);
                        let payload = serde_json::json!({
                            "id":      tool_use_id,
                            "content": result_text,
                            "isError": is_error,
                        });
                        app.emit(&format!("claude-chat-tool-result-{session_id}"), payload.to_string()).ok();
                    }
                }
            }
            // ── Final result ──────────────────────────────────────────────────
            Some("result") => {
                got_result = true;
                if let Some(sid) = ev["session_id"].as_str() {
                    app.emit(&format!("claude-chat-session-{session_id}"), sid).ok();
                }
                if ev["subtype"] == "error" {
                    let msg = ev["error"]["message"].as_str().unwrap_or("unknown error");
                    app.emit(&format!("claude-chat-error-{session_id}"), msg).ok();
                }
                if !ev["usage"].is_null() {
                    let usage = serde_json::json!({
                        "inputTokens":         ev["usage"]["input_tokens"].as_u64().unwrap_or(0),
                        "outputTokens":        ev["usage"]["output_tokens"].as_u64().unwrap_or(0),
                        "cacheCreationTokens": ev["usage"]["cache_creation_input_tokens"].as_u64().unwrap_or(0),
                        "cacheReadTokens":     ev["usage"]["cache_read_input_tokens"].as_u64().unwrap_or(0),
                    });
                    app.emit(&format!("claude-chat-usage-{session_id}"), usage.to_string()).ok();
                }
                app.emit(&format!("claude-chat-done-{session_id}"), "").ok();
                break;
            }
            _ => {}
        }
    }

    // If claude exited without a result event, surface stderr as the error.
    if !got_result {
        let stderr_output = stderr_task.await.unwrap_or_default();
        let err = if !stderr_output.trim().is_empty() {
            stderr_output.trim().to_string()
        } else {
            "claude exited without a response — check that claude CLI is authenticated".to_string()
        };
        app.emit(&format!("claude-chat-error-{session_id}"), &err).ok();
        app.emit(&format!("claude-chat-done-{session_id}"), "").ok();
    }

    let _ = child.wait().await;
    Ok(())
}

// ── Direct Anthropic API streaming ───────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiMessage {
    pub role:    String,
    pub content: String,
}

/// Stream a Claude API response back to the frontend via Tauri events.
///
/// Emits:
///   `claude-api-delta-{session_id}`  → String  (each text token)
///   `claude-api-done-{session_id}`   → ()      (stream finished)
///   `claude-api-error-{session_id}`  → String  (any error)
#[tauri::command]
pub async fn claude_api_chat(
    app:        tauri::AppHandle,
    session_id: String,
    api_key:    String,
    model:      String,
    system:     String,
    messages:   Vec<ApiMessage>,
) -> Result<(), String> {
    let body = serde_json::json!({
        "model":      model,
        "max_tokens": 8096,
        "stream":     true,
        "system":     system,
        "messages":   messages.iter().map(|m| serde_json::json!({
            "role":    m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
    });

    let client = reqwest::Client::new();
    let resp = match client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key",           &api_key)
        .header("anthropic-version",    "2023-06-01")
        .header("content-type",         "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(r)  => r,
        Err(e) => {
            app.emit(&format!("claude-api-error-{session_id}"), e.to_string()).ok();
            return Ok(());
        }
    };

    if !resp.status().is_success() {
        let err = resp.text().await.unwrap_or_else(|e| e.to_string());
        app.emit(&format!("claude-api-error-{session_id}"), err).ok();
        return Ok(());
    }

    let mut stream = resp.bytes_stream();
    let mut buf    = String::new();

    'outer: while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c)  => c,
            Err(e) => {
                app.emit(&format!("claude-api-error-{session_id}"), e.to_string()).ok();
                return Ok(());
            }
        };
        buf.push_str(&String::from_utf8_lossy(&chunk));

        loop {
            let Some(pos) = buf.find('\n') else { break };
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf.drain(..=pos);

            let Some(data) = line.strip_prefix("data: ") else { continue };
            if data == "[DONE]" { break 'outer; }

            if let Ok(ev) = serde_json::from_str::<serde_json::Value>(data) {
                match ev["type"].as_str() {
                    Some("content_block_delta") => {
                        if ev["delta"]["type"] == "text_delta" {
                            if let Some(text) = ev["delta"]["text"].as_str() {
                                app.emit(&format!("claude-api-delta-{session_id}"), text).ok();
                            }
                        }
                    }
                    Some("message_stop") => break 'outer,
                    _ => {}
                }
            }
        }
    }

    app.emit(&format!("claude-api-done-{session_id}"), "").ok();
    Ok(())
}

// ── Generic CLI finder — tries common absolute paths, home-relative paths,
/// then a login-shell `which <bin>`.
fn find_cli(bin: &str) -> Result<String, String> {
    let abs_candidates = [
        format!("/usr/local/bin/{bin}"),
        format!("/opt/homebrew/bin/{bin}"),
        format!("/usr/bin/{bin}"),
        format!("/home/linuxbrew/.linuxbrew/bin/{bin}"),
    ];
    for p in &abs_candidates {
        if std::path::Path::new(p.as_str()).exists() {
            return Ok(p.clone());
        }
    }

    if let Some(home) = dirs::home_dir() {
        let rel_candidates = [
            format!(".local/bin/{bin}"),
            format!(".npm-global/bin/{bin}"),
            format!(".volta/bin/{bin}"),
            format!(".nvm/current/bin/{bin}"),
            format!("node_modules/.bin/{bin}"),
        ];
        for rel in &rel_candidates {
            let p = home.join(rel);
            if p.exists() {
                return Ok(p.to_string_lossy().into_owned());
            }
        }
    }

    let output = std::process::Command::new("sh")
        .args(["-lc", &format!("which {bin} 2>/dev/null")])
        .output()
        .map_err(|e| format!("shell lookup failed: {e}"))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() && std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }

    Err(format!("{bin} not found"))
}

#[tauri::command]
pub fn find_claude_path() -> Result<String, String> {
    // Extra: Anthropic local install location
    if let Some(home) = dirs::home_dir() {
        let local = home.join(".claude/local/claude");
        if local.exists() {
            return Ok(local.to_string_lossy().into_owned());
        }
    }
    find_cli("claude").map_err(|_| {
        "claude CLI not found.\n\nInstall:\n  npm install -g @anthropic-ai/claude-code\n\nThen restart Nova.".to_string()
    })
}

#[tauri::command]
pub fn find_gemini_path() -> Result<String, String> {
    find_cli("gemini").map_err(|_| {
        "Gemini CLI not found.\n\nInstall:\n  npm install -g @google/gemini-cli\n\nThen restart Nova.".to_string()
    })
}

#[tauri::command]
pub fn find_codex_path() -> Result<String, String> {
    find_cli("codex").map_err(|_| {
        "Codex CLI not found.\n\nInstall:\n  npm install -g @openai/codex\n\nThen restart Nova.".to_string()
    })
}

/// Silently install (or update) the `nova` CLI shim to /usr/local/bin/nova.
///
/// Called automatically on every app launch from setup().
/// Strategy:
///   1. Try a direct write — works when /usr/local/bin is user-writable
///      (common on macOS with Homebrew installed).
///   2. If that fails (EPERM), skip silently — no dialog, no crash.
///      The user can still run `nova` via the bundled scripts/ helper if needed.
pub fn install_cli_silently() {
    std::thread::spawn(|| {
        let script = "#!/bin/bash\nopen -na \"/Applications/nova.app\" --args \"$@\"\n";
        let dest = std::path::Path::new("/usr/local/bin/nova");

        // Already installed with identical content — nothing to do.
        if let Ok(existing) = std::fs::read_to_string(dest) {
            if existing == script {
                return;
            }
        }

        // Try direct write (works when /usr/local/bin is user-writable).
        if std::fs::write(dest, script).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(dest, std::fs::Permissions::from_mode(0o755));
            }
        }
        // If write fails (permissions), we silently do nothing.
        // Users who need it can run: sudo cp scripts/nova /usr/local/bin/nova
    });
}
