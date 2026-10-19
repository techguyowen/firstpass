//! Tauri IPC commands exposed to the frontend webview.

use tauri::State;

use crate::AppState;

/// Return the active backend session token (`FIRSTPASS_API_KEY`).
#[tauri::command]
pub fn get_api_secret(state: State<'_, AppState>) -> String {
    state.token()
}

/// Reveal `path` in the native file manager (Finder / Explorer / Files).
#[allow(non_snake_case)]
#[tauri::command]
pub fn show_itemIn_folder(path: String) -> bool {
    if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,\"{path}\""))
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    } else {
        show_in_folder_linux(&path)
    }
}

/// Return the path of the application log file (`~/.firstpass/app.log`).
#[tauri::command]
pub fn get_log_path() -> String {
    crate::sidecar::log_file_path()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|| "app.log".to_string())
}

/// Receive active UI menu toggles (e.g. lockZoom, lockTurn) from the frontend.
#[tauri::command]
pub fn update_menu_state(menu: State<'_, AppState>, state: serde_json::Value) {
    menu.set_menu_state(state);
}

/// Linux: reveal via the FileManager1 D-Bus API, else xdg-open the parent dir.
fn show_in_folder_linux(path: &str) -> bool {
    let absolute =
        std::fs::canonicalize(path).unwrap_or_else(|_| std::path::PathBuf::from(path));
    let uri = format!("file://{}", absolute.display());
    let via_dbus = std::process::Command::new("dbus-send")
        .args([
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            &format!("array:string:{uri}"),
            "string:",
        ])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if via_dbus {
        return true;
    }
    match absolute.parent() {
        Some(parent) => std::process::Command::new("xdg-open")
            .arg(parent)
            .status()
            .map(|status| status.success())
            .unwrap_or(false),
        None => false,
    }
}
