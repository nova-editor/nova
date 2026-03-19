use anyhow::{Context, Result};
use git2::Repository;
use std::path::{Path, PathBuf};

pub struct GitRepo {
    pub(crate) repo: Repository,
    pub workdir:     PathBuf,
}

impl GitRepo {
    /// Open the nearest git repository containing `path`.
    pub fn discover(path: &Path) -> Result<Self> {
        let repo = Repository::discover(path)
            .with_context(|| format!("no git repository found from {}", path.display()))?;
        let workdir = repo
            .workdir()
            .context("bare repositories are not supported")?
            .to_path_buf();
        Ok(Self { repo, workdir })
    }

    /// Return up to `limit` commits from HEAD in reverse-chronological order.
    pub fn log(&self, limit: usize) -> Result<Vec<crate::LogEntry>> {
        let mut revwalk = self.repo.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(git2::Sort::TIME)?;

        let mut out = Vec::new();
        for item in revwalk.take(limit) {
            let oid    = item?;
            let commit = self.repo.find_commit(oid)?;
            out.push(crate::LogEntry {
                oid:     format!("{:.7}", oid),
                message: commit.summary().unwrap_or("").to_string(),
                author:  commit.author().name().unwrap_or("unknown").to_string(),
                time:    commit.time().seconds(),
            });
        }
        Ok(out)
    }

    /// Return the name of the current branch, or `"HEAD"` if detached.
    pub fn current_branch(&self) -> Result<String> {
        let head = self.repo.head().context("reading HEAD")?;
        if head.is_branch() {
            Ok(head.shorthand().unwrap_or("HEAD").to_string())
        } else {
            let id = head.target().context("HEAD has no target")?;
            Ok(format!("HEAD:{:.7}", id))
        }
    }
}
