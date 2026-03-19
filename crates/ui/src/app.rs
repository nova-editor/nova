use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use crossterm::{
    event::{self, Event, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    widgets::Clear,
    Terminal,
};
use tokio::sync::mpsc;
use tracing::warn;

use nova_config::Config;
use nova_core::{Buffer, Marks, Mode, Session};
use nova_git::{BranchManager, DiffManager, GitRepo, StatusManager};
use ted_highlight::Lang;
use ted_keybinds::{build_engine, Action, KeyEngine};
use nova_lsp::{LspClient, LspEvent};

use crate::{
    command_palette::CommandPalette,
    editor_pane::EditorPane,
    file_tree::FileTree,
    fuzzy_finder::FuzzyFinder,
    git_panel::GitPanel,
    split::{SplitFocus, SplitLayout},
    status_bar::StatusBar,
    tab_bar::TabBar,
    terminal_pane::TerminalPane,
    theme::Theme,
};

pub struct App {
    config:       Config,
    theme:        Theme,
    buffers:      Vec<Buffer>,
    active_buf:   usize,
    mode:         Mode,
    key_engine:   KeyEngine,

    // Panels
    file_tree:   Option<FileTree>,
    terminal:    TerminalPane,
    git_panel:   Option<GitPanel>,

    // Overlays
    fuzzy:        FuzzyFinder,
    palette:      CommandPalette,

    // Search state
    search_term:  String,
    search_fwd:   bool,
    command_buf:  String,

    // Git
    git_repo:     Option<GitRepo>,
    git_branch:   String,

    // LSP: ext → client
    lsp_clients:  HashMap<String, LspClient>,
    lsp_tx:       mpsc::Sender<LspEvent>,
    lsp_rx:       mpsc::Receiver<LspEvent>,
    lsp_msg:      String,

    // Per-buffer editor pane (syntax highlight state)
    panes:        Vec<EditorPane>,

    // Layout
    split:        SplitLayout,
    marks:        Marks,

    // Changed-line cache for gutter
    changed_lines: nova_git::diff::ChangedLines,

    should_quit:  bool,
    status_msg:   String,
}

impl App {
    pub async fn run(config: Config) -> Result<()> {
        let theme = Theme::from_config(&config.theme);

        // Discover git repo
        let cwd       = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let git_repo  = GitRepo::discover(&cwd).ok();
        let git_branch = git_repo
            .as_ref()
            .and_then(|r| r.current_branch().ok())
            .unwrap_or_default();

        let (lsp_tx, lsp_rx) = mpsc::channel(64);
        let key_engine = build_engine(&config.keybinds);

        // Restore session or open scratch buffer
        let (buffers, active_buf, panes) = if config.editor.restore_session {
            load_session_or_scratch()
        } else {
            new_scratch_state()
        };

        let file_tree = Some(FileTree::new(cwd.clone()));

        let mut app = Self {
            theme,
            key_engine,
            buffers,
            active_buf,
            mode:          Mode::Normal,
            file_tree,
            terminal:      TerminalPane::new(),
            git_panel:     None,
            fuzzy:         FuzzyFinder::new(),
            palette:       CommandPalette::new(),
            search_term:   String::new(),
            search_fwd:    true,
            command_buf:   String::new(),
            git_repo,
            git_branch,
            lsp_clients:   HashMap::new(),
            lsp_tx,
            lsp_rx,
            lsp_msg:       String::new(),
            panes,
            split:         SplitLayout::Single,
            marks:         Marks::new(),
            changed_lines: Default::default(),
            should_quit:   false,
            status_msg:    String::new(),
            config,
        };

        // Load fuzzy finder files
        app.fuzzy.load_files(&cwd);

        // Apply any project-level config override
        app.config.apply_project_override(&cwd).ok();
        app.theme = Theme::from_config(&app.config.theme);

        // Set up terminal
        enable_raw_mode().context("enabling raw mode")?;
        let mut stdout = std::io::stdout();
        execute!(stdout, EnterAlternateScreen).context("entering alt screen")?;
        let backend  = CrosstermBackend::new(stdout);
        let mut term = Terminal::new(backend).context("creating terminal")?;
        term.hide_cursor()?;

        let result = app.event_loop(&mut term).await;

        // Restore terminal
        disable_raw_mode().ok();
        execute!(term.backend_mut(), LeaveAlternateScreen).ok();
        term.show_cursor().ok();

        // Save session
        if app.config.editor.restore_session {
            app.save_session().ok();
        }

        result
    }

    // ── Event loop ────────────────────────────────────────────────────────────

    async fn event_loop<B: ratatui::backend::Backend>(
        &mut self,
        term: &mut Terminal<B>,
    ) -> Result<()> {
        while !self.should_quit {
            // Draw
            term.draw(|f| self.render(f))?;

            // Poll for crossterm or LSP events (16 ms → ~60 fps)
            if event::poll(Duration::from_millis(16))? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == KeyEventKind::Press {
                        self.handle_key(key).await;
                    }
                }
            }

            // Drain LSP events
            while let Ok(ev) = self.lsp_rx.try_recv() {
                self.handle_lsp_event(ev);
            }

            // Refresh git status periodically (every ~2 s handled externally; here we just refresh on action)
        }
        Ok(())
    }

    // ── Input dispatch ────────────────────────────────────────────────────────

    async fn handle_key(&mut self, key: crossterm::event::KeyEvent) {
        // Overlays take priority
        if self.fuzzy.open {
            self.handle_fuzzy_key(key);
            return;
        }
        if self.palette.open {
            self.handle_palette_key(key);
            return;
        }
        if let Some(gp) = &self.git_panel {
            if gp.composing {
                self.handle_git_compose_key(key);
                return;
            }
        }

        let action = self.key_engine.handle_key(key, &self.mode);
        self.dispatch(action).await;
    }

    async fn dispatch(&mut self, action: Action) {
        // Pre-compute values that borrow `self` immutably before the mutable `buf` borrow.
        let viewport_h = self.editor_viewport_h();

        let buf = &mut self.buffers[self.active_buf];
        match action {
            Action::None => {}

            // ── Movement ──────────────────────────────────────────────────
            Action::MoveUp               => { buf.move_up(); }
            Action::MoveDown             => { buf.move_down(); }
            Action::MoveLeft             => { buf.move_left(); }
            Action::MoveRight            => { buf.move_right(); }
            Action::MoveWordForward      => { buf.move_word_forward(); }
            Action::MoveWordBack         => { buf.move_word_back(); }
            Action::MoveLineStart        => { buf.move_line_start(); }
            Action::MoveLineEnd          => { buf.move_line_end(); }
            Action::MoveFileStart        => { buf.move_to_first_line(); }
            Action::MoveFileEnd          => { buf.move_to_last_line(); }
            Action::PageUp               => { buf.page_up(viewport_h); }
            Action::PageDown             => { buf.page_down(viewport_h); }
            Action::ScrollUp             => { if buf.scroll_top > 0 { buf.scroll_top -= 1; } }
            Action::ScrollDown           => { buf.scroll_top += 1; }

            // ── Mode switches ─────────────────────────────────────────────
            Action::EnterInsertMode      => { self.mode = Mode::Insert; }
            Action::EnterInsertModeAfter => {
                buf.move_right();
                self.mode = Mode::Insert;
            }
            Action::EnterInsertModeLineEnd => {
                buf.move_line_end();
                buf.move_right();
                self.mode = Mode::Insert;
            }
            Action::EnterInsertModeNewlineBelow => {
                buf.open_line_below();
                self.mode = Mode::Insert;
            }
            Action::EnterInsertModeNewlineAbove => {
                buf.open_line_above();
                self.mode = Mode::Insert;
            }
            Action::EnterNormalMode => {
                self.mode = Mode::Normal;
                self.command_buf.clear();
                self.search_term.clear();
            }
            Action::EnterVisualMode      => {
                buf.cursor.set_anchor();
                self.mode = Mode::Visual;
            }
            Action::EnterVisualLineMode  => {
                buf.cursor.set_anchor();
                self.mode = Mode::VisualLine;
            }
            Action::EnterCommandMode     => {
                self.command_buf.clear();
                self.mode = Mode::Command;
            }
            Action::EnterSearchForward   => {
                self.search_term.clear();
                self.search_fwd = true;
                self.mode = Mode::Search { forward: true };
            }
            Action::EnterSearchBackward  => {
                self.search_term.clear();
                self.search_fwd = false;
                self.mode = Mode::Search { forward: false };
            }

            // ── Editing ───────────────────────────────────────────────────
            Action::InsertChar(c) => {
                match &self.mode {
                    Mode::Command => {
                        self.command_buf.push(c);
                    }
                    Mode::Search { .. } => {
                        self.search_term.push(c);
                        self.do_search();
                    }
                    _ => {
                        buf.insert_char(c);
                        self.reparse_current();
                    }
                }
            }
            Action::InsertNewline => {
                match &self.mode {
                    Mode::Command => {
                        self.execute_command();
                    }
                    Mode::Search { .. } => {
                        self.mode = Mode::Normal;
                    }
                    _ => {
                        buf.insert_char('\n');
                        if self.config.editor.auto_indent {
                            self.auto_indent();
                        }
                        self.reparse_current();
                    }
                }
            }
            Action::InsertTab => {
                if self.config.editor.expand_tabs {
                    let spaces = " ".repeat(self.config.editor.tab_width);
                    buf.insert_str_at_cursor(&spaces);
                } else {
                    buf.insert_char('\t');
                }
                self.reparse_current();
            }
            Action::Backspace => {
                match &self.mode {
                    Mode::Command => { self.command_buf.pop(); }
                    Mode::Search { .. } => {
                        self.search_term.pop();
                        self.do_search();
                    }
                    _ => {
                        buf.backspace();
                        self.reparse_current();
                    }
                }
            }
            Action::Delete          => { buf.delete_char_at_cursor(); self.reparse_current(); }
            Action::DeleteLine      => { buf.delete_line(); self.reparse_current(); }
            Action::DeleteToLineEnd => { buf.delete_to_line_end(); self.reparse_current(); }
            Action::ChangeToLineEnd => {
                buf.delete_to_line_end();
                self.mode = Mode::Insert;
                self.reparse_current();
            }

            // ── Clipboard ─────────────────────────────────────────────────
            Action::YankLine  => { buf.yank_line(); }
            Action::Paste     => { buf.paste_after(); self.reparse_current(); }
            Action::PasteBefore => { buf.paste_before(); self.reparse_current(); }

            // ── Search ────────────────────────────────────────────────────
            Action::SearchNext => { self.search_next(); }
            Action::SearchPrev => { self.search_prev(); }

            // ── File ops ──────────────────────────────────────────────────
            Action::Save => {
                match buf.save() {
                    Ok(p)  => {
                        self.status_msg = format!("Saved {}", p.display());
                        self.refresh_git_gutter();
                    }
                    Err(e) => self.status_msg = format!("Error: {e}"),
                }
            }
            Action::Quit => {
                if self.buffers.iter().any(|b| b.dirty) {
                    self.status_msg = "Unsaved changes — use :q! to force quit".to_string();
                } else {
                    self.should_quit = true;
                }
            }
            Action::ForceQuit    => { self.should_quit = true; }
            Action::SaveAndQuit  => {
                for b in &mut self.buffers { let _ = b.save(); }
                self.should_quit = true;
            }

            // ── Undo/Redo ─────────────────────────────────────────────────
            Action::Undo => { buf.undo(); self.reparse_current(); }
            Action::Redo => { buf.redo(); self.reparse_current(); }

            // ── Buffer management ─────────────────────────────────────────
            Action::NextBuffer   => { self.next_buffer(); }
            Action::PrevBuffer   => { self.prev_buffer(); }
            Action::CloseBuffer  => { self.close_current_buffer(); }
            Action::NewBuffer    => { self.new_scratch(); }
            Action::OpenFile(p)  => { self.open_file(PathBuf::from(p)); }

            // ── Splits ────────────────────────────────────────────────────
            Action::SplitVertical   => {
                let right = self.active_buf;
                self.split = SplitLayout::split_vertical(right);
            }
            Action::SplitHorizontal => {
                let bottom = self.active_buf;
                self.split = SplitLayout::split_horizontal(bottom);
            }
            Action::FocusNextSplit | Action::FocusPrevSplit => {
                self.split.toggle_focus();
            }
            Action::CloseSplit => { self.split.close_split(); }

            // ── Panels ────────────────────────────────────────────────────
            Action::ToggleFileTree => {
                if self.file_tree.is_some() {
                    self.file_tree = None;
                } else {
                    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                    self.file_tree = Some(FileTree::new(cwd));
                }
            }
            Action::ToggleTerminal => {
                self.terminal.active = !self.terminal.active;
                if self.terminal.active {
                    let _ = self.terminal.spawn(12, 80);
                }
            }
            Action::ToggleGitPanel => {
                if self.git_panel.is_some() {
                    self.git_panel = None;
                } else {
                    let mut gp = GitPanel::new();
                    self.refresh_git_panel(&mut gp);
                    self.git_panel = Some(gp);
                }
            }

            // ── Overlays ──────────────────────────────────────────────────
            Action::OpenFuzzyFinder  => { self.fuzzy.open = true; }
            Action::OpenCommandPalette => { self.palette.open = true; }

            // ── Git ───────────────────────────────────────────────────────
            Action::GitCommit => {
                if let Some(gp) = &mut self.git_panel {
                    gp.composing = true;
                } else {
                    let mut gp = GitPanel::new();
                    gp.composing = true;
                    self.refresh_git_panel(&mut gp);
                    self.git_panel = Some(gp);
                }
            }
            Action::GitStageHunk | Action::GitDiff | Action::GitBranch
            | Action::GitUnstageHunk => {
                self.status_msg = "Git action — open the git panel with Ctrl+G".to_string();
            }

            // ── Marks ─────────────────────────────────────────────────────
            Action::SetMark(c) => {
                let path = self.buffers[self.active_buf]
                    .path
                    .clone()
                    .unwrap_or_else(|| PathBuf::from("[scratch]"));
                let pos = self.buffers[self.active_buf].cursor.pos.clone();
                self.marks.set(c, path, pos);
            }
            Action::JumpToMark(c) => {
                if let Some(mark) = self.marks.get(c) {
                    let path = mark.file.clone();
                    let pos  = mark.pos.clone();
                    self.open_file(path);
                    self.buffers[self.active_buf].cursor.set(pos.line, pos.col);
                }
            }

            // ── LSP ───────────────────────────────────────────────────────
            Action::GotoDefinition | Action::GotoReferences
            | Action::HoverDocs   | Action::CodeAction
            | Action::RenameSymbol | Action::FormatDocument
            | Action::NextDiagnostic | Action::PrevDiagnostic => {
                self.handle_lsp_action(action).await;
            }

            _ => {}
        }

        // Keep cursor in view after every action
        let vh = self.editor_viewport_h();
        let so = self.config.editor.scroll_off;
        self.buffers[self.active_buf].scroll_to_cursor(vh, so);
    }

    // ── Sub-handlers ─────────────────────────────────────────────────────────

    fn handle_fuzzy_key(&mut self, key: crossterm::event::KeyEvent) {
        use crossterm::event::KeyCode;
        match key.code {
            KeyCode::Esc => { self.fuzzy.reset(); }
            KeyCode::Enter => {
                if let Some(path) = self.fuzzy.selected_path().cloned() {
                    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                    self.open_file(cwd.join(path));
                    self.fuzzy.reset();
                }
            }
            KeyCode::Up   | KeyCode::Char('k') if key.modifiers.is_empty()
                || key.modifiers == crossterm::event::KeyModifiers::NONE =>
            {
                self.fuzzy.move_up();
            }
            KeyCode::Down | KeyCode::Char('j') => { self.fuzzy.move_down(); }
            KeyCode::Backspace                 => { self.fuzzy.pop_char(); }
            KeyCode::Char(c)                   => { self.fuzzy.push_char(c); }
            _ => {}
        }
    }

    fn handle_palette_key(&mut self, key: crossterm::event::KeyEvent) {
        use crossterm::event::KeyCode;
        match key.code {
            KeyCode::Esc    => { self.palette.reset(); }
            KeyCode::Enter  => {
                if let Some(tag) = self.palette.selected_action().map(|s| s.to_string()) {
                    self.palette.reset();
                    self.execute_palette_action(&tag);
                }
            }
            KeyCode::Up     => { self.palette.move_up(); }
            KeyCode::Down   => { self.palette.move_down(); }
            KeyCode::Backspace => { self.palette.pop_char(); }
            KeyCode::Char(c)   => { self.palette.push_char(c); }
            _ => {}
        }
    }

    fn handle_git_compose_key(&mut self, key: crossterm::event::KeyEvent) {
        use crossterm::event::KeyCode;
        let gp = match &mut self.git_panel {
            Some(gp) => gp,
            None     => return,
        };
        match key.code {
            KeyCode::Esc       => { gp.composing = false; gp.message.clear(); }
            KeyCode::Enter     => {
                let msg = gp.message.clone();
                if !msg.is_empty() {
                    if let Some(repo) = &self.git_repo {
                        let committer = nova_git::commit::Committer::new(repo);
                        match committer.commit_staged(&msg) {
                            Ok(oid) => self.status_msg = format!("Committed {:.7}", oid),
                            Err(e)  => self.status_msg = format!("Commit failed: {e}"),
                        }
                    }
                    gp.message.clear();
                    gp.composing = false;
                }
            }
            KeyCode::Backspace => { gp.message.pop(); }
            KeyCode::Char(c)   => { gp.message.push(c); }
            _ => {}
        }
    }

    fn execute_palette_action(&mut self, tag: &str) {
        use ted_keybinds::action::Action;
        let action = match tag {
            "save"             => Action::Save,
            "quit"             => Action::Quit,
            "force_quit"       => Action::ForceQuit,
            "new_buffer"       => Action::NewBuffer,
            "close_buffer"     => Action::CloseBuffer,
            "next_buffer"      => Action::NextBuffer,
            "prev_buffer"      => Action::PrevBuffer,
            "toggle_file_tree" => Action::ToggleFileTree,
            "toggle_terminal"  => Action::ToggleTerminal,
            "toggle_git_panel" => Action::ToggleGitPanel,
            "fuzzy_finder"     => Action::OpenFuzzyFinder,
            "goto_definition"  => Action::GotoDefinition,
            "hover_docs"       => Action::HoverDocs,
            "format_document"  => Action::FormatDocument,
            "next_diagnostic"  => Action::NextDiagnostic,
            "rename_symbol"    => Action::RenameSymbol,
            "split_vertical"   => Action::SplitVertical,
            "split_horizontal" => Action::SplitHorizontal,
            "git_commit"       => Action::GitCommit,
            _ => Action::None,
        };
        let rt = tokio::runtime::Handle::current();
        let _ = rt.block_on(self.dispatch(action));
    }

    fn execute_command(&mut self) {
        let cmd = self.command_buf.trim().to_string();
        self.mode = Mode::Normal;
        self.command_buf.clear();

        match cmd.as_str() {
            "q" | "quit"  => {
                if self.buffers.iter().any(|b| b.dirty) {
                    self.status_msg = "Unsaved changes — use :q!".to_string();
                } else {
                    self.should_quit = true;
                }
            }
            "q!" | "quit!" => { self.should_quit = true; }
            "w" | "write"  => {
                match self.buffers[self.active_buf].save() {
                    Ok(p)  => self.status_msg = format!("Saved {}", p.display()),
                    Err(e) => self.status_msg = format!("Error: {e}"),
                }
            }
            "wq" => {
                for b in &mut self.buffers { let _ = b.save(); }
                self.should_quit = true;
            }
            "noh" | "nohlsearch" => { self.search_term.clear(); }
            _ if cmd.starts_with("e ") => {
                let path = cmd[2..].trim();
                self.open_file(PathBuf::from(path));
            }
            _ if cmd.starts_with("w ") => {
                let path = cmd[2..].trim();
                match self.buffers[self.active_buf].save_as(path) {
                    Ok(_)  => self.status_msg = format!("Saved {}", path),
                    Err(e) => self.status_msg = format!("Error: {e}"),
                }
            }
            _ if cmd.starts_with('%') && cmd.contains("s/") => {
                // :%s/from/to/g
                self.execute_substitute(&cmd);
            }
            _ => {
                self.status_msg = format!("Unknown command: {}", cmd);
            }
        }
    }

    fn execute_substitute(&mut self, cmd: &str) {
        // Parse :%s/from/to/[flags]
        let parts: Vec<&str> = cmd.splitn(4, '/').collect();
        if parts.len() >= 3 {
            let from = parts[1];
            let to   = parts[2];
            self.buffers[self.active_buf].replace_all(from, to);
            self.reparse_current();
            self.status_msg = format!("Replaced all '{}' → '{}'", from, to);
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    fn do_search(&mut self) {
        let term = self.search_term.clone();
        let pos  = self.buffers[self.active_buf].cursor.pos.clone();
        if self.search_fwd {
            if let Some(p) = self.buffers[self.active_buf].search_forward(&term, &pos) {
                self.buffers[self.active_buf].cursor.set(p.line, p.col);
            }
        } else if let Some(p) = self.buffers[self.active_buf].search_backward(&term, &pos) {
            self.buffers[self.active_buf].cursor.set(p.line, p.col);
        }
    }

    fn search_next(&mut self) {
        let term = self.search_term.clone();
        if term.is_empty() { return; }
        let pos  = self.buffers[self.active_buf].cursor.pos.clone();
        if let Some(p) = self.buffers[self.active_buf].search_forward(&term, &pos) {
            self.buffers[self.active_buf].cursor.set(p.line, p.col);
        }
    }

    fn search_prev(&mut self) {
        let term = self.search_term.clone();
        if term.is_empty() { return; }
        let pos  = self.buffers[self.active_buf].cursor.pos.clone();
        if let Some(p) = self.buffers[self.active_buf].search_backward(&term, &pos) {
            self.buffers[self.active_buf].cursor.set(p.line, p.col);
        }
    }

    // ── Buffer helpers ────────────────────────────────────────────────────────

    fn next_buffer(&mut self) {
        if self.buffers.len() > 1 {
            self.active_buf = (self.active_buf + 1) % self.buffers.len();
        }
    }

    fn prev_buffer(&mut self) {
        if self.buffers.len() > 1 {
            self.active_buf = (self.active_buf + self.buffers.len() - 1) % self.buffers.len();
        }
    }

    fn close_current_buffer(&mut self) {
        if self.buffers.len() == 1 {
            self.should_quit = true;
            return;
        }
        self.buffers.remove(self.active_buf);
        self.panes.remove(self.active_buf);
        self.active_buf = self.active_buf.saturating_sub(1).min(self.buffers.len() - 1);
    }

    fn new_scratch(&mut self) {
        self.buffers.push(Buffer::new_scratch());
        self.panes.push(EditorPane::new(Lang::PlainText));
        self.active_buf = self.buffers.len() - 1;
    }

    fn open_file(&mut self, path: PathBuf) {
        // Check if already open
        if let Some(idx) = self.buffers.iter().position(|b| b.path.as_deref() == Some(&path)) {
            self.active_buf = idx;
            return;
        }
        let lang = path
            .extension()
            .and_then(|e| e.to_str())
            .map(Lang::from_extension)
            .unwrap_or(Lang::PlainText);

        match Buffer::from_path(&path) {
            Ok(buf) => {
                let mut pane = EditorPane::new(lang);
                pane.reparse(&buf.content());
                self.buffers.push(buf);
                self.panes.push(pane);
                self.active_buf = self.buffers.len() - 1;
                self.refresh_git_gutter();
            }
            Err(e) => {
                self.status_msg = format!("Cannot open: {e}");
            }
        }
    }

    fn reparse_current(&mut self) {
        let content = self.buffers[self.active_buf].content();
        self.panes[self.active_buf].reparse(&content);
    }

    fn auto_indent(&mut self) {
        let buf  = &mut self.buffers[self.active_buf];
        let line = buf.cursor.pos.line;
        if line == 0 { return; }
        let prev      = buf.line(line - 1);
        let indent: String = prev.chars().take_while(|c| c.is_whitespace()).collect();
        if !indent.is_empty() {
            buf.insert_str_at_cursor(&indent);
        }
    }

    // ── Git helpers ───────────────────────────────────────────────────────────

    fn refresh_git_panel(&self, gp: &mut GitPanel) {
        if let Some(repo) = &self.git_repo {
            let branch   = repo.current_branch().unwrap_or_default();
            let statuses = StatusManager::new(repo).list().unwrap_or_default();
            gp.set_data(branch, statuses);
        }
    }

    fn refresh_git_gutter(&mut self) {
        if let Some(repo) = &self.git_repo {
            if let Some(path) = &self.buffers[self.active_buf].path {
                if let Ok(cl) = DiffManager::new(repo).changed_lines(path) {
                    self.changed_lines = cl;
                    return;
                }
            }
        }
        self.changed_lines = Default::default();
    }

    // ── LSP ───────────────────────────────────────────────────────────────────

    async fn handle_lsp_action(&mut self, action: Action) {
        let buf  = &self.buffers[self.active_buf];
        let ext  = buf.path.as_ref()
            .and_then(|p| p.extension())
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        // Ensure LSP client is started for this language
        if !self.lsp_clients.contains_key(&ext) {
            if let Some(argv) = self.config.lsp.servers.get(&ext).cloned() {
                let cwd    = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                let tx     = self.lsp_tx.clone();
                match LspClient::start(&argv, cwd, tx).await {
                    Ok(client) => { self.lsp_clients.insert(ext.clone(), client); }
                    Err(e)     => { self.status_msg = format!("LSP start failed: {e}"); return; }
                }
            } else {
                self.status_msg = format!("No LSP configured for .{ext}");
                return;
            }
        }

        let uri = buf.path.as_ref().map(|p| {
            format!("file://{}", p.to_string_lossy())
        }).unwrap_or_else(|| "file:///tmp/scratch".to_string());

        let pos = nova_lsp::Position {
            line:      buf.cursor.pos.line as u32,
            character: buf.cursor.pos.col as u32,
        };

        let client = match self.lsp_clients.get_mut(&ext) {
            Some(c) => c,
            None    => return,
        };

        match action {
            Action::HoverDocs => {
                match client.hover(&uri, pos).await {
                    Ok(Some(h)) => {
                        let text = match h.contents {
                            nova_lsp::HoverContents::Markup(m) => m.value,
                            nova_lsp::HoverContents::String(s) => s,
                        };
                        self.status_msg = text.lines().next().unwrap_or("").to_string();
                    }
                    Ok(None) => {}
                    Err(e)   => { self.status_msg = format!("Hover failed: {e}"); }
                }
            }
            Action::GotoDefinition => {
                match client.goto_definition(&uri, pos).await {
                    Ok(locs) if !locs.is_empty() => {
                        let loc = &locs[0];
                        let path = loc.uri.strip_prefix("file://").unwrap_or(&loc.uri);
                        self.open_file(PathBuf::from(path));
                        let l = loc.range.start.line as usize;
                        let c = loc.range.start.character as usize;
                        self.buffers[self.active_buf].cursor.set(l, c);
                    }
                    Ok(_)  => { self.status_msg = "No definition found".to_string(); }
                    Err(e) => { self.status_msg = format!("GoTo failed: {e}"); }
                }
            }
            Action::FormatDocument => {
                let tab_size   = self.config.editor.tab_width as u32;
                let use_spaces = self.config.editor.expand_tabs;
                match client.format_document(&uri, tab_size, use_spaces).await {
                    Ok(edits) => {
                        if !edits.is_null() {
                            self.status_msg = "Document formatted".to_string();
                        }
                    }
                    Err(e) => { self.status_msg = format!("Format failed: {e}"); }
                }
            }
            _ => {}
        }
    }

    fn handle_lsp_event(&mut self, ev: LspEvent) {
        match ev {
            LspEvent::Diagnostics { uri: _, diagnostics } => {
                if !diagnostics.is_empty() {
                    let sev = diagnostics[0].severity.unwrap_or(1);
                    let icon = if sev == 1 { "E" } else { "W" };
                    self.lsp_msg = format!("{} {}", icon, diagnostics[0].message.lines().next().unwrap_or(""));
                } else {
                    self.lsp_msg.clear();
                }
            }
            LspEvent::ShowMessage(m) => { self.status_msg = m; }
            LspEvent::LogMessage(_)  => {}
        }
    }

    // ── Session ───────────────────────────────────────────────────────────────

    fn save_session(&self) -> Result<()> {
        let cwd     = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let session = Session {
            active_buffer: self.active_buf,
            working_dir:   cwd,
            buffers: self.buffers.iter().filter_map(|b| {
                b.path.as_ref().map(|p| nova_core::session::SessionBuffer {
                    path:        p.clone(),
                    cursor_line: b.cursor.pos.line,
                    cursor_col:  b.cursor.pos.col,
                    scroll_top:  b.scroll_top,
                })
            }).collect(),
        };
        session.save()
    }

    // ── Layout helpers ────────────────────────────────────────────────────────

    fn editor_viewport_h(&self) -> usize {
        // Approximate — the real value comes from the frame during render
        24usize.saturating_sub(2) // tab bar + status bar
    }

    // ── Render ────────────────────────────────────────────────────────────────

    fn render(&mut self, frame: &mut ratatui::Frame) {
        let area = frame.size();

        // ── Outer vertical split: [file_tree | content] ──────────────────
        let (tree_area, content_area) = if self.file_tree.is_some() {
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Length(28), Constraint::Min(1)])
                .split(area);
            (Some(chunks[0]), chunks[1])
        } else {
            (None, area)
        };

        // ── Content area: [editor(s) | git_panel] ────────────────────────
        let (editor_area, git_area) = if self.git_panel.is_some() {
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Min(1), Constraint::Length(36)])
                .split(content_area);
            (chunks[0], Some(chunks[1]))
        } else {
            (content_area, None)
        };

        // ── Editor area: [tabs | editors | terminal | status] ────────────
        let terminal_h = if self.terminal.active { 14 } else { 0 };
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),                             // tab bar
                Constraint::Min(1),                                // editors
                Constraint::Length(terminal_h),                    // terminal
                Constraint::Length(1),                             // status bar
            ])
            .split(editor_area);

        let tab_area      = chunks[0];
        let editors_area  = chunks[1];
        let terminal_area = chunks[2];
        let status_area   = chunks[3];

        // ── Tab bar ───────────────────────────────────────────────────────
        let tab_names: Vec<&str> = self.buffers.iter().map(|b| b.name.as_str()).collect();
        let tab_dirty: Vec<bool> = self.buffers.iter().map(|b| b.dirty).collect();
        TabBar::render(frame, tab_area, &tab_names, self.active_buf, &tab_dirty, &self.theme);

        // ── Editor pane(s) ────────────────────────────────────────────────
        match &self.split {
            SplitLayout::Single => {
                self.render_editor(frame, editors_area, self.active_buf);
            }
            SplitLayout::Vertical { right_buf, .. } => {
                let rb = *right_buf;
                let halves = Layout::default()
                    .direction(Direction::Horizontal)
                    .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
                    .split(editors_area);
                let left_idx = self.active_buf;
                self.render_editor(frame, halves[0], left_idx);
                self.render_editor(frame, halves[1], rb);
            }
            SplitLayout::Horizontal { bottom_buf, .. } => {
                let bb = *bottom_buf;
                let halves = Layout::default()
                    .direction(Direction::Vertical)
                    .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
                    .split(editors_area);
                let top_idx = self.active_buf;
                self.render_editor(frame, halves[0], top_idx);
                self.render_editor(frame, halves[1], bb);
            }
        }

        // ── Terminal ──────────────────────────────────────────────────────
        if self.terminal.active {
            self.terminal.render(frame, terminal_area, &self.theme);
        }

        // ── Status bar ────────────────────────────────────────────────────
        let buf = &self.buffers[self.active_buf];
        let msg = if !self.status_msg.is_empty() {
            self.status_msg.as_str()
        } else {
            self.lsp_msg.as_str()
        };
        let display_mode = if !self.command_buf.is_empty() {
            // Show command buffer in status area
            StatusBar::render(
                frame,
                status_area,
                &Mode::Command,
                &format!(":{}", self.command_buf),
                buf.dirty,
                buf.cursor.pos.line,
                buf.cursor.pos.col,
                buf.line_count(),
                &self.git_branch,
                msg,
                &self.theme,
            );
            return;
        } else if matches!(self.mode, Mode::Search { .. }) {
            let prefix = if self.search_fwd { "/" } else { "?" };
            StatusBar::render(
                frame,
                status_area,
                &self.mode,
                &format!("{}{}", prefix, self.search_term),
                buf.dirty,
                buf.cursor.pos.line,
                buf.cursor.pos.col,
                buf.line_count(),
                &self.git_branch,
                msg,
                &self.theme,
            );
            return;
        } else {
            &self.mode
        };

        StatusBar::render(
            frame,
            status_area,
            display_mode,
            &buf.name,
            buf.dirty,
            buf.cursor.pos.line,
            buf.cursor.pos.col,
            buf.line_count(),
            &self.git_branch,
            msg,
            &self.theme,
        );

        // ── File tree ─────────────────────────────────────────────────────
        if let (Some(ft), Some(ta)) = (&mut self.file_tree, tree_area) {
            ft.render(frame, ta, &self.theme);
        }

        // ── Git panel ─────────────────────────────────────────────────────
        if let (Some(gp), Some(ga)) = (&mut self.git_panel, git_area) {
            gp.render(frame, ga, &self.theme);
        }

        // ── Overlays (rendered last, on top) ──────────────────────────────
        if self.fuzzy.open {
            self.fuzzy.render(frame, area, &self.theme);
        }
        if self.palette.open {
            self.palette.render(frame, area, &self.theme);
        }
    }

    fn render_editor(&self, frame: &mut ratatui::Frame, area: Rect, buf_idx: usize) {
        if buf_idx >= self.buffers.len() { return; }
        let buf   = &self.buffers[buf_idx];
        let pane  = &self.panes[buf_idx];
        pane.render(
            frame,
            area,
            buf,
            &self.mode,
            &self.search_term,
            &self.config.editor.line_numbers,
            &self.changed_lines.added,
            &self.changed_lines.changed,
            &self.changed_lines.deleted,
            &self.theme,
        );
    }
}

