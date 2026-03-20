mod commands;

use commands::{claude, files, git, pty, spotify, updater};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, EventTarget, Manager};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Holds the path passed as a CLI argument (`nova /some/folder`).
/// Read once by the frontend on startup via `get_startup_path`.
struct StartupPath(Mutex<Option<String>>);

#[tauri::command]
fn get_startup_path(state: tauri::State<'_, StartupPath>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Tracks the label of the most recently focused window.
/// Updated by on_window_event(Focused(true)) so it stays valid even when the
/// macOS menu bar temporarily steals focus before the menu event fires.
struct FocusState(Mutex<String>);

impl FocusState {
    fn new(initial: &str) -> Self { Self(Mutex::new(initial.to_string())) }
    fn set(&self, label: String)  { *self.0.lock().unwrap() = label; }
    fn get(&self) -> String       { self.0.lock().unwrap().clone() }
}

fn register_focus_listener(win: &tauri::WebviewWindow, app: tauri::AppHandle) {
    let label = win.label().to_string();
    win.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Focused(true)) {
            if let Some(s) = app.try_state::<FocusState>() {
                s.set(label.clone());
            }
        }
    });
}

#[tauri::command]
fn new_window(app: tauri::AppHandle) {
    let id = format!("nova-{}", WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed));
    if let Ok(win) = tauri::WebviewWindowBuilder::new(&app, &id, tauri::WebviewUrl::App("/".into()))
        .title("nova")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .build()
    {
        // Immediately claim focus so menu events target this window,
        // before the Focused(true) event has a chance to fire.
        if let Some(focus_state) = app.try_state::<FocusState>() {
            focus_state.set(id.clone());
        }
        register_focus_listener(&win, app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(pty::PtyState::new())
        .manage(updater::PendingUpdate::new())
        .manage(FocusState::new("main"))
        .manage({
            // Pick up `nova /path/to/folder` from the CLI.
            // Skip the binary name (arg 0) and any flags starting with `-`.
            let path = std::env::args().skip(1)
                .find(|a| !a.starts_with('-'))
                .and_then(|a| {
                    let p = std::path::Path::new(&a);
                    if p.exists() { Some(p.canonicalize().unwrap_or_else(|_| p.to_path_buf())
                        .to_string_lossy().into_owned()) }
                    else { None }
                });
            StartupPath(Mutex::new(path))
        })
        .setup(|app| {
            // Install `nova` CLI shim to /usr/local/bin/nova on every launch.
            // Runs in a background thread — silent, no-op if already up to date.
            claude::install_cli_silently();

            let h = app.handle();

            // Track focus on the initial "main" window so menu events know
            // where to send when the macOS menu bar temporarily steals focus.
            if let Some(main_win) = app.get_webview_window("main") {
                register_focus_listener(&main_win, h.clone());
            }

            // ── File ──────────────────────────────────────────────────────────
            let new_file    = MenuItem::with_id(h, "new_file",    "New File",       true, Some("CmdOrCtrl+N"))?;
            let open_file   = MenuItem::with_id(h, "open_file",   "Open File…",     true, Some("CmdOrCtrl+O"))?;
            let open_folder = MenuItem::with_id(h, "open_folder", "Open Folder…",   true, Some("CmdOrCtrl+Shift+O"))?;
            let save        = MenuItem::with_id(h, "save",        "Save",           true, Some("CmdOrCtrl+S"))?;
            let close_tab   = MenuItem::with_id(h, "close_tab",   "Close Tab",      true, Some("CmdOrCtrl+W"))?;
            let new_win     = MenuItem::with_id(h, "new_window",  "New Window",     true, Some("CmdOrCtrl+Shift+N"))?;
            let quit        = PredefinedMenuItem::quit(h, Some("Quit Nova"))?;

            let file_menu = Submenu::with_items(h, "File", true, &[
                &new_file,
                &PredefinedMenuItem::separator(h)?,
                &open_file,
                &open_folder,
                &PredefinedMenuItem::separator(h)?,
                &save,
                &PredefinedMenuItem::separator(h)?,
                &close_tab,
                &new_win,
                &PredefinedMenuItem::separator(h)?,
                &quit,
            ])?;

            // ── Edit ─────────────────────────────────────────────────────────
            let edit_menu = Submenu::with_items(h, "Edit", true, &[
                &PredefinedMenuItem::undo(h, Some("Undo"))?,
                &PredefinedMenuItem::redo(h, Some("Redo"))?,
                &PredefinedMenuItem::separator(h)?,
                &PredefinedMenuItem::cut(h, Some("Cut"))?,
                &PredefinedMenuItem::copy(h, Some("Copy"))?,
                &PredefinedMenuItem::paste(h, Some("Paste"))?,
                &PredefinedMenuItem::select_all(h, Some("Select All"))?,
            ])?;

            // ── Selection ────────────────────────────────────────────────────
            let sel_line    = MenuItem::with_id(h, "sel_line",    "Select Line",        true, Some("CmdOrCtrl+L"))?;
            let sel_all     = MenuItem::with_id(h, "sel_all",     "Select All",         true, Some("CmdOrCtrl+A"))?;

            let sel_menu = Submenu::with_items(h, "Selection", true, &[
                &sel_all,
                &sel_line,
            ])?;

            // ── View ─────────────────────────────────────────────────────────
            let toggle_tree     = MenuItem::with_id(h, "toggle_tree",     "Toggle File Tree",  true, Some("CmdOrCtrl+B"))?;
            let toggle_terminal = MenuItem::with_id(h, "toggle_terminal", "Toggle Terminal",   true, Some("CmdOrCtrl+J"))?;
            let toggle_git      = MenuItem::with_id(h, "toggle_git",      "Toggle Git Panel",  true, Some("CmdOrCtrl+G"))?;
            let toggle_settings = MenuItem::with_id(h, "toggle_settings", "Settings",          true, Some("CmdOrCtrl+,"))?;
            let fullscreen      = PredefinedMenuItem::fullscreen(h, Some("Enter Full Screen"))?;

            let view_menu = Submenu::with_items(h, "View", true, &[
                &toggle_tree,
                &toggle_terminal,
                &toggle_git,
                &PredefinedMenuItem::separator(h)?,
                &toggle_settings,
                &PredefinedMenuItem::separator(h)?,
                &fullscreen,
            ])?;

            // ── Go ───────────────────────────────────────────────────────────
            let go_file    = MenuItem::with_id(h, "go_file",    "Go to File…",          true, Some("CmdOrCtrl+P"))?;
            let go_palette = MenuItem::with_id(h, "go_palette", "Command Palette…",     true, Some("CmdOrCtrl+Shift+P"))?;

            let go_menu = Submenu::with_items(h, "Go", true, &[
                &go_file,
                &go_palette,
            ])?;

            // ── Window ───────────────────────────────────────────────────────
            let window_menu = Submenu::with_items(h, "Window", true, &[
                &MenuItem::with_id(h, "new_window_w", "New Window", true, Some("CmdOrCtrl+Shift+N"))?,
                &PredefinedMenuItem::separator(h)?,
                &PredefinedMenuItem::minimize(h, Some("Minimize"))?,
                &PredefinedMenuItem::maximize(h, Some("Zoom"))?,
            ])?;

            // ── Help ─────────────────────────────────────────────────────────
            let help_shortcuts = MenuItem::with_id(h, "help_shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+H"))?;

            let help_menu = Submenu::with_items(h, "Help", true, &[
                &help_shortcuts,
            ])?;

            // ── Assemble ─────────────────────────────────────────────────────
            let menu = Menu::with_items(h, &[
                &file_menu,
                &edit_menu,
                &sel_menu,
                &view_menu,
                &go_menu,
                &window_menu,
                &help_menu,
            ])?;
            app.set_menu(menu)?;

            // Forward menu events only to the most recently focused window.
            // Using emit_to(EventTarget::WebviewWindow) instead of emit() (broadcast)
            // ensures that "Open Folder" and other actions act on the correct window.
            // FocusState is updated by on_window_event(Focused(true)) registered on
            // each window, which persists through the macOS menu-bar focus steal.
            app.on_menu_event(|app_handle, event| {
                let label = app_handle
                    .try_state::<FocusState>()
                    .map(|s| s.get())
                    .unwrap_or_else(|| "main".to_string());

                let emit = |name: &str| {
                    app_handle.emit_to(
                        EventTarget::WebviewWindow { label: label.clone() },
                        name,
                        &(),
                    ).ok();
                };

                match event.id().as_ref() {
                    "new_file"        => emit("menu://new-file"),
                    "open_file"       => emit("menu://open-file"),
                    "open_folder"     => emit("menu://open-folder"),
                    "save"            => emit("menu://save"),
                    "close_tab"       => emit("menu://close-tab"),
                    "new_window"      => emit("menu://new-window"),
                    "new_window_w"    => emit("menu://new-window"),
                    "sel_line"        => emit("menu://select-line"),
                    "sel_all"         => emit("menu://select-all"),
                    "toggle_tree"     => emit("menu://toggle-tree"),
                    "toggle_terminal" => emit("menu://toggle-terminal"),
                    "toggle_git"      => emit("menu://toggle-git"),
                    "toggle_settings" => emit("menu://toggle-settings"),
                    "go_file"         => emit("menu://go-file"),
                    "go_palette"      => emit("menu://go-palette"),
                    "help_shortcuts"  => emit("menu://help-shortcuts"),
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Startup
            get_startup_path,
            new_window,
            // File system
            files::read_file,
            files::read_file_base64,
            files::write_file,
            files::list_dir,
            files::walk_dir,
            files::file_exists,
            files::create_dir,
            files::delete_file,
            files::rename_path,
            files::get_cwd,
            files::get_shells,
            // Git — core
            git::git_status,
            git::git_branch,
            git::git_branches,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_diff,
            git::git_log,
            git::git_checkout,
            git::git_create_branch,
            git::git_state,
            git::git_discard,
            // Git — enhanced
            git::git_delete_branch,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_stash_list,
            git::git_stash_push,
            git::git_stash_pop,
            git::git_stash_drop,
            git::git_commit_amend,
            git::git_commit_files,
            git::git_ahead_behind,
            git::git_last_commit_message,
            git::git_graph,
            // PTY / Terminal
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            // Claude / AI providers
            claude::find_claude_path,
            claude::find_gemini_path,
            claude::find_codex_path,
            claude::claude_api_chat,
            claude::claude_cli_chat,
            claude::read_claude_stats,
            // Spotify
            spotify::spotify_osascript,
            spotify::spotify_open_url,
            // Updater
            updater::get_app_version,
            updater::check_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error running nova");
}
