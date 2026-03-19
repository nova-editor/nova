use anyhow::{Context, Result};
use std::cell::Cell;
use std::path::Path;

use crate::repo::GitRepo;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffLineKind {
    Context,
    Added,
    Deleted,
}

#[derive(Debug, Clone)]
pub struct DiffLine {
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub kind:       DiffLineKind,
    pub content:    String,
}

#[derive(Debug, Clone)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines:     Vec<DiffLine>,
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub path:  String,
    pub hunks: Vec<DiffHunk>,
}

pub struct DiffManager<'a> {
    pub repo: &'a GitRepo,
}

impl<'a> DiffManager<'a> {
    pub fn new(repo: &'a GitRepo) -> Self {
        Self { repo }
    }

    /// Diff the working-tree version of `file_path` against HEAD.
    pub fn diff_file(&self, file_path: &Path) -> Result<FileDiff> {
        let rel = file_path
            .strip_prefix(&self.repo.workdir)
            .unwrap_or(file_path);

        let mut diff_opts = git2::DiffOptions::new();
        diff_opts.pathspec(rel.to_string_lossy().as_ref());

        let head_tree = self
            .repo
            .repo
            .head()
            .and_then(|h| h.peel_to_tree())
            .ok();

        let diff = self
            .repo
            .repo
            .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut diff_opts))
            .context("computing diff")?;

        // Collect raw hunk/line data. Two separate passes avoid double-borrowing
        // the same Vec from two mutable closures.
        let mut raw_hunks: Vec<(u32, u32, u32, u32)> = Vec::new();
        // Cell allows both closures to share this counter without aliased &mut refs.
        let hunk_count = Cell::new(0usize);
        // (hunk_index, old_lineno, new_lineno, origin, content)
        let mut raw_lines: Vec<(usize, Option<u32>, Option<u32>, char, String)> = Vec::new();

        diff.foreach(
            &mut |_, _| true,
            None,
            Some(&mut |_, hunk| {
                raw_hunks.push((
                    hunk.old_start(),
                    hunk.old_lines(),
                    hunk.new_start(),
                    hunk.new_lines(),
                ));
                hunk_count.set(hunk_count.get() + 1);
                true
            }),
            Some(&mut |_, _, line| {
                let hunk_idx = hunk_count.get().saturating_sub(1);
                let content  = std::str::from_utf8(line.content())
                    .unwrap_or("")
                    .trim_end_matches('\n')
                    .to_string();
                raw_lines.push((hunk_idx, line.old_lineno(), line.new_lineno(), line.origin(), content));
                true
            }),
        )
        .context("iterating diff")?;

        // Build structured FileDiff
        let mut hunks: Vec<DiffHunk> = raw_hunks
            .into_iter()
            .map(|(old_start, old_lines, new_start, new_lines)| DiffHunk {
                old_start, old_lines, new_start, new_lines, lines: Vec::new(),
            })
            .collect();

        for (hunk_idx, old_lineno, new_lineno, origin, content) in raw_lines {
            let kind = match origin {
                '+' => DiffLineKind::Added,
                '-' => DiffLineKind::Deleted,
                _   => DiffLineKind::Context,
            };
            if let Some(h) = hunks.get_mut(hunk_idx) {
                h.lines.push(DiffLine { old_lineno, new_lineno, kind, content });
            }
        }

        Ok(FileDiff { path: rel.to_string_lossy().to_string(), hunks })
    }

    /// Return a set of line numbers (1-based) that have been added/changed/deleted
    /// in the working tree for use in the editor gutter.
    pub fn changed_lines(&self, file_path: &Path) -> Result<ChangedLines> {
        let diff = self.diff_file(file_path)?;
        let mut added   = std::collections::HashSet::new();
        let mut changed = std::collections::HashSet::new();
        let mut deleted = std::collections::HashSet::new();

        for hunk in &diff.hunks {
            for line in &hunk.lines {
                match line.kind {
                    DiffLineKind::Added   => {
                        if let Some(n) = line.new_lineno { added.insert(n as usize); }
                    }
                    DiffLineKind::Deleted => {
                        if let Some(n) = line.old_lineno { deleted.insert(n as usize); }
                    }
                    DiffLineKind::Context => {}
                }
            }
        }

        // Lines that were both deleted-before and added-after → "changed"
        for &l in &added.clone() {
            if deleted.contains(&l) {
                changed.insert(l);
                added.remove(&l);
                deleted.remove(&l);
            }
        }

        Ok(ChangedLines { added, changed, deleted })
    }
}

#[derive(Debug, Default)]
pub struct ChangedLines {
    pub added:   std::collections::HashSet<usize>,
    pub changed: std::collections::HashSet<usize>,
    pub deleted: std::collections::HashSet<usize>,
}
