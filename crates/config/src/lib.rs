pub mod schema;
pub use schema::*;

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

impl Config {
    /// Default config file location: `~/.config/ted/config.toml`
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()))
            .join("ted")
            .join("config.toml")
    }

    /// Load config from disk, writing defaults if the file doesn't exist yet.
    pub fn load() -> Result<Self> {
        let path = Self::config_path();
        if !path.exists() {
            let defaults = Self::default();
            defaults.save().context("writing default config")?;
            return Ok(defaults);
        }
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("reading config from {}", path.display()))?;
        let config: Self = toml::from_str(&content)
            .context("parsing config.toml — check for syntax errors")?;
        Ok(config)
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating config dir {}", parent.display()))?;
        }
        let content = toml::to_string_pretty(self).context("serializing config")?;
        std::fs::write(&path, content)
            .with_context(|| format!("writing config to {}", path.display()))?;
        Ok(())
    }

    /// Merge a project-local `.ted.toml` found in `project_dir` on top of the
    /// current config (only editor + theme sections are overridden per-project).
    pub fn apply_project_override(&mut self, project_dir: &Path) -> Result<()> {
        let local = project_dir.join(".ted.toml");
        if !local.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&local)
            .with_context(|| format!("reading project config {}", local.display()))?;
        let ov: Self = toml::from_str(&content)
            .context("parsing .ted.toml")?;
        self.editor   = ov.editor;
        self.theme     = ov.theme;
        Ok(())
    }
}
