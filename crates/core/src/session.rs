use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SessionBuffer {
    pub path:        PathBuf,
    pub cursor_line: usize,
    pub cursor_col:  usize,
    pub scroll_top:  usize,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Session {
    pub buffers:       Vec<SessionBuffer>,
    pub active_buffer: usize,
    pub working_dir:   PathBuf,
}

impl Session {
    pub fn session_path() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("ted")
            .join("session.toml")
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::session_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating session dir {}", parent.display()))?;
        }
        let content = toml::to_string(self).context("serializing session")?;
        std::fs::write(&path, content)
            .with_context(|| format!("writing session to {}", path.display()))?;
        Ok(())
    }

    pub fn load() -> Result<Self> {
        let path = Self::session_path();
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("reading session from {}", path.display()))?;
        let session = toml::from_str(&content).context("parsing session")?;
        Ok(session)
    }

    pub fn clear() -> Result<()> {
        let path = Self::session_path();
        if path.exists() {
            std::fs::remove_file(&path)
                .with_context(|| format!("removing session file {}", path.display()))?;
        }
        Ok(())
    }
}
