#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Position {
    pub line: usize,
    pub col:  usize,
}

impl Position {
    pub fn new(line: usize, col: usize) -> Self {
        Self { line, col }
    }
}

impl PartialOrd for Position {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Position {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (self.line, self.col).cmp(&(other.line, other.col))
    }
}

#[derive(Debug, Clone, Default)]
pub struct Cursor {
    pub pos:         Position,
    /// Preserved during vertical movement so that moving up/down restores column
    pub desired_col: usize,
    /// Visual-mode selection anchor
    pub anchor:      Option<Position>,
}

impl Cursor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, line: usize, col: usize) {
        self.pos         = Position::new(line, col);
        self.desired_col = col;
    }

    pub fn set_anchor(&mut self) {
        self.anchor = Some(self.pos.clone());
    }

    pub fn clear_anchor(&mut self) {
        self.anchor = None;
    }

    /// Returns `(start, end)` of the selection sorted by document order.
    pub fn selection(&self) -> Option<(Position, Position)> {
        self.anchor.as_ref().map(|anchor| {
            if *anchor <= self.pos {
                (anchor.clone(), self.pos.clone())
            } else {
                (self.pos.clone(), anchor.clone())
            }
        })
    }
}