// ── Session helpers ───────────────────────────────────────────────────────────

fn load_session_or_scratch() -> (Vec<Buffer>, usize, Vec<EditorPane>) {
    match Session::load() {
        Ok(sess) if !sess.buffers.is_empty() => {
            let mut buffers = Vec::new();
            let mut panes   = Vec::new();
            for sb in &sess.buffers {
                match Buffer::from_path(&sb.path) {
                    Ok(mut buf) => {
                        buf.cursor.set(sb.cursor_line, sb.cursor_col);
                        buf.scroll_top = sb.scroll_top;
                        let lang = sb.path.extension()
                            .and_then(|e| e.to_str())
                            .map(Lang::from_extension)
                            .unwrap_or(Lang::PlainText);
                        let mut pane = EditorPane::new(lang);
                        pane.reparse(&buf.content());
                        buffers.push(buf);
                        panes.push(pane);
                    }
                    Err(_) => {}
                }
            }
            if buffers.is_empty() {
                new_scratch_state()
            } else {
                let active = sess.active_buffer.min(buffers.len() - 1);
                (buffers, active, panes)
            }
        }
        _ => new_scratch_state(),
    }
}

fn new_scratch_state() -> (Vec<Buffer>, usize, Vec<EditorPane>) {
    let buf  = Buffer::new_scratch();
    let pane = EditorPane::new(Lang::PlainText);
    (vec![buf], 0, vec![pane])
}
