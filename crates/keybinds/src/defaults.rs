use crossterm::event::KeyCode;

use crate::{
    action::Action,
    engine::{KeyBinding, KeyMap},
};

pub fn default_normal_map() -> KeyMap {
    let mut m = KeyMap::new();

    // hjkl + arrow keys
    m.insert(KeyBinding::plain(KeyCode::Char('h')), Action::MoveLeft);
    m.insert(KeyBinding::plain(KeyCode::Char('j')), Action::MoveDown);
    m.insert(KeyBinding::plain(KeyCode::Char('k')), Action::MoveUp);
    m.insert(KeyBinding::plain(KeyCode::Char('l')), Action::MoveRight);
    m.insert(KeyBinding::plain(KeyCode::Left),       Action::MoveLeft);
    m.insert(KeyBinding::plain(KeyCode::Down),       Action::MoveDown);
    m.insert(KeyBinding::plain(KeyCode::Up),         Action::MoveUp);
    m.insert(KeyBinding::plain(KeyCode::Right),      Action::MoveRight);

    // Word movement
    m.insert(KeyBinding::plain(KeyCode::Char('w')), Action::MoveWordForward);
    m.insert(KeyBinding::plain(KeyCode::Char('b')), Action::MoveWordBack);

    // Line movement
    m.insert(KeyBinding::plain(KeyCode::Char('0')), Action::MoveLineStart);
    m.insert(KeyBinding::plain(KeyCode::Char('$')), Action::MoveLineEnd);
    m.insert(KeyBinding::plain(KeyCode::Home),      Action::MoveLineStart);
    m.insert(KeyBinding::plain(KeyCode::End),       Action::MoveLineEnd);

    // File movement
    m.insert(KeyBinding::plain(KeyCode::Char('G')), Action::MoveFileEnd);

    // Scrolling
    m.insert(KeyBinding::plain(KeyCode::PageUp),         Action::PageUp);
    m.insert(KeyBinding::plain(KeyCode::PageDown),       Action::PageDown);
    m.insert(KeyBinding::ctrl(KeyCode::Char('u')),       Action::PageUp);
    m.insert(KeyBinding::ctrl(KeyCode::Char('d')),       Action::PageDown);
    m.insert(KeyBinding::ctrl(KeyCode::Char('e')),       Action::ScrollDown);
    m.insert(KeyBinding::ctrl(KeyCode::Char('y')),       Action::ScrollUp);

    // Mode switches
    m.insert(KeyBinding::plain(KeyCode::Char('i')), Action::EnterInsertMode);
    m.insert(KeyBinding::plain(KeyCode::Char('a')), Action::EnterInsertModeAfter);
    m.insert(KeyBinding::plain(KeyCode::Char('A')), Action::EnterInsertModeLineEnd);
    m.insert(KeyBinding::plain(KeyCode::Char('o')), Action::EnterInsertModeNewlineBelow);
    m.insert(KeyBinding::plain(KeyCode::Char('O')), Action::EnterInsertModeNewlineAbove);
    m.insert(KeyBinding::plain(KeyCode::Char('v')), Action::EnterVisualMode);
    m.insert(KeyBinding::plain(KeyCode::Char('V')), Action::EnterVisualLineMode);
    m.insert(KeyBinding::plain(KeyCode::Char(':')), Action::EnterCommandMode);
    m.insert(KeyBinding::plain(KeyCode::Char('/')), Action::EnterSearchForward);
    m.insert(KeyBinding::plain(KeyCode::Char('?')), Action::EnterSearchBackward);

    // Editing
    m.insert(KeyBinding::plain(KeyCode::Char('x')), Action::Delete);
    m.insert(KeyBinding::plain(KeyCode::Char('D')), Action::DeleteToLineEnd);
    m.insert(KeyBinding::plain(KeyCode::Char('C')), Action::ChangeToLineEnd);
    m.insert(KeyBinding::plain(KeyCode::Char('u')), Action::Undo);
    m.insert(KeyBinding::ctrl(KeyCode::Char('r')),  Action::Redo);
    m.insert(KeyBinding::plain(KeyCode::Char('p')), Action::Paste);
    m.insert(KeyBinding::plain(KeyCode::Char('P')), Action::PasteBefore);
    m.insert(KeyBinding::plain(KeyCode::Char('.')), Action::FormatDocument);

    // Search
    m.insert(KeyBinding::plain(KeyCode::Char('n')), Action::SearchNext);
    m.insert(KeyBinding::plain(KeyCode::Char('N')), Action::SearchPrev);

    // File ops
    m.insert(KeyBinding::ctrl(KeyCode::Char('s')), Action::Save);
    m.insert(KeyBinding::ctrl(KeyCode::Char('w')), Action::CloseBuffer);

    // Panels
    m.insert(KeyBinding::ctrl(KeyCode::Char('b')), Action::ToggleFileTree);
    m.insert(KeyBinding::ctrl(KeyCode::Char('j')), Action::ToggleTerminal);
    m.insert(KeyBinding::ctrl(KeyCode::Char('g')), Action::ToggleGitPanel);

    // Fuzzy / palette
    m.insert(KeyBinding::ctrl(KeyCode::Char('p')),      Action::OpenFuzzyFinder);
    m.insert(KeyBinding::ctrl_shift(KeyCode::Char('p')), Action::OpenCommandPalette);

    // Splits
    m.insert(KeyBinding::ctrl(KeyCode::Char('\\')), Action::SplitVertical);
    m.insert(KeyBinding::ctrl(KeyCode::Char('|')),  Action::SplitHorizontal);

    // LSP
    m.insert(KeyBinding::plain(KeyCode::Char('K')), Action::HoverDocs);
    m.insert(KeyBinding::plain(KeyCode::F(2)),       Action::RenameSymbol);
    m.insert(KeyBinding::plain(KeyCode::F(8)),       Action::NextDiagnostic);

    m
}

