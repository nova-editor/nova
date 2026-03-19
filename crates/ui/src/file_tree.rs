use std::path::{Path, PathBuf};

use ratatui::{
    layout::Rect,
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, List, ListItem, ListState},
    Frame,
};

use crate::theme::Theme;

#[derive(Debug, Clone)]
pub struct TreeEntry {
    pub path:     PathBuf,
    pub is_dir:   bool,
    pub depth:    usize,
    pub expanded: bool,
}

#[derive(Debug)]
pub struct FileTree {
    pub root:    PathBuf,
    pub entries: Vec<TreeEntry>,
    pub state:   ListState,
}

impl FileTree {
    pub fn new(root: PathBuf) -> Self {
        let mut tree = Self {
            root:    root.clone(),
            entries: Vec::new(),
            state:   ListState::default(),
        };
        tree.refresh();
        tree.state.select(Some(0));
        tree
    }

    pub fn refresh(&mut self) {
        self.entries.clear();
        self.collect_entries(&self.root.clone(), 0);
    }

    fn collect_entries(&mut self, dir: &Path, depth: usize) {
        let mut entries: Vec<(PathBuf, bool)> = std::fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let path   = e.path();
                let is_dir = path.is_dir();
                // Skip hidden files at root level, but allow them deeper
                let name = path.file_name()?.to_string_lossy().to_string();
                if depth == 0 && name.starts_with('.') && name != ".ted.toml" {
                    return None;
                }
                Some((path, is_dir))
            })
            .collect();

        // Dirs first, then files, both alphabetically
        entries.sort_by(|(a, a_dir), (b, b_dir)| {
            b_dir.cmp(a_dir).then_with(|| a.cmp(b))
        });

        for (path, is_dir) in entries {
            let entry = TreeEntry { path: path.clone(), is_dir, depth, expanded: false };
            self.entries.push(entry);
        }
    }

    /// Toggle expand/collapse of the selected directory.
    pub fn toggle_expand(&mut self) {
        let idx = match self.state.selected() {
            Some(i) => i,
            None    => return,
        };
        if !self.entries[idx].is_dir {
            return;
        }
        let entry = self.entries[idx].clone();
        if entry.expanded {
            // Collapse: remove all children
            let depth    = entry.depth;
            let mut end  = idx + 1;
            while end < self.entries.len() && self.entries[end].depth > depth {
                end += 1;
            }
            self.entries.drain(idx + 1..end);
            self.entries[idx].expanded = false;
        } else {
            // Expand: insert children right after idx
            let mut children: Vec<TreeEntry> = Vec::new();
            let depth = entry.depth + 1;
            let mut sub_entries: Vec<(PathBuf, bool)> = std::fs::read_dir(&entry.path)
                .into_iter()
                .flatten()
                .flatten()
                .filter_map(|e| {
                    let path   = e.path();
                    let is_dir = path.is_dir();
                    let name   = path.file_name()?.to_string_lossy().to_string();
                    if name.starts_with('.') { return None; }
                    Some((path, is_dir))
                })
                .collect();
            sub_entries.sort_by(|(a, a_dir), (b, b_dir)| b_dir.cmp(a_dir).then_with(|| a.cmp(b)));
            for (path, is_dir) in sub_entries {
                children.push(TreeEntry { path, is_dir, depth, expanded: false });
            }
            let insert_pos = idx + 1;
            for (offset, child) in children.into_iter().enumerate() {
                self.entries.insert(insert_pos + offset, child);
            }
            self.entries[idx].expanded = true;
        }
    }

    pub fn selected_path(&self) -> Option<&PathBuf> {
        self.state.selected().map(|i| &self.entries[i].path)
    }

    pub fn move_up(&mut self) {
        let sel = self.state.selected().unwrap_or(0);
        if sel > 0 {
            self.state.select(Some(sel - 1));
        }
    }

    pub fn move_down(&mut self) {
        let sel  = self.state.selected().unwrap_or(0);
        let last = self.entries.len().saturating_sub(1);
        if sel < last {
            self.state.select(Some(sel + 1));
        }
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect, theme: &Theme) {
        let items: Vec<ListItem> = self
            .entries
            .iter()
            .map(|e| {
                let indent = "  ".repeat(e.depth);
                let icon = if e.is_dir {
                    if e.expanded { "▼ " } else { "▶ " }
                } else {
                    "  "
                };
                let name = e
                    .path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let style = if e.is_dir { theme.file_tree_dir } else { theme.file_tree_file };
                let label = format!("{}{}{}", indent, icon, name);
                ListItem::new(Line::from(Span::styled(label, style)))
            })
            .collect();

        let list = List::new(items)
            .block(Block::default())
            .highlight_style(theme.selection.add_modifier(Modifier::BOLD));

        frame.render_stateful_widget(list, area, &mut self.state);
    }
}
