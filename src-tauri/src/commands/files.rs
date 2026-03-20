use base64::{engine::general_purpose::STANDARD, Engine as _};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name:   String,
    pub path:   String,
    pub is_dir: bool,
    pub size:   u64,
}

// ── Natural sort ──────────────────────────────────────────────────────────────
// Compares strings by treating embedded decimal runs as numbers.
// "file10" > "file2" (numeric), "file02" == "file2" (leading zeros stripped).
// O(n) where n = max string length.

fn collect_num(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> u64 {
    let mut n = 0u64;
    while let Some(&c) = chars.peek() {
        if !c.is_ascii_digit() { break; }
        n = n.saturating_mul(10).saturating_add(c as u64 - b'0' as u64);
        chars.next();
    }
    n
}

fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let mut ai = a.chars().peekable();
    let mut bi = b.chars().peekable();
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None)     => return Ordering::Equal,
            (None, _)        => return Ordering::Less,
            (_, None)        => return Ordering::Greater,
            (Some(ac), Some(bc)) => {
                if ac.is_ascii_digit() && bc.is_ascii_digit() {
                    // Numeric segment — compare as integers
                    let an = collect_num(&mut ai);
                    let bn = collect_num(&mut bi);
                    match an.cmp(&bn) {
                        Ordering::Equal => continue,
                        o => return o,
                    }
                } else {
                    ai.next(); bi.next();
                    // Case-insensitive char comparison
                    let al = ac.to_lowercase().next().unwrap_or(ac);
                    let bl = bc.to_lowercase().next().unwrap_or(bc);
                    match al.cmp(&bl) {
                        Ordering::Equal => continue,
                        o => return o,
                    }
                }
            }
        }
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
}

/// Directories that are never useful to browse in a code editor.
/// Skipped in Phase 1 before any stat syscall is issued — zero cost.
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", ".hg", ".svn",  // VCS / package managers
    "target",                                 // Rust build output
    "dist", "build", "out", ".next", ".nuxt", ".output", // JS/framework build output
    ".turbo", ".vercel", ".netlify",          // deploy caches
    "__pycache__", ".venv", "venv", ".env",  // Python
    ".gradle", ".idea", ".vs", ".vscode",    // IDE/build caches
    "vendor",                                 // Go / PHP
    "Pods", ".build",                         // Swift / CocoaPods
];

/// List a directory with parallel stat calls and natural sort.
/// Skips known heavy/useless directories (node_modules, .git, target, dist, …)
/// before issuing any stat syscalls — they never appear in the file tree.
///
/// Algorithm:
///   Phase 1 — stream `read_dir`, drop SKIP_DIRS entries immediately (no stat cost).
///   Phase 2 — fan out remaining metadata() calls concurrently via JoinSet.
///   Phase 3 — natural sort: dirs first, numeric segments compared as integers.
#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    // Phase 1: Collect entry paths, skipping ignored dirs before any stat
    let mut dir = tokio::fs::read_dir(&path).await.map_err(|e| e.to_string())?;
    let mut pending: Vec<(String, PathBuf)> = Vec::new();
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let p = entry.path();
        if let Some(n) = p.file_name() {
            let name = n.to_string_lossy();
            // Drop known heavy/useless dirs — no syscall, just a string compare.
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            pending.push((name.into_owned(), p));
        }
    }

    // Phase 2: Stat all entries concurrently — JoinSet fans out all syscalls at once.
    // On a 1000-file directory this cuts wall-clock from O(1000 × seek) to ~O(1 batch).
    let mut tasks = tokio::task::JoinSet::new();
    for (name, p) in pending {
        tasks.spawn(async move {
            tokio::fs::metadata(&p).await.ok().map(|meta| FileEntry {
                name,
                path:   p.to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size:   meta.len(),
            })
        });
    }

    let mut result: Vec<FileEntry> = Vec::new();
    while let Some(res) = tasks.join_next().await {
        if let Ok(Some(entry)) = res { result.push(entry); }
    }

    // Phase 3: Natural sort — directories bubble to top, then natural filename order.
    result.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| natural_cmp(&a.name, &b.name))
    });
    Ok(result)
}

