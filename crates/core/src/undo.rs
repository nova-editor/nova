use ropey::Rope;

#[derive(Debug, Clone)]
pub enum EditOp {
    Insert { char_idx: usize, text: String },
    Delete { char_idx: usize, text: String },
}

impl EditOp {
    pub fn apply(&self, rope: &mut Rope) {
        match self {
            EditOp::Insert { char_idx, text } => {
                rope.insert(*char_idx, text);
            }
            EditOp::Delete { char_idx, text } => {
                let end = char_idx + text.chars().count();
                rope.remove(*char_idx..end);
            }
        }
    }

    pub fn inverse(&self) -> EditOp {
        match self {
            EditOp::Insert { char_idx, text } => EditOp::Delete {
                char_idx: *char_idx,
                text:      text.clone(),
            },
            EditOp::Delete { char_idx, text } => EditOp::Insert {
                char_idx: *char_idx,
                text:      text.clone(),
            },
        }
    }
}

/// A transaction is a group of ops applied atomically (one undo step).
#[derive(Debug, Clone)]
pub struct Transaction {
    pub ops: Vec<EditOp>,
}

impl Transaction {
    pub fn new(ops: Vec<EditOp>) -> Self {
        Self { ops }
    }

    pub fn single(op: EditOp) -> Self {
        Self { ops: vec![op] }
    }

    pub fn apply(&self, rope: &mut Rope) {
        for op in &self.ops {
            op.apply(rope);
        }
    }

    pub fn undo(&self, rope: &mut Rope) {
        for op in self.ops.iter().rev() {
            op.inverse().apply(rope);
        }
    }
}

#[derive(Debug, Default)]
pub struct UndoStack {
    undo: Vec<Transaction>,
    redo: Vec<Transaction>,
}

impl UndoStack {
    pub fn push(&mut self, tx: Transaction) {
        self.undo.push(tx);
        self.redo.clear();
    }

    pub fn undo(&mut self, rope: &mut Rope) -> bool {
        if let Some(tx) = self.undo.pop() {
            tx.undo(rope);
            self.redo.push(tx);
            true
        } else {
            false
        }
    }

    pub fn redo(&mut self, rope: &mut Rope) -> bool {
        if let Some(tx) = self.redo.pop() {
            tx.apply(rope);
            self.undo.push(tx);
            true
        } else {
            false
        }
    }

    pub fn is_empty(&self) -> bool {
        self.undo.is_empty()
    }
}
