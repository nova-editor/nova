pub mod branch;
pub mod commit;
pub mod diff;
pub mod repo;
pub mod status;

pub use branch::{BranchInfo, BranchManager};
pub use commit::Committer;
pub use diff::{DiffHunk, DiffLine, DiffLineKind, DiffManager, FileDiff};
pub use repo::GitRepo;
pub use status::{FileStatus, FileStatusKind, StatusManager};

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub oid:     String,
    pub message: String,
    pub author:  String,
    pub time:    i64,
}
