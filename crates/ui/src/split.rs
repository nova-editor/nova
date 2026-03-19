/// Which pane has focus in a split view.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SplitFocus {
    #[default]
    Left,
    Right,
}

impl SplitFocus {
    pub fn toggle(self) -> Self {
        match self {
            SplitFocus::Left  => SplitFocus::Right,
            SplitFocus::Right => SplitFocus::Left,
        }
    }
}

/// Whether the editor area has a vertical split or a single pane.
#[derive(Debug, Clone, Default)]
pub enum SplitLayout {
    #[default]
    Single,
    Vertical {
        /// Ratio of left pane width (0.0 – 1.0)
        ratio:  f32,
        focus:  SplitFocus,
        /// Buffer index shown in the right pane
        right_buf: usize,
    },
    Horizontal {
        ratio:  f32,
        focus:  SplitFocus,
        bottom_buf: usize,
    },
}

impl SplitLayout {
    pub fn is_split(&self) -> bool {
        !matches!(self, SplitLayout::Single)
    }

    pub fn focus(&self) -> SplitFocus {
        match self {
            SplitLayout::Single                    => SplitFocus::Left,
            SplitLayout::Vertical { focus, .. }    => *focus,
            SplitLayout::Horizontal { focus, .. }  => *focus,
        }
    }

    pub fn toggle_focus(&mut self) {
        match self {
            SplitLayout::Vertical   { focus, .. } => *focus = focus.toggle(),
            SplitLayout::Horizontal { focus, .. } => *focus = focus.toggle(),
            _ => {}
        }
    }

    pub fn close_split(&mut self) {
        *self = SplitLayout::Single;
    }

    pub fn split_vertical(right_buf: usize) -> Self {
        SplitLayout::Vertical { ratio: 0.5, focus: SplitFocus::Left, right_buf }
    }

    pub fn split_horizontal(bottom_buf: usize) -> Self {
        SplitLayout::Horizontal { ratio: 0.6, focus: SplitFocus::Left, bottom_buf }
    }
}
