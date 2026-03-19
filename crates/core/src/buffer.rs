use anyhow::{Context, Result};
use ropey::Rope;
use std::path::{Path, PathBuf};

use crate::cursor::{Cursor, Position};
use crate::undo::{EditOp, Transaction, UndoStack};

#[derive(Debug)]
pub struct Buffer {
    pub path:       Option<PathBuf>,
    pub rope:       Rope,
    pub cursor:     Cursor,
    pub scroll_top: usize,
    pub dirty:      bool,
    pub undo_stack: UndoStack,
    pub name:       String,
    /// Clipboard (yank register)
    pub register:   String,
}

impl Buffer {
    pub fn new_scratch() -> Self {
        Self {
            path:       None,
            rope:       Rope::new(),
            cursor:     Cursor::new(),
            scroll_top: 0,
            dirty:      false,
            undo_stack: UndoStack::default(),
            name:       "[scratch]".to_string(),
            register:   String::new(),
        }
    }

    pub fn from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let content = if path.exists() {
            std::fs::read_to_string(path)
                .with_context(|| format!("reading {}", path.display()))?
        } else {
            String::new()
        };
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        Ok(Self {
            path:       Some(path.to_path_buf()),
            rope:       Rope::from_str(&content),
            cursor:     Cursor::new(),
            scroll_top: 0,
            dirty:      false,
            undo_stack: UndoStack::default(),
            name,
            register:   String::new(),
        })
    }

    pub fn save(&mut self) -> Result<PathBuf> {
        let path = self.path.clone().context("buffer has no file path")?;
        let content = self.rope.to_string();
        std::fs::write(&path, content)
            .with_context(|| format!("writing {}", path.display()))?;
        self.dirty = false;
        Ok(path)
    }

    pub fn save_as(&mut self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref().to_path_buf();
        let content = self.rope.to_string();
        std::fs::write(&path, &content)
            .with_context(|| format!("writing {}", path.display()))?;
        self.name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.path = Some(path);
        self.dirty = false;
        Ok(())
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    pub fn line_count(&self) -> usize {
        let n = self.rope.len_lines();
        // ropey counts a trailing newline as an extra empty line — normalise
        if n > 0 && self.rope.len_chars() > 0 {
            let last_char = self.rope.char(self.rope.len_chars() - 1);
            if last_char == '\n' { n.saturating_sub(1).max(1) } else { n }
        } else {
            n.max(1)
        }
    }

    pub fn line(&self, line_idx: usize) -> String {
        if line_idx >= self.rope.len_lines() {
            return String::new();
        }
        self.rope.line(line_idx).to_string().trim_end_matches('\n').to_string()
    }

    pub fn line_len(&self, line_idx: usize) -> usize {
        self.line(line_idx).chars().count()
    }

    pub fn content(&self) -> String {
        self.rope.to_string()
    }

    /// Convert a (line, col) position to a rope char index.
    pub fn pos_to_char_idx(&self, pos: &Position) -> usize {
        if pos.line >= self.rope.len_lines() {
            return self.rope.len_chars();
        }
        let line_start = self.rope.line_to_char(pos.line);
        let line_len   = self.line_len(pos.line);
        line_start + pos.col.min(line_len)
    }

    // ── Editing ───────────────────────────────────────────────────────────────

    pub fn insert_char(&mut self, ch: char) {
        let char_idx = self.pos_to_char_idx(&self.cursor.pos);
        self.rope.insert_char(char_idx, ch);
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: ch.to_string(),
        }));
        self.dirty = true;
        if ch == '\n' {
            self.cursor.pos.line    += 1;
            self.cursor.pos.col      = 0;
            self.cursor.desired_col  = 0;
        } else {
            self.cursor.pos.col     += 1;
            self.cursor.desired_col  = self.cursor.pos.col;
        }
    }

    pub fn insert_str_at_cursor(&mut self, s: &str) {
        if s.is_empty() {
            return;
        }
        let char_idx = self.pos_to_char_idx(&self.cursor.pos);
        self.rope.insert(char_idx, s);
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: s.to_string(),
        }));
        self.dirty = true;
        let newlines = s.chars().filter(|&c| c == '\n').count();
        if newlines > 0 {
            self.cursor.pos.line += newlines;
            self.cursor.pos.col   = s.lines().last().unwrap_or("").chars().count();
        } else {
            self.cursor.pos.col += s.chars().count();
        }
        self.cursor.desired_col = self.cursor.pos.col;
    }

    /// Insert a blank line below current and move into it (normal-mode 'o').
    pub fn open_line_below(&mut self) {
        let line_len  = self.line_len(self.cursor.pos.line);
        let char_idx  = self.pos_to_char_idx(&Position::new(self.cursor.pos.line, line_len));
        self.rope.insert_char(char_idx, '\n');
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: "\n".to_string(),
        }));
        self.dirty               = true;
        self.cursor.pos.line    += 1;
        self.cursor.pos.col      = 0;
        self.cursor.desired_col  = 0;
    }

    /// Insert a blank line above current and move into it (normal-mode 'O').
    pub fn open_line_above(&mut self) {
        let char_idx = self.rope.line_to_char(self.cursor.pos.line);
        self.rope.insert_char(char_idx, '\n');
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: "\n".to_string(),
        }));
        self.dirty               = true;
        self.cursor.pos.col      = 0;
        self.cursor.desired_col  = 0;
    }

    pub fn backspace(&mut self) {
        let pos = self.cursor.pos.clone();
        if pos.col == 0 && pos.line == 0 {
            return;
        }
        if pos.col > 0 {
            let char_idx = self.pos_to_char_idx(&pos) - 1;
            let ch = self.rope.char(char_idx).to_string();
            self.rope.remove(char_idx..char_idx + 1);
            self.undo_stack.push(Transaction::single(EditOp::Delete { char_idx, text: ch }));
            self.cursor.pos.col    -= 1;
            self.cursor.desired_col = self.cursor.pos.col;
        } else {
            let prev_line_len = self.line_len(pos.line - 1);
            let char_idx      = self.pos_to_char_idx(&Position::new(pos.line - 1, prev_line_len));
            self.rope.remove(char_idx..char_idx + 1);
            self.undo_stack.push(Transaction::single(EditOp::Delete {
                char_idx,
                text: "\n".to_string(),
            }));
            self.cursor.pos.line   -= 1;
            self.cursor.pos.col     = prev_line_len;
            self.cursor.desired_col = prev_line_len;
        }
        self.dirty = true;
    }

    pub fn delete_char_at_cursor(&mut self) {
        let char_idx = self.pos_to_char_idx(&self.cursor.pos);
        if char_idx >= self.rope.len_chars() {
            return;
        }
        let ch = self.rope.char(char_idx).to_string();
        self.rope.remove(char_idx..char_idx + 1);
        self.undo_stack.push(Transaction::single(EditOp::Delete { char_idx, text: ch }));
        self.dirty = true;
        self.clamp_cursor();
    }

    pub fn delete_line(&mut self) {
        let line  = self.cursor.pos.line;
        let lines = self.line_count();
        if lines == 0 {
            return;
        }
        let line_start = self.rope.line_to_char(line);
        let line_end   = if line + 1 < self.rope.len_lines() {
            self.rope.line_to_char(line + 1)
        } else {
            self.rope.len_chars()
        };
        let deleted = self.rope.slice(line_start..line_end).to_string();
        self.register = deleted.trim_end_matches('\n').to_string();
        self.rope.remove(line_start..line_end);
        self.undo_stack.push(Transaction::single(EditOp::Delete {
            char_idx: line_start,
            text:     deleted,
        }));
        self.dirty = true;
        let new_lines = self.line_count();
        if self.cursor.pos.line >= new_lines && new_lines > 0 {
            self.cursor.pos.line = new_lines - 1;
        }
        self.cursor.pos.col     = 0;
        self.cursor.desired_col = 0;
    }

    pub fn delete_to_line_end(&mut self) {
        let line     = self.cursor.pos.line;
        let line_len = self.line_len(line);
        if self.cursor.pos.col >= line_len {
            return;
        }
        let from = self.pos_to_char_idx(&self.cursor.pos);
        let to   = self.pos_to_char_idx(&Position::new(line, line_len));
        let deleted = self.rope.slice(from..to).to_string();
        self.register = deleted.clone();
        self.rope.remove(from..to);
        self.undo_stack.push(Transaction::single(EditOp::Delete { char_idx: from, text: deleted }));
        self.dirty = true;
        self.clamp_cursor();
    }

    pub fn yank_line(&mut self) {
        self.register = self.line(self.cursor.pos.line);
    }

    pub fn paste_after(&mut self) {
        if self.register.is_empty() {
            return;
        }
        let text = self.register.clone();
        // If register looks like a line (no newline), paste on new line below
        let insert_text = format!("\n{}", text);
        let line_len  = self.line_len(self.cursor.pos.line);
        let char_idx  = self.pos_to_char_idx(&Position::new(self.cursor.pos.line, line_len));
        self.rope.insert(char_idx, &insert_text);
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: insert_text,
        }));
        self.dirty               = true;
        self.cursor.pos.line    += 1;
        self.cursor.pos.col      = 0;
        self.cursor.desired_col  = 0;
    }

    pub fn paste_before(&mut self) {
        if self.register.is_empty() {
            return;
        }
        let text = self.register.clone();
        let insert_text = format!("{}\n", text);
        let char_idx = self.rope.line_to_char(self.cursor.pos.line);
        self.rope.insert(char_idx, &insert_text);
        self.undo_stack.push(Transaction::single(EditOp::Insert {
            char_idx,
            text: insert_text,
        }));
        self.dirty = true;
    }

    // ── Undo / Redo ──────────────────────────────────────────────────────────

    pub fn undo(&mut self) {
        if self.undo_stack.undo(&mut self.rope) {
            self.dirty = true;
            self.clamp_cursor();
        }
    }

    pub fn redo(&mut self) {
        if self.undo_stack.redo(&mut self.rope) {
            self.dirty = true;
            self.clamp_cursor();
        }
    }

    // ── Cursor movement ──────────────────────────────────────────────────────

    pub fn move_up(&mut self) {
        if self.cursor.pos.line > 0 {
            self.cursor.pos.line -= 1;
            let ll = self.line_len(self.cursor.pos.line);
            self.cursor.pos.col = self.cursor.desired_col.min(ll.saturating_sub(1));
        }
    }

    pub fn move_down(&mut self) {
        if self.cursor.pos.line + 1 < self.line_count() {
            self.cursor.pos.line += 1;
            let ll = self.line_len(self.cursor.pos.line);
            self.cursor.pos.col = self.cursor.desired_col.min(ll.saturating_sub(1));
        }
    }

    pub fn move_left(&mut self) {
        if self.cursor.pos.col > 0 {
            self.cursor.pos.col    -= 1;
            self.cursor.desired_col = self.cursor.pos.col;
        }
    }

    pub fn move_right(&mut self) {
        let ll = self.line_len(self.cursor.pos.line);
        if self.cursor.pos.col + 1 < ll {
            self.cursor.pos.col    += 1;
            self.cursor.desired_col = self.cursor.pos.col;
        }
    }

    pub fn move_line_start(&mut self) {
        self.cursor.pos.col     = 0;
        self.cursor.desired_col = 0;
    }

    pub fn move_line_end(&mut self) {
        let ll = self.line_len(self.cursor.pos.line);
        self.cursor.pos.col     = ll.saturating_sub(1);
        self.cursor.desired_col = self.cursor.pos.col;
    }

    pub fn move_word_forward(&mut self) {
        let chars: Vec<char> = self.line(self.cursor.pos.line).chars().collect();
        let mut col = self.cursor.pos.col;
        while col < chars.len() && chars[col].is_alphanumeric() { col += 1; }
        while col < chars.len() && !chars[col].is_alphanumeric() { col += 1; }
        self.cursor.pos.col     = col.min(chars.len().saturating_sub(1));
        self.cursor.desired_col = self.cursor.pos.col;
    }

    pub fn move_word_back(&mut self) {
        let chars: Vec<char> = self.line(self.cursor.pos.line).chars().collect();
        let mut col = self.cursor.pos.col;
        if col == 0 { return; }
        col -= 1;
        while col > 0 && !chars[col].is_alphanumeric() { col -= 1; }
        while col > 0 && chars[col - 1].is_alphanumeric() { col -= 1; }
        self.cursor.pos.col     = col;
        self.cursor.desired_col = col;
    }

    pub fn move_to_line(&mut self, line: usize) {
        self.cursor.pos.line = line.min(self.line_count().saturating_sub(1));
        let ll = self.line_len(self.cursor.pos.line);
        self.cursor.pos.col  = self.cursor.desired_col.min(ll.saturating_sub(1));
    }

    pub fn move_to_first_line(&mut self) {
        self.cursor.pos.line    = 0;
        self.cursor.pos.col     = 0;
        self.cursor.desired_col = 0;
    }

    pub fn move_to_last_line(&mut self) {
        self.cursor.pos.line    = self.line_count().saturating_sub(1);
        self.cursor.pos.col     = 0;
        self.cursor.desired_col = 0;
    }

    pub fn page_up(&mut self, viewport_height: usize) {
        let lines = viewport_height.saturating_sub(2).max(1);
        self.cursor.pos.line    = self.cursor.pos.line.saturating_sub(lines);
        self.scroll_top         = self.scroll_top.saturating_sub(lines);
        let ll = self.line_len(self.cursor.pos.line);
        self.cursor.pos.col     = self.cursor.desired_col.min(ll.saturating_sub(1));
    }

    pub fn page_down(&mut self, viewport_height: usize) {
        let lines      = viewport_height.saturating_sub(2).max(1);
        let max_line   = self.line_count().saturating_sub(1);
        self.cursor.pos.line = (self.cursor.pos.line + lines).min(max_line);
        self.scroll_top      = (self.scroll_top + lines).min(max_line);
        let ll = self.line_len(self.cursor.pos.line);
        self.cursor.pos.col  = self.cursor.desired_col.min(ll.saturating_sub(1));
    }

    /// Adjust `scroll_top` so the cursor is within `viewport_height` rows.
    pub fn scroll_to_cursor(&mut self, viewport_height: usize, scroll_off: usize) {
        let line = self.cursor.pos.line;
        // Scroll up
        if line < self.scroll_top + scroll_off {
            self.scroll_top = line.saturating_sub(scroll_off);
        }
        // Scroll down
        let bottom_edge = self.scroll_top + viewport_height.saturating_sub(1 + scroll_off);
        if line > bottom_edge {
            self.scroll_top = line + scroll_off + 1 - viewport_height;
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    pub fn search_forward(&self, pattern: &str, from: &Position) -> Option<Position> {
        let total = self.line_count();
        if total == 0 || pattern.is_empty() {
            return None;
        }
        for i in 0..total {
            let line_idx = (from.line + i) % total;
            let line     = self.line(line_idx);
            let start_byte = if i == 0 {
                line.char_indices().nth(from.col + 1).map(|(b, _)| b).unwrap_or(line.len())
            } else {
                0
            };
            if let Some(byte_pos) = line[start_byte..].find(pattern) {
                let col = line[..start_byte + byte_pos].chars().count();
                return Some(Position::new(line_idx, col));
            }
        }
        None
    }

    pub fn search_backward(&self, pattern: &str, from: &Position) -> Option<Position> {
        let total = self.line_count();
        if total == 0 || pattern.is_empty() {
            return None;
        }
        for i in 0..total {
            let line_idx   = (from.line + total - i) % total;
            let line       = self.line(line_idx);
            let search_in  = if i == 0 {
                let end = line.char_indices().nth(from.col).map(|(b, _)| b).unwrap_or(line.len());
                &line[..end]
            } else {
                &line[..]
            };
            if let Some(byte_pos) = search_in.rfind(pattern) {
                let col = search_in[..byte_pos].chars().count();
                return Some(Position::new(line_idx, col));
            }
        }
        None
    }

    pub fn replace_all(&mut self, from: &str, to: &str) {
        let content = self.rope.to_string().replace(from, to);
        self.rope  = Rope::from_str(&content);
        self.dirty = true;
        self.clamp_cursor();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn clamp_cursor(&mut self) {
        let lines = self.line_count().max(1);
        self.cursor.pos.line = self.cursor.pos.line.min(lines - 1);
        let ll = self.line_len(self.cursor.pos.line);
        if ll == 0 {
            self.cursor.pos.col = 0;
        } else {
            self.cursor.pos.col = self.cursor.pos.col.min(ll - 1);
        }
    }
}
