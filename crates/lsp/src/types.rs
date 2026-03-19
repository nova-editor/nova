use serde::{Deserialize, Serialize};

// ── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id:      Option<serde_json::Value>,
    pub method:  String,
    pub params:  Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id:      Option<serde_json::Value>,
    pub result:  Option<serde_json::Value>,
    pub error:   Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method:  String,
    pub params:  Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code:    i64,
    pub message: String,
    pub data:    Option<serde_json::Value>,
}

// ── LSP types (minimal subset) ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub line:      u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end:   Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub uri:   String,
    pub range: Range,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextDocumentIdentifier {
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentItem {
    pub uri:         String,
    pub language_id: String,
    pub version:     i64,
    pub text:        String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub range:   Range,
    pub message: String,
    pub severity: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct DiagnosticSeverity;
impl DiagnosticSeverity {
    pub const ERROR:       i32 = 1;
    pub const WARNING:     i32 = 2;
    pub const INFORMATION: i32 = 3;
    pub const HINT:        i32 = 4;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionItem {
    pub label:         String,
    pub kind:          Option<i32>,
    pub detail:        Option<String>,
    pub documentation: Option<String>,
    #[serde(rename = "insertText")]
    pub insert_text:   Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hover {
    pub contents: HoverContents,
    pub range:    Option<Range>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HoverContents {
    Markup(MarkupContent),
    String(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkupContent {
    pub kind:  String,
    pub value: String,
}
