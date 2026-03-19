#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Action {
    // ── Cursor movement ───────────────────────────────────────────────────────
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
    MoveWordForward,
    MoveWordBack,
    MoveLineStart,
    MoveLineEnd,
    MoveFileStart,
    MoveFileEnd,
    MoveToLine(usize),
    PageUp,
    PageDown,
    ScrollUp,
    ScrollDown,

    // ── Mode switches ─────────────────────────────────────────────────────────
    EnterInsertMode,
    EnterInsertModeAfter,
    EnterInsertModeLineEnd,
    EnterInsertModeNewlineBelow,
    EnterInsertModeNewlineAbove,
    EnterNormalMode,
    EnterVisualMode,
    EnterVisualLineMode,
    EnterCommandMode,
    EnterSearchForward,
    EnterSearchBackward,

    // ── Editing ───────────────────────────────────────────────────────────────
    InsertChar(char),
    InsertNewline,
    InsertTab,
    Backspace,
    Delete,
    DeleteLine,
    DeleteWord,
    DeleteToLineEnd,
    ChangeWord,
    ChangeToLineEnd,

    // ── Clipboard ─────────────────────────────────────────────────────────────
    Yank,
    YankLine,
    Paste,
    PasteBefore,

    // ── File ops ──────────────────────────────────────────────────────────────
    Save,
    SaveAs(String),
    Quit,
    ForceQuit,
    SaveAndQuit,

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    Undo,
    Redo,

    // ── Search / Replace ──────────────────────────────────────────────────────
    SearchNext,
    SearchPrev,
    SearchConfirm(String),
    ReplaceAll { from: String, to: String },

    // ── Buffer management ─────────────────────────────────────────────────────
    NextBuffer,
    PrevBuffer,
    CloseBuffer,
    NewBuffer,
    OpenFile(String),

    // ── Splits ────────────────────────────────────────────────────────────────
    SplitVertical,
    SplitHorizontal,
    FocusNextSplit,
    FocusPrevSplit,
    CloseSplit,

    // ── Panel toggles ─────────────────────────────────────────────────────────
    ToggleFileTree,
    ToggleTerminal,
    ToggleGitPanel,

    // ── Fuzzy finder / command palette ────────────────────────────────────────
    OpenFuzzyFinder,
    OpenCommandPalette,

    // ── Git ───────────────────────────────────────────────────────────────────
    GitStageHunk,
    GitUnstageHunk,
    GitCommit,
    GitDiff,
    GitBranch,

    // ── Marks ─────────────────────────────────────────────────────────────────
    SetMark(char),
    JumpToMark(char),

    // ── LSP ───────────────────────────────────────────────────────────────────
    GotoDefinition,
    GotoReferences,
    HoverDocs,
    CodeAction,
    RenameSymbol,
    FormatDocument,
    NextDiagnostic,
    PrevDiagnostic,

    // ── Command mode ──────────────────────────────────────────────────────────
    CommandConfirm(String),
    CommandAbort,

    /// Nothing to do.
    None,
}
