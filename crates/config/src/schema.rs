use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    #[serde(default)]
    pub editor:   EditorConfig,
    #[serde(default)]
    pub theme:    ThemeConfig,
    #[serde(default)]
    pub keybinds: KeybindsConfig,
    #[serde(default)]
    pub lsp:      LspConfig,
    #[serde(default)]
    pub git:      GitConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            editor:   EditorConfig::default(),
            theme:    ThemeConfig::default(),
            keybinds: KeybindsConfig::default(),
            lsp:      LspConfig::default(),
            git:      GitConfig::default(),
        }
    }
}

// ── Editor ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorConfig {
    pub tab_width:                usize,
    pub expand_tabs:              bool,
    pub line_numbers:             LineNumberStyle,
    pub scroll_off:               usize,
    pub wrap_lines:               bool,
    pub auto_indent:              bool,
    pub trim_trailing_whitespace: bool,
    pub restore_session:          bool,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            tab_width:                4,
            expand_tabs:              true,
            line_numbers:             LineNumberStyle::Relative,
            scroll_off:               8,
            wrap_lines:               false,
            auto_indent:              true,
            trim_trailing_whitespace: true,
            restore_session:          true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineNumberStyle {
    None,
    Absolute,
    Relative,
}

// ── Theme ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ThemeConfig {
    pub name:            String,
    pub bg:              String,
    pub fg:              String,
    pub cursor:          String,
    pub selection:       String,
    pub line_number:     String,
    pub active_line:     String,
    pub status_bar_bg:   String,
    pub status_bar_fg:   String,
    pub tab_active_bg:   String,
    pub tab_inactive_bg: String,
    pub file_tree_bg:    String,
    pub gutter_add:      String,
    pub gutter_change:   String,
    pub gutter_delete:   String,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            name:            "atom-dark".to_string(),
            bg:              "#282C34".to_string(),
            fg:              "#ABB2BF".to_string(),
            cursor:          "#528BFF".to_string(),
            selection:       "#3E4451".to_string(),
            line_number:     "#4B5263".to_string(),
            active_line:     "#2C313A".to_string(),
            status_bar_bg:   "#21252B".to_string(),
            status_bar_fg:   "#9DA5B4".to_string(),
            tab_active_bg:   "#282C34".to_string(),
            tab_inactive_bg: "#21252B".to_string(),
            file_tree_bg:    "#21252B".to_string(),
            gutter_add:      "#98C379".to_string(),
            gutter_change:   "#E5C07B".to_string(),
            gutter_delete:   "#E06C75".to_string(),
        }
    }
}

// ── Keybindings ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct KeybindsConfig {
    /// Override bindings in normal mode: "ctrl+s" => "save"
    #[serde(default)]
    pub normal:  HashMap<String, String>,
    #[serde(default)]
    pub insert:  HashMap<String, String>,
    #[serde(default)]
    pub visual:  HashMap<String, String>,
}

// ── LSP ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LspConfig {
    pub enabled: bool,
    /// file extension => argv  e.g. "rs" => ["rust-analyzer"]
    #[serde(default)]
    pub servers: HashMap<String, Vec<String>>,
}

impl Default for LspConfig {
    fn default() -> Self {
        let mut servers = HashMap::new();
        servers.insert("rs".into(),  vec!["rust-analyzer".into()]);
        servers.insert("py".into(),  vec!["pylsp".into()]);
        servers.insert("ts".into(),  vec!["typescript-language-server".into(), "--stdio".into()]);
        servers.insert("js".into(),  vec!["typescript-language-server".into(), "--stdio".into()]);
        servers.insert("go".into(),  vec!["gopls".into()]);
        servers.insert("lua".into(), vec!["lua-language-server".into()]);
        Self { enabled: true, servers }
    }
}

// ── Git ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitConfig {
    pub show_gutter_signs: bool,
    pub auto_fetch:        bool,
}

impl Default for GitConfig {
    fn default() -> Self {
        Self { show_gutter_signs: true, auto_fetch: false }
    }
}
