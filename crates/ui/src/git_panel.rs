use ratatui::{
    layout::Rect,
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};
use nova_git::{FileStatus, FileStatusKind};

use crate::theme::Theme;

#[derive(Debug, Default)]
pub struct GitPanel {
    pub branch:   String,
    pub statuses: Vec<FileStatus>,
    pub state:    ListState,
    pub message:  String,  // commit message being typed
    pub composing: bool,   // true when typing a commit message
}

impl GitPanel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_data(&mut self, branch: String, statuses: Vec<FileStatus>) {
        self.branch   = branch;
        self.statuses = statuses;
        if self.state.selected().is_none() && !self.statuses.is_empty() {
            self.state.select(Some(0));
        }
    }

    pub fn move_up(&mut self) {
        let sel = self.state.selected().unwrap_or(0);
        if sel > 0 { self.state.select(Some(sel - 1)); }
    }

    pub fn move_down(&mut self) {
        let sel  = self.state.selected().unwrap_or(0);
        let last = self.statuses.len().saturating_sub(1);
        if sel < last { self.state.select(Some(sel + 1)); }
    }

    pub fn selected_status(&self) -> Option<&FileStatus> {
        self.state.selected().and_then(|i| self.statuses.get(i))
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect, theme: &Theme) {
        let block = Block::default()
            .title(format!("  {} ", self.branch))
            .borders(Borders::ALL)
            .border_style(theme.border)
            .style(theme.file_tree_bg);

        let inner = block.inner(area);
        frame.render_widget(block, area);

        // Commit bar at bottom (3 lines if composing)
        let (list_area, commit_area) = if self.composing {
            let split = inner.height.saturating_sub(4);
            (
                Rect { height: split, ..inner },
                Some(Rect { y: inner.y + split, height: 4, ..inner }),
            )
        } else {
            (inner, None)
        };

        let items: Vec<ListItem> = self
            .statuses
            .iter()
            .map(|s| {
                let (glyph, style) = match (&s.kind, s.staged) {
                    (FileStatusKind::Added,    true)  => ("A", theme.gutter_add),
                    (FileStatusKind::Modified, true)  => ("M", theme.gutter_change),
                    (FileStatusKind::Deleted,  true)  => ("D", theme.gutter_delete),
                    (FileStatusKind::Added,    false) |
                    (FileStatusKind::Untracked, _)    => ("?", theme.gutter_add),
                    (FileStatusKind::Modified, false) => ("~", theme.gutter_change),
                    (FileStatusKind::Deleted,  false) => ("!", theme.gutter_delete),
                    _                                  => (" ", theme.file_tree_file),
                };
                let path = s.path.to_string_lossy();
                let label = format!(" {} {}", glyph, path);
                ListItem::new(Line::from(Span::styled(label, style)))
            })
            .collect();

        if items.is_empty() {
            frame.render_widget(
                Paragraph::new("  Nothing to commit").style(theme.file_tree_file),
                list_area,
            );
        } else {
            let list = List::new(items)
                .highlight_style(theme.selection.add_modifier(Modifier::BOLD));
            frame.render_stateful_widget(list, list_area, &mut self.state);
        }

        if let Some(ca) = commit_area {
            let prompt = Line::from(vec![
                Span::styled(" Commit: ", theme.status_bar_mode),
                Span::styled(self.message.as_str(), theme.file_tree_file),
                Span::styled("█", theme.status_bar_mode),
            ]);
            frame.render_widget(Paragraph::new(prompt), ca);
        }
    }
}
