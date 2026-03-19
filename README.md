# の nova

A code editor built on Tauri 2, React 19, and CodeMirror 6. Native binary, no Electron, no Chromium.

[![Release](https://img.shields.io/github/v/release/mugiwaraluffy56/nova-editor?style=flat-square&color=0f0f0f&labelColor=1a1a1a)](https://github.com/mugiwaraluffy56/nova-editor/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/mugiwaraluffy56/nova-editor/release.yml?style=flat-square&label=build&color=0f0f0f&labelColor=1a1a1a)](https://github.com/mugiwaraluffy56/nova-editor/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-MIT-0f0f0f?style=flat-square&labelColor=1a1a1a)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-0f0f0f?style=flat-square&labelColor=1a1a1a)](https://nova-code-editor.vercel.app)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri%202-0f0f0f?style=flat-square&labelColor=1a1a1a)](https://tauri.app)

[Website](https://nova-code-editor.vercel.app) [Manual](https://nova-code-editor.vercel.app/manual.html) [Releases](https://github.com/mugiwaraluffy56/nova-editor/releases)

---

## Features

- Multi-tab editor with syntax highlighting for TypeScript, JavaScript, Rust, Python, Go, JSON, Markdown, HTML, CSS, SQL, Java, and C++
- Vim mode (normal / insert / visual) — toggled per-tab, mixes with normal editing across open files
- PTY-backed terminal with multi-session support — sessions persist when the panel is hidden
- Git panel — stage, unstage, diff, commit, and branch management without leaving the editor
- Fuzzy file finder (`Ctrl/Cmd+P`) and command palette (`Ctrl/Cmd+Shift+P`)
- Markdown preview (split pane, live)
- Spotify player integration
- Autosave with debounce
- Ten dark themes, applied live without view reload
- Custom background image with opacity, blur, and tint controls
- Preset system — save and restore full editor configurations
- ~80 MB RAM at idle

## Installation

Download the latest release from the [releases page](https://nova-code-editor.vercel.app).

| Platform | Package |
|----------|---------|
| macOS    | `.dmg` (universal — Apple Silicon + Intel) |
| Windows  | `_x64-setup.exe` (NSIS installer) |
| Linux    | `.AppImage` or `.deb` |

**macOS note:** the binary is not notarized. On first launch, run:

```sh
xattr -cr /Applications/nova.app
```

**Windows note:** SmartScreen may warn about an unsigned binary. Click *More info → Run anyway*.

## Building from source

**Prerequisites:** Rust (stable), Node.js 20+, platform system deps

```sh
# macOS — no extra deps needed
# Linux
sudo apt-get install libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

git clone https://github.com/mugiwaraluffy56/nova-editor.git
cd nova-editor
npm ci
npm run tauri dev
```

To produce a release build:

```sh
npm run tauri build
```

For a macOS universal binary:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2 (Rust) |
| UI | React 19, TypeScript, Vite |
| Editor | CodeMirror 6 |
| Terminal | xterm.js + portable-pty (Rust) |
| Git | git2-rs |
| Styling | Tailwind CSS |

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Fuzzy finder | `Cmd+P` | `Ctrl+P` |
| Command palette | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Toggle terminal | `Cmd+J` | `Ctrl+J` |
| Toggle git panel | `Cmd+G` | `Ctrl+G` |
| Toggle vim mode | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Open file | `Cmd+O` | `Ctrl+O` |
| Open folder | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| New window | `Cmd+Shift+N` | `Ctrl+Shift+N` |
| Settings | `Cmd+,` | `Ctrl+,` |

Full reference: [manual](https://nova-code-editor.vercel.app/manual.html#shortcuts).

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

The near-term focus is LSP integration, inline git diff gutters, split pane editing, and workspace search. Phase 2 targets a full native rewrite on GPUI (Zed's GPU UI framework) to eliminate the WebView entirely.

## License

MIT
