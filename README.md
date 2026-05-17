# の nova

A code editor built on Tauri 2, React 19, and CodeMirror 6. Native binary, no Electron, no Chromium.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square)](https://nova-code-editor.vercel.app)
[![Tauri](https://img.shields.io/badge/tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/rust-stable-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)

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

### macOS First Launch Warning

The macOS build is currently unsigned and not notarized, so Gatekeeper may block the app on first launch.

If Nova does not open:

1. Move `nova.app` to the `/Applications` folder
2. Open Terminal
3. Run:

```sh
xattr -dr com.apple.quarantine /Applications/nova.app
```

4. Launch Nova again

This removes the quarantine attributes added by macOS Gatekeeper.

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
### Contributor setup notes

**Verify prerequisites before cloning**

| Tool | Minimum | Check |
|------|---------|-------|
| Rust (stable) | 1.77+ | `rustc --version` |
| Node.js | 20+ | `node --version` |
| Tauri CLI | 2.x | `npx tauri --version` |

**Windows — move the project out of OneDrive**

Cargo writes thousands of small files to `target/` during compilation.
OneDrive locks these files mid-build and causes:

> ⚠️ `Access is denied. (os error 5)`

Clone or move the project to a plain path like `C:\dev\nova`.

**Icons — required before first build**

`src-tauri/icons/` is not committed to the repo. On first clone, the build will fail with:

> ⚠️ `` `icons/icon.ico` not found; required for generating a Windows Resource file ``

Generate them once from any square PNG:

```bash
npx tauri icon "your-image.png"
```

**Linux — additional packages**

Depending on your distro version, the `apt-get` block above may also need:

```bash
sudo apt-get install build-essential libxdo-dev libgtk-3-dev
```

**Dependencies**

Always use `npm ci` (not `npm install`) to install from the lockfile exactly.
On Windows, to reset `node_modules`:

```bash
Remove-Item -Recurse -Force node_modules
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
