use std::collections::HashMap;
use std::path::PathBuf;

use crate::cursor::Position;

#[derive(Debug, Clone)]
pub struct Mark {
    pub file: PathBuf,
    pub pos:  Position,
}

#[derive(Debug, Default)]
pub struct Marks {
    marks: HashMap<char, Mark>,
}

impl Marks {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, name: char, file: PathBuf, pos: Position) {
        self.marks.insert(name, Mark { file, pos });
    }

    pub fn get(&self, name: char) -> Option<&Mark> {
        self.marks.get(&name)
    }

    pub fn delete(&mut self, name: char) {
        self.marks.remove(&name);
    }

    pub fn all(&self) -> &HashMap<char, Mark> {
        &self.marks
    }
}
