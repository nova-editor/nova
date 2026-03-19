pub mod action;
pub mod defaults;
pub mod engine;

pub use action::Action;
pub use engine::{KeyBinding, KeyEngine, KeyMap};

use defaults::{
    default_command_map, default_insert_map, default_normal_map, default_visual_map,
};
use nova_config::KeybindsConfig;

/// Build a `KeyEngine` from the default maps, then apply any user overrides
/// from `config`.
pub fn build_engine(config: &KeybindsConfig) -> KeyEngine {
    let mut normal  = default_normal_map();
    let mut insert  = default_insert_map();
    let mut visual  = default_visual_map();
    let command     = default_command_map();

    // Apply user overrides (best-effort: skip any unrecognised action names)
    apply_overrides(&mut normal,  &config.normal);
    apply_overrides(&mut insert,  &config.insert);
    apply_overrides(&mut visual,  &config.visual);

    KeyEngine::new(normal, insert, visual, command)
}

fn apply_overrides(map: &mut KeyMap, overrides: &std::collections::HashMap<String, String>) {
    for (key_str, action_str) in overrides {
        if let (Some(binding), Some(action)) = (parse_key(key_str), parse_action(action_str)) {
            map.insert(binding, action);
        }
    }
}

fn parse_key(s: &str) -> Option<KeyBinding> {
    use crossterm::event::KeyCode;
    let s = s.to_lowercase();
    let parts: Vec<&str> = s.split('+').collect();
    let (modifiers_strs, key_str) = parts.split_at(parts.len().saturating_sub(1));

    let key_str = key_str.first()?;
    let code = match *key_str {
        "enter"     => KeyCode::Enter,
        "tab"       => KeyCode::Tab,
        "backspace" => KeyCode::Backspace,
        "delete"    => KeyCode::Delete,
        "esc"       => KeyCode::Esc,
        "left"      => KeyCode::Left,
        "right"     => KeyCode::Right,
        "up"        => KeyCode::Up,
        "down"      => KeyCode::Down,
        "home"      => KeyCode::Home,
        "end"       => KeyCode::End,
        "pageup"    => KeyCode::PageUp,
        "pagedown"  => KeyCode::PageDown,
        k if k.len() == 1 => KeyCode::Char(k.chars().next()?),
        _ => return None,
    };

    let mut modifiers = crossterm::event::KeyModifiers::NONE;
    for m in modifiers_strs {
        match *m {
            "ctrl"  => modifiers |= crossterm::event::KeyModifiers::CONTROL,
            "shift" => modifiers |= crossterm::event::KeyModifiers::SHIFT,
            "alt"   => modifiers |= crossterm::event::KeyModifiers::ALT,
            _ => {}
        }
    }

    Some(KeyBinding { code, modifiers })
}

fn parse_action(s: &str) -> Option<Action> {
    Some(match s {
        "move_up"            => Action::MoveUp,
        "move_down"          => Action::MoveDown,
        "move_left"          => Action::MoveLeft,
        "move_right"         => Action::MoveRight,
        "move_word_forward"  => Action::MoveWordForward,
        "move_word_back"     => Action::MoveWordBack,
        "move_line_start"    => Action::MoveLineStart,
        "move_line_end"      => Action::MoveLineEnd,
        "move_file_start"    => Action::MoveFileStart,
        "move_file_end"      => Action::MoveFileEnd,
        "page_up"            => Action::PageUp,
        "page_down"          => Action::PageDown,
        "insert_mode"        => Action::EnterInsertMode,
        "normal_mode"        => Action::EnterNormalMode,
        "visual_mode"        => Action::EnterVisualMode,
        "save"               => Action::Save,
        "quit"               => Action::Quit,
        "undo"               => Action::Undo,
        "redo"               => Action::Redo,
        "delete"             => Action::Delete,
        "delete_line"        => Action::DeleteLine,
        "yank_line"          => Action::YankLine,
        "paste"              => Action::Paste,
        "toggle_file_tree"   => Action::ToggleFileTree,
        "toggle_terminal"    => Action::ToggleTerminal,
        "toggle_git_panel"   => Action::ToggleGitPanel,
        "fuzzy_finder"       => Action::OpenFuzzyFinder,
        "command_palette"    => Action::OpenCommandPalette,
        "goto_definition"    => Action::GotoDefinition,
        "hover_docs"         => Action::HoverDocs,
        "next_diagnostic"    => Action::NextDiagnostic,
        "format_document"    => Action::FormatDocument,
        _ => return None,
    })
}
