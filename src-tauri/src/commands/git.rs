use serde::{Deserialize, Serialize};
use nova_git::{BranchManager, DiffManager, GitRepo, StatusManager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub oid:     String,
    pub message: String,
    pub author:  String,
    pub time:    i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatus {
    pub path:   String,
    pub kind:   String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitBranchInfo {
    pub name:       String,
    pub is_current: bool,
    pub upstream:   Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitDiffLine {
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub kind:       String,
    pub content:    String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitDiffHunk {
    pub old_start: u32,
    pub new_start: u32,
    pub lines:     Vec<GitDiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStash {
    pub index:   usize,
    pub message: String,
    pub branch:  String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AheadBehind {
    pub ahead:  usize,
    pub behind: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStateResult {
    pub branch:   String,
    pub status:   Vec<GitFileStatus>,
    pub branches: Vec<GitBranchInfo>,
}

fn open_repo(repo_path: &str) -> Result<GitRepo, String> {
    GitRepo::discover(std::path::Path::new(repo_path)).map_err(|e| e.to_string())
}

fn git_run(args: &[&str], cwd: &str) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

async fn git_run_async(args: Vec<String>, cwd: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// ── Existing commands ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<Vec<GitFileStatus>, String> {
    let repo     = open_repo(&repo_path)?;
    let statuses = StatusManager::new(&repo).list().map_err(|e| e.to_string())?;
    Ok(statuses.into_iter().map(|s| GitFileStatus {
        path:   s.path.to_string_lossy().to_string(),
        kind:   format!("{:?}", s.kind),
        staged: s.staged,
    }).collect())
}

#[tauri::command]
pub async fn git_branch(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    repo.current_branch().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<GitBranchInfo>, String> {
    let repo     = open_repo(&repo_path)?;
    let branches = BranchManager::new(&repo).list_local().map_err(|e| e.to_string())?;
    Ok(branches.into_iter().map(|b| GitBranchInfo {
        name:       b.name,
        is_current: b.is_current,
        upstream:   b.upstream,
    }).collect())
}

#[tauri::command]
pub async fn git_stage(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    StatusManager::new(&repo)
        .stage(std::path::Path::new(&file_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_unstage(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    StatusManager::new(&repo)
        .unstage(std::path::Path::new(&file_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let oid  = nova_git::commit::Committer::new(&repo)
        .commit_staged(&message)
        .map_err(|e| e.to_string())?;
    Ok(format!("{:.7}", oid))
}

#[tauri::command]
pub async fn git_diff(repo_path: String, file_path: String) -> Result<Vec<GitDiffHunk>, String> {
    let repo      = open_repo(&repo_path)?;
    let file_diff = DiffManager::new(&repo)
        .diff_file(std::path::Path::new(&file_path))
        .map_err(|e| e.to_string())?;

    Ok(file_diff.hunks.into_iter().map(|h| GitDiffHunk {
        old_start: h.old_start,
        new_start: h.new_start,
        lines: h.lines.into_iter().map(|l| GitDiffLine {
            old_lineno: l.old_lineno,
            new_lineno: l.new_lineno,
            kind:    format!("{:?}", l.kind),
            content: l.content,
        }).collect(),
    }).collect())
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    BranchManager::new(&repo).checkout(&branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_log(repo_path: String, limit: usize) -> Result<Vec<GitCommit>, String> {
    let repo    = open_repo(&repo_path)?;
    let entries = repo.log(limit).map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(|e| GitCommit {
        oid: e.oid, message: e.message, author: e.author, time: e.time,
    }).collect())
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, branch: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    BranchManager::new(&repo)
        .create_and_checkout(&branch)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_discard(repo_path: String, file_path: String) -> Result<(), String> {
    git_run_async(
        vec!["checkout".into(), "--".into(), file_path],
        repo_path,
    ).await.map(|_| ())
}

#[tauri::command]
pub async fn git_state(repo_path: String) -> Result<GitStateResult, String> {
    let repo = open_repo(&repo_path)?;

    let branch = repo.current_branch().map_err(|e| e.to_string())?;

    let status = StatusManager::new(&repo)
        .list()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|s| GitFileStatus {
            path:   s.path.to_string_lossy().to_string(),
            kind:   format!("{:?}", s.kind),
            staged: s.staged,
        })
        .collect();

    let branches = BranchManager::new(&repo)
        .list_local()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|b| GitBranchInfo {
            name:       b.name,
            is_current: b.is_current,
            upstream:   b.upstream,
        })
        .collect();

    Ok(GitStateResult { branch, status, branches })
}

// ── New commands ─────────────────────────────────────────────────────────────

/// Actually delete a local branch (must not be current).
#[tauri::command]
pub async fn git_delete_branch(repo_path: String, branch: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    BranchManager::new(&repo).delete(&branch).map_err(|e| e.to_string())
}

/// Stage all changes (equivalent to `git add -A`).
#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    git_run_async(vec!["add".into(), "-A".into()], repo_path)
        .await
        .map(|_| ())
}

/// Unstage all staged changes (equivalent to `git reset HEAD`).
#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    git_run_async(vec!["reset".into(), "HEAD".into()], repo_path)
        .await
        .map(|_| ())
}

/// List all stashes with their index, message, and source branch.
#[tauri::command]
pub async fn git_stash_list(repo_path: String) -> Result<Vec<GitStash>, String> {
    // Format: "INDEX\x00MESSAGE" per line, split on NUL to avoid pipe conflicts
    let raw = git_run_async(
        vec!["stash".into(), "list".into(), "--format=%gd\x00%s".into()],
        repo_path,
    ).await?;

    let stashes = raw.lines().enumerate().filter_map(|(i, line)| {
        let mut parts = line.splitn(2, '\x00');
        let _ref_str = parts.next()?; // e.g. "stash@{0}"
        let msg = parts.next()?.to_string();
        // "On <branch>: <desc>" or "WIP on <branch>: <desc>"
        let branch = if let Some(rest) = msg.strip_prefix("On ").or_else(|| msg.strip_prefix("WIP on ")) {
            rest.splitn(2, ':').next().unwrap_or("").trim().to_string()
        } else {
            String::new()
        };
        Some(GitStash { index: i, message: msg, branch })
    }).collect();

    Ok(stashes)
}

/// Stash all current changes with an optional message.
#[tauri::command]
pub async fn git_stash_push(repo_path: String, message: Option<String>) -> Result<(), String> {
    let mut args = vec!["stash".to_string(), "push".to_string()];
    if let Some(ref m) = message {
        if !m.trim().is_empty() {
            args.push("-m".to_string());
            args.push(m.clone());
        }
    }
    git_run_async(args, repo_path).await.map(|_| ())
}

/// Pop (apply + drop) stash at the given index.
#[tauri::command]
pub async fn git_stash_pop(repo_path: String, index: usize) -> Result<(), String> {
    git_run_async(
        vec!["stash".into(), "pop".into(), format!("stash@{{{}}}", index)],
        repo_path,
    ).await.map(|_| ())
}

/// Drop (delete without applying) stash at the given index.
#[tauri::command]
pub async fn git_stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    git_run_async(
        vec!["stash".into(), "drop".into(), format!("stash@{{{}}}", index)],
        repo_path,
    ).await.map(|_| ())
}

/// Amend the last commit with a new message.
#[tauri::command]
pub async fn git_commit_amend(repo_path: String, message: String) -> Result<String, String> {
    git_run_async(
        vec!["commit".into(), "--amend".into(), "-m".into(), message],
        repo_path,
    ).await.map(|out| out.trim().lines().next().unwrap_or("").to_string())
}

/// List the files changed in a specific commit (for the Log tab detail view).
#[tauri::command]
pub async fn git_commit_files(repo_path: String, oid: String) -> Result<Vec<String>, String> {
    let raw = git_run_async(
        vec!["diff-tree".into(), "--no-commit-id".into(), "-r".into(), "--name-status".into(), oid],
        repo_path,
    ).await?;
    Ok(raw.lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect())
}

/// How many commits the current branch is ahead/behind its upstream.
/// Returns {ahead:0, behind:0} if there is no upstream or fetch data is stale.
#[tauri::command]
pub async fn git_ahead_behind(repo_path: String, branch: String) -> Result<AheadBehind, String> {
    // `git rev-list --left-right --count <upstream>...<branch>`
    // left count = behind, right count = ahead
    let refspec = format!("{}@{{u}}...{}", branch, branch);
    match git_run(&["rev-list", "--left-right", "--count", &refspec], &repo_path) {
        Err(_) => Ok(AheadBehind { ahead: 0, behind: 0 }),
        Ok(out) => {
            let parts: Vec<&str> = out.trim().split_whitespace().collect();
            let behind = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            let ahead  = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            Ok(AheadBehind { ahead, behind })
        }
    }
}

/// Fetch the message of the last commit (for amend pre-fill).
#[tauri::command]
pub async fn git_last_commit_message(repo_path: String) -> Result<String, String> {
    git_run_async(
        vec!["log".into(), "-1".into(), "--pretty=%s%n%b".into()],
        repo_path,
    ).await.map(|s| s.trim().to_string())
}
