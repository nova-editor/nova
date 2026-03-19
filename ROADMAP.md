# nova — Roadmap

---

## Phase 1 — Foundation (current, Tauri 2 + React)

Core editor built on Tauri 2 (Rust backend) + React 19 + CodeMirror 6.
Target: a usable daily-driver editor at ~80 MB RAM.

### Done
- [x] Multi-tab editor (CodeMirror 6)
- [x] Syntax highlighting — TS, JS, Rust, Python, Go, JSON, Markdown, HTML, CSS, SQL, Java, C++
- [x] Vim mode (normal / insert)
- [x] Relative line numbers
- [x] Markdown preview (split pane)
- [x] Multi-session terminal (PTY, per-session Arc<Mutex>)
- [x] File tree with vscode-style icons (full icon set, no tree-shaking)
- [x] Git panel — branch, status, stage/unstage, commit, checkout, branch list
- [x] Fuzzy file opener (Cmd+P)
- [x] Command palette (Cmd+Shift+P)
- [x] Autosave with debounce
- [x] Settings panel (font, tab size, wrap, vim, autocomplete, bracket match)
- [x] macOS menu bar integration
- [x] New window (Cmd+Shift+N)
- [x] New terminal session (Cmd+T)
- [x] macOS Big Sur squircle app icon (の)
- [x] Rename ted → nova throughout

### Performance (7 fixes shipped)
- [x] File content out of Zustand → `tabContentMap` (zero re-renders on keystrokes)
- [x] CodeMirror Compartments — settings reconfigure without view rebuild
- [x] PTY per-session Arc<Mutex> — global lock released before I/O
- [x] PTY output batching — 16 KB reads, flush at 32 KB or 8 ms
- [x] `tokio::fs` — async file I/O, no worker thread starvation
- [x] `git_state` — single `open_repo` for branch + status + branches
- [x] Per-node `expandedDirs` subscription — O(1) re-renders on dir toggle

### Near-term (still on Tauri 2)
- [ ] LSP integration (language server protocol — completions, go-to-def, hover docs)
- [ ] Inline git diff gutter (per-line add/modify/delete markers)
- [ ] Split pane editor (horizontal / vertical)
- [ ] Find & replace panel (global, regex)
- [ ] Workspace search (grep across files)
- [ ] File watcher — auto-reload externally changed files
- [ ] Minimap
- [ ] Lazy-load vscode-icons (reduce JS heap by ~5–8 MB)

---

## Phase 2 — Native (GPUI + pure Rust)

Eliminate the WebView entirely. Target: ~45–60 MB RAM, <100 ms startup, CoreText rendering.

### Why
| | Phase 1 (WebView) | Phase 2 (native) |
|---|---|---|
| RAM | ~80 MB | ~45–60 MB |
| Startup | ~400 ms | ~80 ms |
| Font rendering | WebKit (good) | CoreText / DirectWrite (excellent) |
| Scroll on large files | CodeMirror virtual (good) | GPU rasterised (excellent) |
| Cross-platform cost | Low (WebView everywhere) | High (per-OS GPU API) |

### Stack
```
GPUI  (Zed's Apache 2.0 GPU UI framework)
  ├── Text editor engine    — tree-sitter grammars, incremental parse
  ├── Text shaping          — cosmic-text (BiDi, ligatures, font fallback)
  ├── Terminal renderer     — vte (VT escape parsing) + portable-pty (already have it)
  ├── File tree             — GPUI list view
  ├── Git panel             — nova-git crate (already have it)
  └── File system           — nova-core / tokio::fs (already have it)
```

### What gets thrown away
- React, Vite, TypeScript frontend
- CodeMirror 6
- xterm.js
- WebView / Tauri
- All npm dependencies

### What gets kept (Rust crates)
- `nova-git` — git operations (git2)
- `nova-core` — file I/O
- `portable-pty` — PTY spawning
- Tree-sitter grammars

### Milestones
- [ ] GPUI prototype — window opens, text renders, cursor moves
- [ ] Basic text editor — insert/delete, undo/redo, syntax highlighting
- [ ] File tree + tab bar
- [ ] Terminal emulator (vte grid renderer in GPUI)
- [ ] Git panel port
- [ ] Vim mode (modal input handling)
- [ ] Settings / theming
- [ ] Feature parity with Phase 1
- [ ] macOS release build — measure actual RAM vs target

### Estimated effort
Solo: 6–18 months. GPUI is the only viable shortcut — building on raw wgpu/Skia from scratch would be 2–3 years.

---

## Non-goals (both phases)
- AI features / copilot integration
- Plugin system (keep it simple)
- Windows / Linux support before macOS is solid
- Electron (never)
