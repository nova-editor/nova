use anyhow::{Context, Result};

use crate::repo::GitRepo;

#[derive(Debug, Clone)]
pub struct BranchInfo {
    pub name:       String,
    pub is_current: bool,
    pub is_remote:  bool,
    pub upstream:   Option<String>,
}

pub struct BranchManager<'a> {
    pub repo: &'a GitRepo,
}

impl<'a> BranchManager<'a> {
    pub fn new(repo: &'a GitRepo) -> Self {
        Self { repo }
    }

    /// List all local branches.
    pub fn list_local(&self) -> Result<Vec<BranchInfo>> {
        let current = self.repo.current_branch().unwrap_or_default();
        let branches = self
            .repo
            .repo
            .branches(Some(git2::BranchType::Local))
            .context("listing branches")?;

        let mut out = Vec::new();
        for entry in branches {
            let (branch, _) = entry.context("reading branch entry")?;
            let name = branch
                .name()
                .context("branch name")?
                .unwrap_or("")
                .to_string();
            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));
            out.push(BranchInfo {
                is_current: name == current,
                is_remote: false,
                upstream,
                name,
            });
        }
        Ok(out)
    }

    /// Checkout an existing local branch by name.
    pub fn checkout(&self, branch_name: &str) -> Result<()> {
        let (obj, reference) = self
            .repo
            .repo
            .revparse_ext(branch_name)
            .with_context(|| format!("finding branch {}", branch_name))?;

        self.repo
            .repo
            .checkout_tree(&obj, None)
            .with_context(|| format!("checking out {}", branch_name))?;

        match reference {
            Some(r) => {
                let refname = r.name().context("branch ref name")?;
                self.repo
                    .repo
                    .set_head(refname)
                    .with_context(|| format!("setting HEAD to {}", refname))?;
            }
            None => {
                self.repo
                    .repo
                    .set_head_detached(obj.id())
                    .context("detaching HEAD")?;
            }
        }
        Ok(())
    }

    /// Create and checkout a new branch from HEAD.
    pub fn create_and_checkout(&self, branch_name: &str) -> Result<()> {
        let head_commit = self
            .repo
            .repo
            .head()
            .context("reading HEAD")?
            .peel_to_commit()
            .context("peeling HEAD")?;

        self.repo
            .repo
            .branch(branch_name, &head_commit, false)
            .with_context(|| format!("creating branch {}", branch_name))?;

        self.checkout(branch_name)?;
        Ok(())
    }

    /// Delete a local branch (must not be current).
    pub fn delete(&self, branch_name: &str) -> Result<()> {
        let mut branch = self
            .repo
            .repo
            .find_branch(branch_name, git2::BranchType::Local)
            .with_context(|| format!("finding branch {}", branch_name))?;
        branch.delete().with_context(|| format!("deleting branch {}", branch_name))?;
        Ok(())
    }
}
