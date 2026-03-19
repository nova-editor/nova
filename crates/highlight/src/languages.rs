use tree_sitter::Language;

pub const HIGHLIGHT_NAMES: &[&str] = &[
    "attribute",
    "comment",
    "constant",
    "constant.builtin",
    "constructor",
    "embedded",
    "function",
    "function.builtin",
    "keyword",
    "label",
    "module",
    "number",
    "operator",
    "property",
    "punctuation.bracket",
    "punctuation.delimiter",
    "string",
    "string.special",
    "tag",
    "type",
    "type.builtin",
    "variable",
    "variable.builtin",
    "variable.parameter",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Rust,
    Python,
    JavaScript,
    TypeScript,
    Go,
    Json,
    Bash,
    PlainText,
}

impl Lang {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "rs"          => Lang::Rust,
            "py"          => Lang::Python,
            "js" | "mjs"  => Lang::JavaScript,
            "ts" | "tsx"  => Lang::TypeScript,
            "go"          => Lang::Go,
            "json"        => Lang::Json,
            "sh" | "bash" => Lang::Bash,
            _             => Lang::PlainText,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Lang::Rust       => "rust",
            Lang::Python     => "python",
            Lang::JavaScript => "javascript",
            Lang::TypeScript => "typescript",
            Lang::Go         => "go",
            Lang::Json       => "json",
            Lang::Bash       => "bash",
            Lang::PlainText  => "text",
        }
    }

    pub fn tree_sitter_language(self) -> Option<Language> {
        match self {
            Lang::Rust       => Some(tree_sitter_rust::language()),
            Lang::Python     => Some(tree_sitter_python::language()),
            Lang::JavaScript => Some(tree_sitter_javascript::language()),
            Lang::TypeScript => Some(tree_sitter_typescript::language_typescript()),
            Lang::Go         => Some(tree_sitter_go::language()),
            Lang::Json       => Some(tree_sitter_json::language()),
            Lang::Bash       => Some(tree_sitter_bash::language()),
            Lang::PlainText  => None,
        }
    }

    /// Highlight query for each language (embedded to avoid crate API differences).
    pub fn highlight_query(self) -> &'static str {
        match self {
            Lang::Rust       => tree_sitter_rust::HIGHLIGHTS_QUERY,
            Lang::Python     => tree_sitter_python::HIGHLIGHTS_QUERY,
            Lang::Go         => tree_sitter_go::HIGHLIGHTS_QUERY,
            Lang::Json       => tree_sitter_json::HIGHLIGHTS_QUERY,
            // JS/TS/Bash don't expose HIGHLIGHTS_QUERY as a pub const in 0.21
            Lang::JavaScript => "",
            Lang::TypeScript => "",
            Lang::Bash       => "",
            Lang::PlainText  => "",
        }
    }
}
