use ratatui::{
    layout::Rect,
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};
use nova_core::mode::Mode;

use crate::theme::Theme;

pub struct StatusBar;

impl StatusBar {
    pub fn render(
        frame:    &mut Frame,
        area:     Rect,
        mode:     &Mode,
        filename: &str,
        dirty:    bool,
        line:     usize,
        col:      usize,
        total:    usize,
        branch:   &str,
        lsp_msg:  &str,
        theme:    &Theme,
    ) {
        let mode_str = format!(" {} ", mode);
        let dirty_marker = if dirty { " ● " } else { "   " };
        let file_part = format!(" {}{}", filename, dirty_marker);
        let branch_part = if branch.is_empty() {
            String::new()
        } else {
            format!("  {}", branch)
        };
        let pos_part   = format!(" {}:{} / {} ", line + 1, col + 1, total);
        let lsp_part   = if lsp_msg.is_empty() { String::new() } else { format!(" {} ", lsp_msg) };

        // Pad the middle section
        let left_len  = mode_str.len() + file_part.len() + branch_part.len();
        let right_len = pos_part.len() + lsp_part.len();
        let pad_len   = (area.width as usize).saturating_sub(left_len + right_len);
        let padding   = " ".repeat(pad_len);

        let line_widget = Line::from(vec![
            Span::styled(mode_str,    theme.status_bar_mode),
            Span::styled(file_part,   theme.status_bar),
            Span::styled(branch_part, theme.status_bar),
            Span::styled(padding,     theme.status_bar),
            Span::styled(lsp_part,    theme.status_bar),
            Span::styled(pos_part,    theme.status_bar),
        ]);

        frame.render_widget(Paragraph::new(line_widget), area);
    }
}
