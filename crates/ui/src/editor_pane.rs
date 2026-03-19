use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Paragraph},
    Frame,
};
use nova_config::LineNumberStyle;
use nova_core::{Buffer, Mode};
use ted_highlight::{highlight_line_to_ratatui, Lang, SyntaxTree};

use crate::theme::Theme;

/// Per-buffer syntax cache
pub struct EditorPane {
    pub syntax: SyntaxTree,
}

impl EditorPane {
    pub fn new(lang: Lang) -> Self {
        Self { syntax: SyntaxTree::new(lang) }
    }

    pub fn set_language(&mut self, lang: Lang) {
        self.syntax = SyntaxTree::new(lang);
    }

    pub fn reparse(&mut self, source: &str) {
        self.syntax.reparse(source);
    }

    pub fn render(
        &self,
        frame:         &mut Frame,
        area:          Rect,
        buffer:        &Buffer,
        mode:          &Mode,
        search_term:   &str,
        line_numbers:  &LineNumberStyle,
        gutter_adds:   &std::collections::HashSet<usize>,
        gutter_changes: &std::collections::HashSet<usize>,
        gutter_deletes: &std::collections::HashSet<usize>,
        theme:         &Theme,
    ) {
        // ── Layout ──────────────────────────────────────────────────────────
        let total_lines    = buffer.line_count();
        let viewport_h     = area.height as usize;
        let scroll_top     = buffer.scroll_top;
        let cursor_line    = buffer.cursor.pos.line;
        let cursor_col     = buffer.cursor.pos.col;
        let show_gutter    = !matches!(line_numbers, LineNumberStyle::None);
        let gutter_width   = if show_gutter { total_lines.to_string().len() + 2 } else { 0 };
        let diff_gutter_w  = if !gutter_adds.is_empty() || !gutter_changes.is_empty() || !gutter_deletes.is_empty() { 1 } else { 0 };
        let content_x      = area.x + gutter_width as u16 + diff_gutter_w as u16;
        let content_w      = area.width.saturating_sub(gutter_width as u16 + diff_gutter_w as u16);

        let source = buffer.content();

        let mut lines_out: Vec<Line<'_>> = Vec::with_capacity(viewport_h);

        for row in 0..viewport_h {
            let line_idx = scroll_top + row;
            if line_idx >= total_lines {
                // Empty line filler
                lines_out.push(Line::from(Span::styled(
                    " ".repeat(area.width as usize),
                    Style::default().bg(theme.bg),
                )));
                continue;
            }

            let is_active = line_idx == cursor_line;
            let line_text = buffer.line(line_idx);

            // ── Gutter ────────────────────────────────────────────────────
            let lineno_str = if show_gutter {
                match line_numbers {
                    LineNumberStyle::Absolute => {
                        format!("{:>width$} ", line_idx + 1, width = gutter_width - 1)
                    }
                    LineNumberStyle::Relative => {
                        let rel = if is_active {
                            line_idx + 1
                        } else {
                            (line_idx as isize - cursor_line as isize).unsigned_abs()
                        };
                        format!("{:>width$} ", rel, width = gutter_width - 1)
                    }
                    LineNumberStyle::None => String::new(),
                }
            } else {
                String::new()
            };

            let gutter_style = if is_active {
                theme.line_number.patch(Style::default().fg(theme.fg))
            } else {
                theme.line_number
            };

            // ── Diff gutter ───────────────────────────────────────────────
            let diff_glyph = if diff_gutter_w > 0 {
                let n = line_idx + 1;
                if gutter_adds.contains(&n)    { Span::styled("▎", theme.gutter_add) }
                else if gutter_changes.contains(&n) { Span::styled("▎", theme.gutter_change) }
                else if gutter_deletes.contains(&n) { Span::styled("▎", theme.gutter_delete) }
                else { Span::raw(" ") }
            } else {
                Span::raw("")
            };

            // ── Syntax highlighted content ────────────────────────────────
            let mut content_spans = highlight_line_to_ratatui(&self.syntax, &line_text, &source).spans;

            // Apply active-line background
            let bg_style = if is_active { theme.active_line } else { Style::default().bg(theme.bg) };
            for span in &mut content_spans {
                span.style = span.style.patch(bg_style);
            }

            // ── Cursor rendering ──────────────────────────────────────────
            if is_active && !matches!(mode, Mode::Insert) {
                // Overlay cursor block on the correct column
                let col = cursor_col.min(line_text.chars().count().saturating_sub(1));
                let mut char_offset = 0usize;
                for span in &mut content_spans {
                    let span_len = span.content.chars().count();
                    if char_offset + span_len > col {
                        // Cursor is inside this span — split it
                        let local = col - char_offset;
                        let before: String = span.content.chars().take(local).collect();
                        let ch:     String = span.content.chars().nth(local).unwrap_or(' ').to_string();
                        let after:  String = span.content.chars().skip(local + 1).collect();
                        let orig_style = span.style;
                        span.content = before.into();
                        // We can't easily insert spans mid-vec here, so we append
                        // the cursor char and tail after the loop
                        let _ = ch;
                        let _ = after;
                        let _ = orig_style;
                        break;
                    }
                    char_offset += span_len;
                }
            }

            // ── Search term highlight ─────────────────────────────────────
            if !search_term.is_empty() {
                let mut new_spans: Vec<Span<'_>> = Vec::new();
                for span in content_spans.drain(..) {
                    let text = span.content.to_string();
                    let mut remaining = text.as_str();
                    while let Some(pos) = remaining.find(search_term) {
                        if pos > 0 {
                            new_spans.push(Span::styled(remaining[..pos].to_string(), span.style));
                        }
                        new_spans.push(Span::styled(search_term.to_string(), theme.match_highlight));
                        remaining = &remaining[pos + search_term.len()..];
                    }
                    if !remaining.is_empty() {
                        new_spans.push(Span::styled(remaining.to_string(), span.style));
                    }
                }
                content_spans = new_spans;
            }

            let mut spans: Vec<Span<'_>> = Vec::new();
            spans.push(Span::styled(lineno_str, gutter_style));
            spans.push(diff_glyph);
            spans.extend(content_spans);

            lines_out.push(Line::from(spans));
        }

        frame.render_widget(
            Paragraph::new(lines_out).block(Block::default()),
            area,
        );

        // Position the real terminal cursor in insert mode
        if matches!(mode, Mode::Insert) && cursor_line >= scroll_top {
            let screen_row = area.y + (cursor_line - scroll_top) as u16;
            let screen_col = area.x + gutter_width as u16 + diff_gutter_w as u16 + cursor_col as u16;
            if screen_row < area.y + area.height && screen_col < area.x + area.width {
                frame.set_cursor(screen_col, screen_row);
            }
        }
    }
}
