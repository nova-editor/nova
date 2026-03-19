#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nova_tauri_lib::run();
}
