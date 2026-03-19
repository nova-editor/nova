use ratatui::{
    style::Style,
    text::{Line, Span},
};
use tree_sitter::Parser;
use tree_sitter_highlight::{Highlight, HighlightConfiguration, HighlightEvent, Highlighter};

use crate::{
    languages::{Lang, HIGHLIGHT_NAMES},
    theme::{default_fg, style_for_highlight},
};

/// Per-buffer highlight state.
pub struct SyntaxTree {
    pub lang:  Lang,
    config:    Option<HighlightConfiguration>,
    parser:    Parser,
}

impl SyntaxTree {
    pub fn new(lang: Lang) -> Self {
        let mut parser = Parser::new();
        let config = lang.tree_sitter_language().and_then(|ts_lang| {
            parser.set_language(&ts_lang).ok()?;
            let query = lang.highlight_query();
            if query.is_empty() {
                return None;
            }
            let mut cfg = HighlightConfiguration::new(
                ts_lang,
                lang.name(),
                query,
                "", // injection query
                "", // locals query
            )
            .ok()?;
            cfg.configure(HIGHLIGHT_NAMES);
            Some(cfg)
        });
        Self { lang, config, parser }
    }

    /// Re-parse the full source after an edit.
    pub fn reparse(&mut self, _source: &str) {
        // tree-sitter-highlight re-parses on each highlight call;
        // we keep this as a no-op hook for future incremental parsing.
    }

    /// Return styled spans for one line of text.
    pub fn highlight_line(&self, line_text: &str, source: &str) -> Vec<Span<'static>> {
        let config = match &self.config {
            Some(c) => c,
            None    => return vec![Span::raw(line_text.to_string())],
        };

        let mut hl   = Highlighter::new();
        let events   = match hl.highlight(config, source.as_bytes(), None, |_| None) {
            Ok(it) => it,
            Err(_) => return vec![Span::raw(line_text.to_string())],
        };

        // Byte range of this line inside `source`
        let line_start = find_line_start(source, line_text);
        let line_end   = line_start + line_text.len();

        let mut spans:   Vec<Span<'static>> = Vec::new();
        let mut style    = default_fg();
        let mut byte_pos = line_start;

        for event in events.flatten() {
            match event {
                HighlightEvent::HighlightStart(Highlight(idx)) => {
                    style = style_for_highlight(idx);
                }
                HighlightEvent::HighlightEnd => {
                    style = default_fg();
                }
                HighlightEvent::Source { start, end } => {
                    if end <= line_start || start >= line_end {
                        continue;
                    }
                    let s = start.max(line_start);
                    let e = end.min(line_end);
                    if s < e {
                        spans.push(Span::styled(source[s..e].to_string(), style));
                        byte_pos = e;
                    }
                }
            }
        }

        // Any remaining tail (unhighlighted)
        if byte_pos < line_end {
            spans.push(Span::raw(source[byte_pos..line_end].to_string()));
        }

        if spans.is_empty() {
            spans.push(Span::raw(line_text.to_string()));
        }
        spans
    }
}

pub fn highlight_line_to_ratatui(tree: &SyntaxTree, line_text: &str, source: &str) -> Line<'static> {
    Line::from(tree.highlight_line(line_text, source))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn find_line_start(source: &str, line_text: &str) -> usize {
    // Walk line by line to locate the first occurrence of `line_text`
    let mut offset = 0usize;
    for l in source.lines() {
        let end = offset + l.len();
        if l == line_text.trim_end_matches('\n') {
            return offset;
        }
        offset = end + 1; // +1 for '\n'
    }
    0
}
