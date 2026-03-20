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

// ── Existing commands ─────────────────────────────────────────────────────────

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

/// Parallel git_state — runs branch, status, and branch-list queries concurrently.
///
/// Each operation opens its own GitRepo handle so there is no lock contention.
/// spawn_blocking moves the blocking libgit2 calls off the async thread pool,
/// and tokio::join! fans all three out simultaneously.
/// Typical wall-clock improvement: ~3× on large repos where each query > 20ms.
#[tauri::command]
pub async fn git_state(repo_path: String) -> Result<GitStateResult, String> {
    let p1 = repo_path.clone();
    let p2 = repo_path.clone();
    let p3 = repo_path.clone();

    let (branch_res, status_res, branches_res) = tokio::join!(
        tokio::task::spawn_blocking(move || -> Result<String, String> {
            open_repo(&p1)?.current_branch().map_err(|e| e.to_string())
        }),
        tokio::task::spawn_blocking(move || -> Result<Vec<GitFileStatus>, String> {
            let repo = open_repo(&p2)?;
            Ok(StatusManager::new(&repo).list().map_err(|e| e.to_string())?
                .into_iter()
                .map(|s| GitFileStatus {
                    path:   s.path.to_string_lossy().to_string(),
                    kind:   format!("{:?}", s.kind),
                    staged: s.staged,
                })
                .collect())
        }),
        tokio::task::spawn_blocking(move || -> Result<Vec<GitBranchInfo>, String> {
            let repo = open_repo(&p3)?;
            Ok(BranchManager::new(&repo).list_local().map_err(|e| e.to_string())?
                .into_iter()
                .map(|b| GitBranchInfo {
                    name:       b.name,
                    is_current: b.is_current,
                    upstream:   b.upstream,
                })
                .collect())
        }),
    );

    Ok(GitStateResult {
        branch:   branch_res.map_err(|e| e.to_string())??,
        status:   status_res.map_err(|e| e.to_string())??,
        branches: branches_res.map_err(|e| e.to_string())??,
    })
}

// ── New commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_delete_branch(repo_path: String, branch: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    BranchManager::new(&repo).delete(&branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    git_run_async(vec!["add".into(), "-A".into()], repo_path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    git_run_async(vec!["reset".into(), "HEAD".into()], repo_path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_list(repo_path: String) -> Result<Vec<GitStash>, String> {
    let raw = git_run_async(
        vec!["stash".into(), "list".into(), "--format=%gd\x00%s".into()],
        repo_path,
    ).await?;

    let stashes = raw.lines().enumerate().filter_map(|(i, line)| {
        let mut parts = line.splitn(2, '\x00');
        let _ref_str = parts.next()?;
        let msg = parts.next()?.to_string();
        let branch = if let Some(rest) = msg.strip_prefix("On ").or_else(|| msg.strip_prefix("WIP on ")) {
            rest.splitn(2, ':').next().unwrap_or("").trim().to_string()
        } else {
            String::new()
        };
        Some(GitStash { index: i, message: msg, branch })
    }).collect();

    Ok(stashes)
}

