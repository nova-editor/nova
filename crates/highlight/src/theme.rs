use ratatui::style::{Color, Modifier, Style};

/// Maps a tree-sitter highlight name (from `Lang::highlight_names()`) to a
/// ratatui `Style`. The index matches the position in `highlight_names()`.
pub fn style_for_highlight(index: usize) -> Style {
    match index {
        0  => Style::default().fg(Color::Rgb(0xE5, 0xC0, 0x7B)), // attribute  → yellow
        1  => Style::default().fg(Color::Rgb(0x5C, 0x63, 0x70)).add_modifier(Modifier::ITALIC), // comment
        2  => Style::default().fg(Color::Rgb(0xD1, 0x9A, 0x66)), // constant   → orange
        3  => Style::default().fg(Color::Rgb(0xD1, 0x9A, 0x66)).add_modifier(Modifier::BOLD),   // constant.builtin
        4  => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)), // constructor → red
        5  => Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF)), // embedded    → default
        6  => Style::default().fg(Color::Rgb(0x61, 0xAF, 0xEF)), // function    → blue
        7  => Style::default().fg(Color::Rgb(0x61, 0xAF, 0xEF)).add_modifier(Modifier::BOLD),   // function.builtin
        8  => Style::default().fg(Color::Rgb(0xC6, 0x78, 0xDD)), // keyword     → purple
        9  => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)), // label       → red
        10 => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)), // module      → red
        11 => Style::default().fg(Color::Rgb(0xD1, 0x9A, 0x66)), // number      → orange
        12 => Style::default().fg(Color::Rgb(0x56, 0xB6, 0xC2)), // operator    → cyan
        13 => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)), // property    → red
        14 => Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF)), // punct.bracket
        15 => Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF)), // punct.delimiter
        16 => Style::default().fg(Color::Rgb(0x98, 0xC3, 0x79)), // string      → green
        17 => Style::default().fg(Color::Rgb(0x98, 0xC3, 0x79)), // string.special
        18 => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)), // tag         → red
        19 => Style::default().fg(Color::Rgb(0xE5, 0xC0, 0x7B)), // type        → yellow
        20 => Style::default().fg(Color::Rgb(0xE5, 0xC0, 0x7B)).add_modifier(Modifier::BOLD),   // type.builtin
        21 => Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF)), // variable
        22 => Style::default().fg(Color::Rgb(0xD1, 0x9A, 0x66)).add_modifier(Modifier::ITALIC), // variable.builtin
        23 => Style::default().fg(Color::Rgb(0xE0, 0x6C, 0x75)).add_modifier(Modifier::ITALIC), // variable.parameter
        _  => Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF)), // fallback
    }
}

pub fn default_fg() -> Style {
    Style::default().fg(Color::Rgb(0xAB, 0xB2, 0xBF))
}