#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    tokio::fs::metadata(&path).await.is_ok()
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if meta.is_dir() {
        tokio::fs::remove_dir_all(&path).await.map_err(|e| e.to_string())
    } else {
        tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn rename_path(from: String, to: String) -> Result<(), String> {
    tokio::fs::rename(&from, &to).await.map_err(|e| e.to_string())
}

/// Read any file as a base64-encoded data URL (for binary assets like images).
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let b64   = STANDARD.encode(&bytes);
    let mime  = match PathBuf::from(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png")                => "image/png",
        Some("gif")                => "image/gif",
        Some("webp")               => "image/webp",
        Some("avif")               => "image/avif",
        Some("svg")                => "image/svg+xml",
        _                          => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// Return all interactive shells.
///
/// Unix: reads /etc/shells, deduplicates via HashSet in O(n) — the previous
///       Vec::dedup only removed *consecutive* duplicates (required sorted input).
/// Windows: collects PATH dirs once into Vec<PathBuf> so PATH is only split/parsed
///          once (O(P)) instead of once per shell candidate (O(P × S)).
#[tauri::command]
pub async fn get_shells() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let candidates: &[&str] = &["powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe"];

        // Collect PATH dirs once — O(P) split instead of O(P × S) re-parsing
        let path_dirs: Vec<std::path::PathBuf> = std::env::var("PATH")
            .map(|v| std::env::split_paths(&v).collect())
            .unwrap_or_default();

        let mut found: Vec<String> = candidates.iter().filter_map(|&name| {
            let p = std::path::Path::new(name);
            if p.is_absolute() {
                if p.exists() { Some(name.to_string()) } else { None }
            } else {
                // O(P) per shell, but path_dirs built once above
                path_dirs.iter().find_map(|dir| {
                    let full = dir.join(name);
                    if full.exists() { Some(full.to_string_lossy().into_owned()) } else { None }
                })
            }
        }).collect();

        if found.is_empty() { found.push("cmd.exe".to_string()); }
        found
    }

    #[cfg(not(target_os = "windows"))]
    {
        let default_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        match tokio::fs::read_to_string("/etc/shells").await {
            Ok(content) => {
                // HashSet dedup is O(n) and correct regardless of order.
                // Vec::dedup only removes *consecutive* duplicates — wrong on unsorted input.
                let mut seen = std::collections::HashSet::new();
                let mut shells: Vec<String> = std::iter::once(default_shell.clone())
                    .chain(
                        content.lines()
                            .map(|l| l.trim().to_string())
                            .filter(|l| !l.is_empty() && !l.starts_with('#') && l.starts_with('/'))
                    )
                    .filter(|s| seen.insert(s.clone()))
                    .collect();

                if shells.is_empty() { shells.push(default_shell); }
                shells
            }
            Err(_) => vec![default_shell],
        }
    }
}

/// Walk a workspace recursively and return all file paths relative to `root`.
///
/// Uses the `ignore` crate (same engine as ripgrep) with parallel walking:
///   - Respects .gitignore, .git/info/exclude, global gitignore
///   - Skips our SKIP_DIRS regardless of .gitignore (they're never useful)
///   - Bounded by `max_files` (default 100 000) so huge monorepos don't hang
///
/// This replaces the sequential JS tree walk (hundreds of async IPC calls) with
/// a single blocking call that returns everything at once — ~10-50× faster on
/// a typical project.
#[tauri::command]
pub async fn walk_dir(root: String, max_files: Option<usize>) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(&root);
    let limit = max_files.unwrap_or(100_000);

    tokio::task::spawn_blocking(move || {
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let count    = Arc::new(AtomicUsize::new(0));

        WalkBuilder::new(&root_path)
            .hidden(false)          // include dot-files (.env, .gitignore, etc.)
            .git_ignore(true)       // respect .gitignore
            .git_global(true)       // respect global gitignore
            .git_exclude(true)      // respect .git/info/exclude
            .follow_links(false)    // don't follow symlinks (avoid infinite loops)
            .build_parallel()
            .run(|| {
                let tx    = tx.clone();
                let root  = root_path.clone();
                let count = count.clone();
                Box::new(move |entry_result| {
                    if count.load(Ordering::Relaxed) >= limit {
                        return ignore::WalkState::Quit;
                    }

                    let entry = match entry_result {
                        Ok(e)  => e,
                        Err(_) => return ignore::WalkState::Continue,
                    };

                    // Skip heavy/useless dirs before descending into them
                    if let Some(name) = entry.path().file_name().and_then(|n| n.to_str()) {
                        if SKIP_DIRS.contains(&name)
                            && entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false)
                        {
                            return ignore::WalkState::Skip;
                        }
                    }

                    if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                        if let Ok(rel) = entry.path().strip_prefix(&root) {
                            if tx.send(rel.to_string_lossy().into_owned()).is_ok() {
                                count.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    }
                    ignore::WalkState::Continue
                })
            });

        // Drop the original sender so rx drains and terminates
        drop(tx);
        rx.into_iter().collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cwd() -> Result<String, String> {
    let mut path = std::env::current_dir().map_err(|e| e.to_string())?;
    if path.file_name().map(|n| n == "src-tauri").unwrap_or(false) {
        if let Some(parent) = path.parent() { path = parent.to_path_buf(); }
    }
    Ok(path.to_string_lossy().to_string())
}