#[tauri::command]
pub async fn git_stash_push(repo_path: String, message: Option<String>) -> Result<(), String> {
    let mut args = vec!["stash".to_string(), "push".to_string()];
    if let Some(ref m) = message {
        if !m.trim().is_empty() { args.push("-m".to_string()); args.push(m.clone()); }
    }
    git_run_async(args, repo_path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_pop(repo_path: String, index: usize) -> Result<(), String> {
    git_run_async(
        vec!["stash".into(), "pop".into(), format!("stash@{{{}}}", index)],
        repo_path,
    ).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    git_run_async(
        vec!["stash".into(), "drop".into(), format!("stash@{{{}}}", index)],
        repo_path,
    ).await.map(|_| ())
}

#[tauri::command]
pub async fn git_commit_amend(repo_path: String, message: String) -> Result<String, String> {
    git_run_async(
        vec!["commit".into(), "--amend".into(), "-m".into(), message],
        repo_path,
    ).await.map(|out| out.trim().lines().next().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn git_commit_files(repo_path: String, oid: String) -> Result<Vec<String>, String> {
    let raw = git_run_async(
        vec!["diff-tree".into(), "--no-commit-id".into(), "-r".into(), "--name-status".into(), oid],
        repo_path,
    ).await?;
    Ok(raw.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect())
}

#[tauri::command]
pub async fn git_ahead_behind(repo_path: String, branch: String) -> Result<AheadBehind, String> {
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

#[tauri::command]
pub async fn git_last_commit_message(repo_path: String) -> Result<String, String> {
    git_run_async(
        vec!["log".into(), "-1".into(), "--pretty=%s%n%b".into()],
        repo_path,
    ).await.map(|s| s.trim().to_string())
}

// ── Graph visualizer ──────────────────────────────────────────────────────────

/// A commit node for the branch graph, including pre-computed visual lane.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphCommit {
    pub oid:      String,       // 7-char abbreviated hash
    pub full_oid: String,       // 40-char hash (parent matching)
    pub parents:  Vec<String>,  // full OIDs of parents
    pub refs:     Vec<String>,  // branch/tag names
    pub message:  String,
    pub author:   String,
    pub time:     i64,
    /// Visual lane index (0 = leftmost column). Computed by assign_lanes().
    pub lane:     usize,
    /// Color bucket: lane % 8, cycles through 8 distinct branch colours.
    pub color:    usize,
}

/// Greedy DAG lane-assignment for commit graph rendering.
///
/// Complexity: O(n · k) where n = commits, k = max simultaneous active branches
/// (typically ≤ 10 for most repos).
///
/// Algorithm:
///   `lanes: Vec<Option<String>>` — slot i is "waiting" for the commit with that full_oid.
///
///   For each commit c (already topologically ordered by git --topo-order):
///     1. Find all slots waiting for c.full_oid  → candidate lanes
///     2. Pick the leftmost candidate as c's lane (minimises lane crossings)
///     3. Set that slot to track c's first parent  (lane continues down the graph)
///     4. Close all other candidate slots          (merge lines converge here)
///     5. For each extra parent ensure a free slot tracks it (branch lines fork)
///
/// The `known` HashSet gives O(1) parent reachability checks so lanes aren't opened
/// for commits outside the current window.
fn assign_lanes(commits: &mut Vec<GraphCommit>) {
    // O(n) build: owned strings so we don't hold a borrow while mutating commits
    let known: std::collections::HashSet<String> =
        commits.iter().map(|c| c.full_oid.clone()).collect();

    // lanes[i] = Some(full_oid) → lane i is waiting for that commit
    let mut lanes: Vec<Option<String>> = Vec::new();

    for i in 0..commits.len() {
        // Clone to avoid borrow conflict with mutable `commits[i]` writes below
        let full_oid = commits[i].full_oid.clone();
        let parents  = commits[i].parents.clone();

        // Step 1 — which lanes are already tracking this commit?
        let tracking: Vec<usize> = lanes.iter().enumerate()
            .filter_map(|(j, s)| if s.as_deref() == Some(&full_oid) { Some(j) } else { None })
            .collect();

        // Step 2 — leftmost tracking lane, or the first free slot, or a brand-new slot
        let my_lane = tracking.first().copied().unwrap_or_else(|| {
            lanes.iter().position(|s| s.is_none()).unwrap_or_else(|| {
                lanes.push(None);
                lanes.len() - 1
            })
        });

        // Step 3 — this lane now follows our first parent (if visible in the window)
        lanes[my_lane] = parents.first()
            .filter(|p| known.contains(p.as_str()))
            .cloned();

        // Step 4 — close extra lanes that were waiting for us (merge lines end here)
        for &extra in tracking.iter().skip(1) {
            lanes[extra] = None;
        }

        // Step 5 — ensure every additional parent has a lane tracking it
        for parent in parents.iter().skip(1) {
            if !known.contains(parent.as_str()) { continue; }          // outside window
            if lanes.iter().any(|s| s.as_deref() == Some(parent)) { continue; } // already tracked
            let slot = lanes.iter().position(|s| s.is_none()).unwrap_or_else(|| {
                lanes.push(None);
                lanes.len() - 1
            });
            lanes[slot] = Some(parent.clone());
        }

        commits[i].lane  = my_lane;
        commits[i].color = my_lane % 8;
    }
}

#[tauri::command]
pub async fn git_graph(repo_path: String, limit: usize) -> Result<Vec<GraphCommit>, String> {
    let raw = git_run_async(
        vec![
            "log".into(),
            "--all".into(),
            "--topo-order".into(),
            format!("-{}", limit),
            "--decorate=full".into(),
            "--format=%H %P\x01%D\x01%s\x01%an\x01%ct".into(),
        ],
        repo_path,
    ).await?;

    let mut out: Vec<GraphCommit> = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let parts: Vec<&str> = line.splitn(5, '\x01').collect();
        if parts.len() < 5 { continue; }

        let mut hp = hash_parts(parts[0]);
        if hp.is_empty() { continue; }
        let full_oid = hp.remove(0);
        let parents  = hp;
        let refs     = parse_decorate(parts[1]);
        let message  = parts[2].to_string();
        let author   = parts[3].to_string();
        let time: i64 = parts[4].trim().parse().unwrap_or(0);

        out.push(GraphCommit {
            oid: full_oid[..full_oid.len().min(7)].to_string(),
            full_oid,
            parents,
            refs,
            message,
            author,
            time,
            lane:  0, // filled in by assign_lanes below
            color: 0,
        });
    }

    // Compute visual lanes in O(n·k) — k ≈ active branch count
    assign_lanes(&mut out);

    Ok(out)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn hash_parts(s: &str) -> Vec<String> {
    s.split_whitespace().map(|p| p.to_string()).collect()
}

fn parse_decorate(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() { return vec![]; }
    raw.split(',')
        .map(|token| {
            let t = token.trim();
            if let Some(rest) = t.strip_prefix("HEAD -> ") {
                return format!("HEAD,{}", strip_ref_prefix(rest));
            }
            if let Some(rest) = t.strip_prefix("tag: ") {
                return format!("tag: {}", strip_ref_prefix(rest));
            }
            strip_ref_prefix(t).to_string()
        })
        .flat_map(|s| s.split(',').map(|p| p.to_string()).collect::<Vec<_>>())
        .filter(|s| !s.is_empty())
        .collect()
}

fn strip_ref_prefix(r: &str) -> &str {
    if let Some(s) = r.strip_prefix("refs/heads/")   { return s; }
    if let Some(s) = r.strip_prefix("refs/remotes/") { return s; }
    if let Some(s) = r.strip_prefix("refs/tags/")    { return s; }
    r
}
