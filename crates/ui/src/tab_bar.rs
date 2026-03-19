use ratatui::{
    layout::Rect,
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::theme::Theme;

pub struct TabBar;

impl TabBar {
    pub fn render(
        frame:   &mut Frame,
        area:    Rect,
        tabs:    &[&str],
        active:  usize,
        dirty:   &[bool],
        theme:   &Theme,
    ) {
        let mut spans = Vec::new();
        for (i, &name) in tabs.iter().enumerate() {
            let marker = if dirty.get(i).copied().unwrap_or(false) { "●" } else { " " };
            let label  = format!(" {} {} ", name, marker);
            let style  = if i == active { theme.tab_active } else { theme.tab_inactive };
            spans.push(Span::styled(label, style));
            spans.push(Span::styled(" ", theme.tab_inactive));
        }
        frame.render_widget(Paragraph::new(Line::from(spans)), area);
    }
}
