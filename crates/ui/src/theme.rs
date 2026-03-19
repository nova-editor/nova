use ratatui::style::{Color, Modifier, Style};
use nova_config::ThemeConfig;

/// Parsed, ready-to-use styles derived from `ThemeConfig`.
#[derive(Debug, Clone)]
pub struct Theme {
    pub bg:              Color,
    pub fg:              Color,
    pub cursor:          Style,
    pub selection:       Style,
    pub line_number:     Style,
    pub line_number_rel: Style,
    pub active_line:     Style,
    pub status_bar:      Style,
    pub status_bar_mode: Style,
    pub tab_active:      Style,
    pub tab_inactive:    Style,
    pub file_tree_bg:    Style,
    pub file_tree_dir:   Style,
    pub file_tree_file:  Style,
    pub gutter_add:      Style,
    pub gutter_change:   Style,
    pub gutter_delete:   Style,
    pub border:          Style,
    pub popup_bg:        Style,
    pub match_highlight: Style,
}

impl Theme {
    pub fn from_config(cfg: &ThemeConfig) -> Self {
        let bg  = parse_hex(&cfg.bg);
        let fg  = parse_hex(&cfg.fg);
        let sb_bg = parse_hex(&cfg.status_bar_bg);
        let sb_fg = parse_hex(&cfg.status_bar_fg);
        let tab_act   = parse_hex(&cfg.tab_active_bg);
        let tab_inact = parse_hex(&cfg.tab_inactive_bg);
        let ft_bg     = parse_hex(&cfg.file_tree_bg);

        Self {
            bg,
            fg,
            cursor:          Style::default().fg(parse_hex(&cfg.cursor)).add_modifier(Modifier::REVERSED),
            selection:       Style::default().bg(parse_hex(&cfg.selection)),
            line_number:     Style::default().fg(parse_hex(&cfg.line_number)).bg(bg),
            line_number_rel: Style::default().fg(parse_hex(&cfg.line_number)).bg(bg).add_modifier(Modifier::DIM),
            active_line:     Style::default().bg(parse_hex(&cfg.active_line)),
            status_bar:      Style::default().fg(sb_fg).bg(sb_bg),
            status_bar_mode: Style::default().fg(Color::Black).bg(Color::Rgb(0x52, 0x8B, 0xFF)).add_modifier(Modifier::BOLD),
            tab_active:      Style::default().fg(fg).bg(tab_act).add_modifier(Modifier::BOLD),
            tab_inactive:    Style::default().fg(parse_hex(&cfg.line_number)).bg(tab_inact),
            file_tree_bg:    Style::default().fg(fg).bg(ft_bg),
            file_tree_dir:   Style::default().fg(Color::Rgb(0x61, 0xAF, 0xEF)).bg(ft_bg).add_modifier(Modifier::BOLD),
            file_tree_file:  Style::default().fg(fg).bg(ft_bg),
            gutter_add:      Style::default().fg(parse_hex(&cfg.gutter_add)),
            gutter_change:   Style::default().fg(parse_hex(&cfg.gutter_change)),
            gutter_delete:   Style::default().fg(parse_hex(&cfg.gutter_delete)),
            border:          Style::default().fg(Color::Rgb(0x3E, 0x44, 0x51)),
            popup_bg:        Style::default().fg(fg).bg(Color::Rgb(0x21, 0x25, 0x2B)),
            match_highlight: Style::default().bg(Color::Rgb(0x3E, 0x4A, 0x1E)).add_modifier(Modifier::BOLD),
        }
    }
}

fn parse_hex(s: &str) -> Color {
    let s = s.trim_start_matches('#');
    if s.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&s[0..2], 16),
            u8::from_str_radix(&s[2..4], 16),
            u8::from_str_radix(&s[4..6], 16),
        ) {
            return Color::Rgb(r, g, b);
        }
    }
    Color::Reset
}
