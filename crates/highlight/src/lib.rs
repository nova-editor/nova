pub mod highlighter;
pub mod languages;
pub mod theme;

pub use highlighter::{highlight_line_to_ratatui, SyntaxTree};
pub use languages::Lang;
pub use theme::{default_fg, style_for_highlight};
