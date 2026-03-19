use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};

use crate::theme::Theme;

#[derive(Debug, Clone)]
pub struct PaletteEntry {
    pub name:        String,
    pub description: String,
    pub action_tag:  String,
}

pub struct CommandPalette {
    pub open:     bool,
    pub query:    String,
    entries:      Vec<PaletteEntry>,
    filtered:     Vec<usize>,
    pub state:    ListState,
}

impl CommandPalette {
    pub fn new() -> Self {
        let entries = Self::all_commands();
        let filtered: Vec<usize> = (0..entries.len()).collect();
        let mut state = ListState::default();
        state.select(Some(0));
        Self { open: false, query: String::new(), entries, filtered, state }
    }

    fn all_commands() -> Vec<PaletteEntry> {
        vec![
            PaletteEntry { name: "Save".into(),             description: "Save current file".into(),           action_tag: "save".into() },
            PaletteEntry { name: "Save As…".into(),         description: "Save with a new name".into(),        action_tag: "save_as".into() },
            PaletteEntry { name: "Quit".into(),             description: "Quit the editor".into(),             action_tag: "quit".into() },
            PaletteEntry { name: "Force Quit".into(),       description: "Quit without saving".into(),         action_tag: "force_quit".into() },
            PaletteEntry { name: "New File".into(),         description: "Open a scratch buffer".into(),       action_tag: "new_buffer".into() },
            PaletteEntry { name: "Close Buffer".into(),     description: "Close current buffer".into(),        action_tag: "close_buffer".into() },
            PaletteEntry { name: "Next Buffer".into(),      description: "Switch to next tab".into(),          action_tag: "next_buffer".into() },
            PaletteEntry { name: "Prev Buffer".into(),      description: "Switch to previous tab".into(),      action_tag: "prev_buffer".into() },
            PaletteEntry { name: "Toggle File Tree".into(), description: "Show/hide file explorer".into(),     action_tag: "toggle_file_tree".into() },
            PaletteEntry { name: "Toggle Terminal".into(),  description: "Show/hide embedded terminal".into(), action_tag: "toggle_terminal".into() },
            PaletteEntry { name: "Toggle Git Panel".into(), description: "Show/hide git panel".into(),         action_tag: "toggle_git_panel".into() },
            PaletteEntry { name: "Fuzzy Finder".into(),     description: "Open file fuzzy finder".into(),      action_tag: "fuzzy_finder".into() },
            PaletteEntry { name: "Go to Definition".into(), description: "LSP go-to-definition".into(),        action_tag: "goto_definition".into() },
            PaletteEntry { name: "Hover Docs".into(),       description: "Show LSP hover documentation".into(), action_tag: "hover_docs".into() },
            PaletteEntry { name: "Format Document".into(),  description: "LSP format".into(),                  action_tag: "format_document".into() },
            PaletteEntry { name: "Next Diagnostic".into(),  description: "Jump to next error/warning".into(),  action_tag: "next_diagnostic".into() },
            PaletteEntry { name: "Rename Symbol".into(),    description: "LSP rename".into(),                  action_tag: "rename_symbol".into() },
            PaletteEntry { name: "Split Vertical".into(),   description: "Split editor vertically".into(),     action_tag: "split_vertical".into() },
            PaletteEntry { name: "Split Horizontal".into(), description: "Split editor horizontally".into(),   action_tag: "split_horizontal".into() },
            PaletteEntry { name: "Git Commit".into(),       description: "Open git commit panel".into(),       action_tag: "git_commit".into() },
            PaletteEntry { name: "Git Branch".into(),       description: "Open branch switcher".into(),        action_tag: "git_branch".into() },
        ]
    }

    pub fn filter(&mut self) {
        let q = self.query.to_lowercase();
        self.filtered = self
            .entries
            .iter()
            .enumerate()
            .filter(|(_, e)| {
                e.name.to_lowercase().contains(&q)
                    || e.description.to_lowercase().contains(&q)
            })
            .map(|(i, _)| i)
            .collect();
        self.state.select(if self.filtered.is_empty() { None } else { Some(0) });
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
        let last = self.filtered.len().saturating_sub(1);
        if sel < last { self.state.select(Some(sel + 1)); }
    }

    pub fn selected_action(&self) -> Option<&str> {
        let i = self.state.selected()?;
        let entry_idx = *self.filtered.get(i)?;
        Some(&self.entries[entry_idx].action_tag)
    }

    pub fn reset(&mut self) {
        self.query.clear();
        self.filter();
        self.open = false;
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect, theme: &Theme) {
        // Centre a popup in the given area
        let popup = centred_rect(60, 50, area);

        frame.render_widget(ratatui::widgets::Clear, popup);

        let block = Block::default()
            .title(" Command Palette ")
            .borders(Borders::ALL)
            .border_style(theme.border)
            .style(theme.popup_bg);

        let inner = block.inner(popup);
        frame.render_widget(block, popup);

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(1), Constraint::Min(1)])
            .split(inner);

        // Query input
        let input_line = Line::from(vec![
            Span::styled("> ", theme.status_bar_mode),
            Span::styled(self.query.as_str(), theme.file_tree_file),
            Span::styled("█", theme.status_bar_mode),
        ]);
        frame.render_widget(Paragraph::new(input_line), chunks[0]);

        // Results
        let items: Vec<ListItem> = self
            .filtered
            .iter()
            .map(|&idx| {
                let e = &self.entries[idx];
                ListItem::new(Line::from(vec![
                    Span::styled(format!(" {:25}", e.name), theme.file_tree_file),
                    Span::styled(format!("  {}", e.description), theme.line_number),
                ]))
            })
            .collect();

        let list = List::new(items)
            .highlight_style(theme.selection.add_modifier(Modifier::BOLD));
        frame.render_stateful_widget(list, chunks[1], &mut self.state);
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
