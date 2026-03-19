use std::collections::HashMap;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use nova_core::mode::Mode;

use crate::action::Action;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct KeyBinding {
    pub code:      KeyCode,
    pub modifiers: KeyModifiers,
}

impl KeyBinding {
    pub fn plain(code: KeyCode) -> Self {
        Self { code, modifiers: KeyModifiers::NONE }
    }

    pub fn ctrl(code: KeyCode) -> Self {
        Self { code, modifiers: KeyModifiers::CONTROL }
    }

    pub fn shift(code: KeyCode) -> Self {
        Self { code, modifiers: KeyModifiers::SHIFT }
    }

    pub fn ctrl_shift(code: KeyCode) -> Self {
        Self { code, modifiers: KeyModifiers::CONTROL | KeyModifiers::SHIFT }
    }

    pub fn from_event(ev: &KeyEvent) -> Self {
        Self { code: ev.code, modifiers: ev.modifiers }
    }
}

pub type KeyMap = HashMap<KeyBinding, Action>;

pub struct KeyEngine {
    pub normal_map:  KeyMap,
    pub insert_map:  KeyMap,
    pub visual_map:  KeyMap,
    pub command_map: KeyMap,
    /// Buffer for multi-key sequences (e.g. `g g`, `d d`).
    pending: Option<KeyCode>,
}

impl KeyEngine {
    pub fn new(normal: KeyMap, insert: KeyMap, visual: KeyMap, command: KeyMap) -> Self {
        Self {
            normal_map:  normal,
            insert_map:  insert,
            visual_map:  visual,
            command_map: command,
            pending:     None,
        }
    }

    pub fn handle_key(&mut self, ev: KeyEvent, mode: &Mode) -> Action {
        let binding = KeyBinding::from_event(&ev);

        match mode {
            Mode::Normal => self.handle_normal(binding, ev),
            Mode::Insert => self.handle_insert(binding, ev),
            Mode::Visual | Mode::VisualLine => self.handle_visual(binding, ev),
            Mode::Command | Mode::Search { .. } => self.handle_command(binding, ev),
        }
    }

    fn handle_normal(&mut self, binding: KeyBinding, ev: KeyEvent) -> Action {
        // Two-key sequences
        if let Some(first) = self.pending.take() {
            return match (first, &ev.code) {
                (KeyCode::Char('g'), KeyCode::Char('g')) => Action::MoveFileStart,
                (KeyCode::Char('g'), KeyCode::Char('d')) => Action::GotoDefinition,
                (KeyCode::Char('g'), KeyCode::Char('r')) => Action::GotoReferences,
                (KeyCode::Char('d'), KeyCode::Char('d')) => Action::DeleteLine,
                (KeyCode::Char('y'), KeyCode::Char('y')) => Action::YankLine,
                (KeyCode::Char('c'), KeyCode::Char('c')) => {
                    Action::EnterInsertModeNewlineBelow // change line
                }
                (KeyCode::Char('m'), KeyCode::Char(c)) => Action::SetMark(*c),
                (KeyCode::Char('\''), KeyCode::Char(c)) => Action::JumpToMark(*c),
                _ => Action::None,
            };
        }

        // Sequences that require a second key
        if let KeyCode::Char(c) = ev.code {
            if matches!(c, 'g' | 'd' | 'y' | 'c' | 'm' | '\'') && ev.modifiers == KeyModifiers::NONE {
                self.pending = Some(KeyCode::Char(c));
                return Action::None;
            }
        }

        if let Some(action) = self.normal_map.get(&binding) {
            return action.clone();
        }
        Action::None
    }

    fn handle_insert(&mut self, binding: KeyBinding, ev: KeyEvent) -> Action {
        if let Some(action) = self.insert_map.get(&binding) {
            return action.clone();
        }
        match ev.code {
            KeyCode::Char(c) if ev.modifiers == KeyModifiers::NONE
                             || ev.modifiers == KeyModifiers::SHIFT =>
            {
                Action::InsertChar(c)
            }
            KeyCode::Enter     => Action::InsertNewline,
            KeyCode::Tab       => Action::InsertTab,
            KeyCode::Backspace => Action::Backspace,
            KeyCode::Delete    => Action::Delete,
            KeyCode::Left      => Action::MoveLeft,
            KeyCode::Right     => Action::MoveRight,
            KeyCode::Up        => Action::MoveUp,
            KeyCode::Down      => Action::MoveDown,
            KeyCode::Home      => Action::MoveLineStart,
            KeyCode::End       => Action::MoveLineEnd,
            _ => Action::None,
        }
    }

    fn handle_visual(&mut self, binding: KeyBinding, ev: KeyEvent) -> Action {
        if let Some(action) = self.visual_map.get(&binding) {
            return action.clone();
        }
        match ev.code {
            KeyCode::Char('h') => Action::MoveLeft,
            KeyCode::Char('j') => Action::MoveDown,
            KeyCode::Char('k') => Action::MoveUp,
            KeyCode::Char('l') => Action::MoveRight,
            KeyCode::Esc       => Action::EnterNormalMode,
            _ => Action::None,
        }
    }

    fn handle_command(&mut self, binding: KeyBinding, ev: KeyEvent) -> Action {
        if let Some(action) = self.command_map.get(&binding) {
            return action.clone();
        }
        match ev.code {
            KeyCode::Char(c) if ev.modifiers == KeyModifiers::NONE
                             || ev.modifiers == KeyModifiers::SHIFT =>
            {
                Action::InsertChar(c)
            }
            KeyCode::Backspace => Action::Backspace,
            KeyCode::Enter     => Action::InsertNewline,
            KeyCode::Esc       => Action::EnterNormalMode,
            _ => Action::None,
        }
    }
}
