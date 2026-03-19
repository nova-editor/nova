use std::io::Write;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::theme::Theme;

/// Output ring-buffer: last N lines from the pty
const MAX_LINES: usize = 2000;

pub struct TerminalPane {
    pub active:  bool,
    lines:       Arc<Mutex<Vec<String>>>,
    writer:      Option<Box<dyn Write + Send>>,
    scroll_top:  usize,
}

impl TerminalPane {
    pub fn new() -> Self {
        Self {
            active:     false,
            lines:      Arc::new(Mutex::new(Vec::new())),
            writer:     None,
            scroll_top: 0,
        }
    }

    /// Spawn the shell. Call once on first open.
    pub fn spawn(&mut self, rows: u16, cols: u16) -> Result<()> {
        if self.writer.is_some() {
            return Ok(()); // already running
        }

        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .context("opening pty")?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.env("TERM", "xterm-256color");

        let _child = pair.slave.spawn_command(cmd).context("spawning shell")?;

        self.writer = Some(pair.master.take_writer().context("getting pty writer")?);

        let mut reader = pair.master.try_clone_reader().context("cloning pty reader")?;
        let lines_ref  = Arc::clone(&self.lines);

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut partial = String::new();
            loop {
                let n = match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n)          => n,
                };
                partial.push_str(&String::from_utf8_lossy(&buf[..n]));
                let mut lines = lines_ref.lock().unwrap();
                for ch in partial.drain(..) {
                    if ch == '\n' {
                        if lines.len() >= MAX_LINES {
                            lines.remove(0);
                        }
                        lines.push(String::new());
                    } else if ch == '\r' {
                        // carriage return — reset current line
                    } else if ch.is_control() {
                        // skip other control chars
                    } else {
                        if lines.is_empty() { lines.push(String::new()); }
                        lines.last_mut().unwrap().push(ch);
                    }
                }
            }
        });

        Ok(())
    }

    pub fn send_input(&mut self, input: &str) {
        if let Some(w) = &mut self.writer {
            let _ = w.write_all(input.as_bytes());
            let _ = w.flush();
        }
    }

    pub fn send_char(&mut self, c: char) {
        let mut buf = [0u8; 4];
        let s = c.encode_utf8(&mut buf);
        self.send_input(s);
    }

    pub fn scroll_up(&mut self) {
        self.scroll_top = self.scroll_top.saturating_sub(3);
    }

    pub fn scroll_down(&mut self) {
        let len = self.lines.lock().unwrap().len();
        self.scroll_top = (self.scroll_top + 3).min(len.saturating_sub(1));
    }

    pub fn render(&self, frame: &mut Frame, area: Rect, theme: &Theme) {
        let block = Block::default()
            .title("  Terminal ")
            .borders(Borders::TOP)
            .border_style(theme.border)
            .style(Style::default().bg(theme.bg));

        let inner = block.inner(area);
        frame.render_widget(block, area);

        let lines_guard = self.lines.lock().unwrap();
        let vh          = inner.height as usize;
        let total       = lines_guard.len();

        // scroll_top 0 = stick to bottom
        let offset = if self.scroll_top == 0 {
            total.saturating_sub(vh)
        } else {
            self.scroll_top.min(total.saturating_sub(vh))
        };

        let visible: Vec<Line<'_>> = lines_guard[offset..]
            .iter()
            .take(vh)
            .map(|l| Line::from(Span::styled(l.as_str(), theme.file_tree_file)))
            .collect();

        frame.render_widget(Paragraph::new(visible), inner);
    }
}

// trait object needs Read
use std::io::Read;
