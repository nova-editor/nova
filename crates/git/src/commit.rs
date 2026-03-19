use anyhow::{Context, Result};

use crate::repo::GitRepo;

pub struct Committer<'a> {
    pub repo: &'a GitRepo,
}

impl<'a> Committer<'a> {
    pub fn new(repo: &'a GitRepo) -> Self {
        Self { repo }
    }

    /// Stage all tracked changes and commit with `message`.
    pub fn commit_staged(&self, message: &str) -> Result<git2::Oid> {
        let mut index = self.repo.repo.index().context("opening index")?;
        let tree_id   = index.write_tree().context("writing tree")?;
        let tree      = self.repo.repo.find_tree(tree_id).context("finding tree")?;

        let sig = self
            .repo
            .repo
            .signature()
            .context("reading git signature (set user.name / user.email)")?;

        let parent_commit = self
            .repo
            .repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_commit().ok());

        let parents: Vec<&git2::Commit<'_>> = parent_commit.iter().collect();

        let oid = self
            .repo
            .repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .context("creating commit")?;

        Ok(oid)
    }

    /// Stage a specific file, then commit it.
    pub fn stage_and_commit(&self, path: &std::path::Path, message: &str) -> Result<git2::Oid> {
        let mut index = self.repo.repo.index().context("opening index")?;
        let rel = path.strip_prefix(&self.repo.workdir).unwrap_or(path);
        index.add_path(rel).with_context(|| format!("staging {}", rel.display()))?;
        index.write().context("writing index")?;
        self.commit_staged(message)
    }
}
