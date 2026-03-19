use std::path::{Path, PathBuf};

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};

use crate::theme::Theme;

pub struct FuzzyFinder {
    pub open:    bool,
    pub query:   String,
    all_files:   Vec<PathBuf>,
    pub matches: Vec<usize>,
    pub state:   ListState,
}

impl FuzzyFinder {
    pub fn new() -> Self {
        let mut state = ListState::default();
        state.select(Some(0));
        Self {
            open:      false,
            query:     String::new(),
            all_files: Vec::new(),
            matches:   Vec::new(),
            state,
        }
    }

    pub fn load_files(&mut self, root: &Path) {
        self.all_files.clear();
        collect_files(root, root, &mut self.all_files, 0);
        self.filter();
    }

    pub fn filter(&mut self) {
        let q = self.query.to_lowercase();
        self.matches = self
            .all_files
            .iter()
            .enumerate()
            .filter(|(_, p)| {
                let s = p.to_string_lossy().to_lowercase();
                if q.is_empty() { true } else { fuzzy_match(&s, &q) }
            })
            .map(|(i, _)| i)
            .collect();

        // Sort by score
        let all = &self.all_files;
        let q2 = q.clone();
        self.matches.sort_by_key(|&i| {
            let s = all[i].to_string_lossy().to_lowercase();
            fuzzy_score(&s, &q2)
        });

        self.state.select(if self.matches.is_empty() { None } else { Some(0) });
    }

    pub fn push_char(&mut self, c: char) {
        self.query.push(c);
        self.filter();
    }

    pub fn pop_char(&mut self) {
        self.query.pop();
        self.filter();
    }

    pub fn move_up(&mut self) {
        let sel = self.state.selected().unwrap_or(0);
        if sel > 0 { self.state.select(Some(sel - 1)); }
    }

    pub fn move_down(&mut self) {
        let sel  = self.state.selected().unwrap_or(0);
        let last = self.matches.len().saturating_sub(1);
        if sel < last { self.state.select(Some(sel + 1)); }
    }

    pub fn selected_path(&self) -> Option<&PathBuf> {
        let i = self.state.selected()?;
        let idx = *self.matches.get(i)?;
        self.all_files.get(idx)
    }

    pub fn reset(&mut self) {
        self.query.clear();
        self.filter();
        self.open = false;
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect, theme: &Theme) {
        let popup = centred_rect(60, 55, area);
        frame.render_widget(ratatui::widgets::Clear, popup);

        let block = Block::default()
            .title(" Go to File ")
            .borders(Borders::ALL)
            .border_style(theme.border)
            .style(theme.popup_bg);
        let inner = block.inner(popup);
        frame.render_widget(block, popup);

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(1), Constraint::Min(1)])
            .split(inner);

        let input_line = Line::from(vec![
            Span::styled("> ", theme.status_bar_mode),
            Span::styled(self.query.as_str(), theme.file_tree_file),
            Span::styled("█", theme.status_bar_mode),
        ]);
        frame.render_widget(Paragraph::new(input_line), chunks[0]);

        let items: Vec<ListItem> = self
            .matches
            .iter()
            .take(50)
            .map(|&idx| {
                let path = self.all_files[idx].to_string_lossy().to_string();
                ListItem::new(Line::from(Span::styled(format!(" {}", path), theme.file_tree_file)))
            })
            .collect();

        let list = List::new(items)
            .highlight_style(theme.selection.add_modifier(Modifier::BOLD));
        frame.render_stateful_widget(list, chunks[1], &mut self.state);
    }
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────

fn fuzzy_match(text: &str, pattern: &str) -> bool {
    let mut ti = text.chars();
    for pc in pattern.chars() {
        if !ti.any(|tc| tc == pc) {
            return false;
        }
    }
    true
}

/// Lower = better match
fn fuzzy_score(text: &str, pattern: &str) -> usize {
    if pattern.is_empty() { return 0; }
    // Consecutive match bonus
    if text.contains(pattern) { return 0; }
    text.len()
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > 8 { return; }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name == "target" || name == "node_modules" {
            continue;
        }
        if path.is_dir() {
            collect_files(root, &path, out, depth + 1);
        } else {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_path_buf());
            }
        }
    }
}

fn centred_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let h = r.height * percent_y / 100;
    let w = r.width  * percent_x / 100;
    Rect {
        x: r.x + (r.width  - w) / 2,
        y: r.y + (r.height - h) / 2,
        width:  w,
        height: h,
    }
}
