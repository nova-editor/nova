use anyhow::{Context, Result};
use std::path::PathBuf;

use crate::repo::GitRepo;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileStatusKind {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
    Ignored,
    Conflicted,
    TypeChanged,
}

#[derive(Debug, Clone)]
pub struct FileStatus {
    pub path:   PathBuf,
    pub kind:   FileStatusKind,
    pub staged: bool,
}

pub struct StatusManager<'a> {
    pub repo: &'a GitRepo,
}

impl<'a> StatusManager<'a> {
    pub fn new(repo: &'a GitRepo) -> Self {
        Self { repo }
    }

    /// List all changed files in the working directory.
    pub fn list(&self) -> Result<Vec<FileStatus>> {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .exclude_submodules(true);

        let statuses = self
            .repo
            .repo
            .statuses(Some(&mut opts))
            .context("reading git status")?;

        let mut out = Vec::new();
        for entry in statuses.iter() {
            let path   = PathBuf::from(entry.path().unwrap_or(""));
            let flags  = entry.status();

            let (kind, staged) = if flags.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::INDEX_RENAMED
                    | git2::Status::INDEX_TYPECHANGE,
            ) {
                let k = if flags.contains(git2::Status::INDEX_NEW) {
                    FileStatusKind::Added
                } else if flags.contains(git2::Status::INDEX_DELETED) {
                    FileStatusKind::Deleted
                } else if flags.contains(git2::Status::INDEX_RENAMED) {
                    FileStatusKind::Renamed
                } else {
                    FileStatusKind::Modified
                };
                (k, true)
            } else if flags.intersects(
                git2::Status::WT_NEW
                    | git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED
                    | git2::Status::WT_RENAMED
                    | git2::Status::WT_TYPECHANGE,
            ) {
                let k = if flags.contains(git2::Status::WT_NEW) {
                    FileStatusKind::Untracked
                } else if flags.contains(git2::Status::WT_DELETED) {
                    FileStatusKind::Deleted
                } else {
                    FileStatusKind::Modified
                };
                (k, false)
            } else if flags.contains(git2::Status::CONFLICTED) {
                (FileStatusKind::Conflicted, false)
            } else if flags.contains(git2::Status::IGNORED) {
                (FileStatusKind::Ignored, false)
            } else {
                continue;
            };

            out.push(FileStatus { path, kind, staged });
        }
        Ok(out)
    }

    /// Stage a specific file path.
    pub fn stage(&self, path: &std::path::Path) -> Result<()> {
        let mut index = self.repo.repo.index().context("opening git index")?;
        let rel = path
            .strip_prefix(&self.repo.workdir)
            .unwrap_or(path);
        index.add_path(rel).with_context(|| format!("staging {}", rel.display()))?;
        index.write().context("writing git index")?;
        Ok(())
    }

    /// Unstage a file (reset HEAD).
    pub fn unstage(&self, path: &std::path::Path) -> Result<()> {
        let head = self.repo.repo.head().context("reading HEAD")?;
        let head_commit = head.peel_to_commit().context("peeling HEAD to commit")?;
        let head_tree   = head_commit.tree().context("getting HEAD tree")?;

        let rel = path
            .strip_prefix(&self.repo.workdir)
            .unwrap_or(path);

        self.repo
            .repo
            .reset_default(Some(head_tree.as_object()), [rel])
            .with_context(|| format!("unstaging {}", rel.display()))?;
        Ok(())
    }
}
