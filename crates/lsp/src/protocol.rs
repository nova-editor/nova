use anyhow::{bail, Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;


/// Write a JSON-RPC message with the LSP Content-Length framing.
pub async fn write_message(stdin: &mut ChildStdin, msg: &serde_json::Value) -> Result<()> {
    let body = serde_json::to_string(msg).context("serialising LSP message")?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin.write_all(header.as_bytes()).await.context("writing LSP header")?;
    stdin.write_all(body.as_bytes()).await.context("writing LSP body")?;
    stdin.flush().await.context("flushing LSP stdin")?;
    Ok(())
}

/// Read one LSP message from stdout, returning the parsed JSON value.
pub async fn read_message<R: tokio::io::AsyncRead + Unpin>(
    reader: &mut BufReader<R>,
) -> Result<serde_json::Value> {
    // Parse headers
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await.context("reading LSP header line")?;
        if n == 0 {
            bail!("LSP server closed the connection");
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break; // end of headers
        }
        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(
                rest.trim()
                    .parse::<usize>()
                    .context("parsing Content-Length")?,
            );
        }
    }
    let len = content_length.context("missing Content-Length header")?;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf).await.context("reading LSP body")?;
    let value = serde_json::from_slice(&buf).context("parsing LSP JSON")?;
    Ok(value)
}

/// Build a JSON-RPC request value.
pub fn make_request(id: u64, method: &str, params: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
}

/// Build a JSON-RPC notification value (no id, no response expected).
pub fn make_notification(method: &str, params: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    })
}
