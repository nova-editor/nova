mod commands;

use commands::{files, git, pty, spotify, updater};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

#[tauri::command]
fn new_window(app: tauri::AppHandle) {
    let id = format!("nova-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_millis());
    let _ = tauri::WebviewWindowBuilder::new(&app, &id, tauri::WebviewUrl::App("/".into()))
        .title("nova")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .build();
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
        .setup(|app| {
            let h = app.handle();

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

            // Forward menu events to the webview as Tauri events
            app.on_menu_event(|app_handle, event| {
                match event.id().as_ref() {
                    "new_file"        => { app_handle.emit("menu://new-file",        ()).ok(); }
                    "open_file"       => { app_handle.emit("menu://open-file",       ()).ok(); }
                    "open_folder"     => { app_handle.emit("menu://open-folder",     ()).ok(); }
                    "save"            => { app_handle.emit("menu://save",            ()).ok(); }
                    "close_tab"       => { app_handle.emit("menu://close-tab",       ()).ok(); }
                    "new_window"      => { app_handle.emit("menu://new-window",      ()).ok(); }
                    "new_window_w"    => { app_handle.emit("menu://new-window",      ()).ok(); }
                    "sel_line"        => { app_handle.emit("menu://select-line",     ()).ok(); }
                    "sel_all"         => { app_handle.emit("menu://select-all",      ()).ok(); }
                    "toggle_tree"     => { app_handle.emit("menu://toggle-tree",     ()).ok(); }
                    "toggle_terminal" => { app_handle.emit("menu://toggle-terminal", ()).ok(); }
                    "toggle_git"      => { app_handle.emit("menu://toggle-git",      ()).ok(); }
                    "toggle_settings" => { app_handle.emit("menu://toggle-settings", ()).ok(); }
                    "go_file"         => { app_handle.emit("menu://go-file",         ()).ok(); }
                    "go_palette"      => { app_handle.emit("menu://go-palette",      ()).ok(); }
                    "help_shortcuts"  => { app_handle.emit("menu://help-shortcuts",  ()).ok(); }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // File system
            files::read_file,
            files::read_file_base64,
            files::write_file,
            files::list_dir,
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
            // Window
            new_window,
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