pub fn default_insert_map() -> KeyMap {
    let mut m = KeyMap::new();
    m.insert(KeyBinding::plain(KeyCode::Esc),         Action::EnterNormalMode);
    m.insert(KeyBinding::ctrl(KeyCode::Char('[')),    Action::EnterNormalMode);
    m.insert(KeyBinding::ctrl(KeyCode::Char('s')),    Action::Save);
    m.insert(KeyBinding::ctrl(KeyCode::Char('b')),    Action::ToggleFileTree);
    m.insert(KeyBinding::ctrl(KeyCode::Char('j')),    Action::ToggleTerminal);
    m.insert(KeyBinding::ctrl(KeyCode::Char('p')),    Action::OpenFuzzyFinder);
    m.insert(KeyBinding::ctrl(KeyCode::Char(' ')), Action::CodeAction);
    m
}

pub fn default_visual_map() -> KeyMap {
    let mut m = KeyMap::new();
    m.insert(KeyBinding::plain(KeyCode::Esc),         Action::EnterNormalMode);
    m.insert(KeyBinding::plain(KeyCode::Char('h')),   Action::MoveLeft);
    m.insert(KeyBinding::plain(KeyCode::Char('j')),   Action::MoveDown);
    m.insert(KeyBinding::plain(KeyCode::Char('k')),   Action::MoveUp);
    m.insert(KeyBinding::plain(KeyCode::Char('l')),   Action::MoveRight);
    m.insert(KeyBinding::plain(KeyCode::Char('y')),   Action::Yank);
    m.insert(KeyBinding::plain(KeyCode::Char('d')),   Action::Delete);
    m.insert(KeyBinding::plain(KeyCode::Char('>')),   Action::InsertTab);
    m
}

pub fn default_command_map() -> KeyMap {
    let mut m = KeyMap::new();
    m.insert(KeyBinding::plain(KeyCode::Esc), Action::CommandAbort);
    m
}
