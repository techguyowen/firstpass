//! FirstPass desktop shell (Tauri v2): backend sidecar supervisor, IPC
//! commands, and the native application menu.

mod commands;
mod menu;
mod sidecar;

use std::sync::Mutex;

use tauri::Manager;

/// Shared application state: session token, UI menu toggles, sidecar handle.
pub struct AppState {
    token: String,
    /// Latest UI menu toggles pushed by the frontend (lockZoom, lockTurn...).
    #[allow(dead_code)]
    menu_state: Mutex<serde_json::Value>,
    child: sidecar::SharedChild,
}

impl AppState {
    fn new(token: String, child: sidecar::SharedChild) -> Self {
        Self {
            token,
            menu_state: Mutex::new(serde_json::Value::Null),
            child,
        }
    }

    pub fn token(&self) -> String {
        self.token.clone()
    }

    pub fn set_menu_state(&self, state: serde_json::Value) {
        if let Ok(mut guard) = self.menu_state.lock() {
            *guard = state;
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = sidecar::generate_token();
    if let Err(err) = sidecar::persist_token(&token) {
        eprintln!("[firstpass] failed to persist session token: {err}");
    }
    let child = sidecar::SharedChild::default();
    let state = AppState::new(token.clone(), child.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .setup(move |app| {
            app.set_menu(menu::build_app_menu(app.handle())?)?;
            let resource_dir = app.path().resource_dir().ok();
            match sidecar::spawn_backend(&token, resource_dir.as_deref()) {
                Ok(process) => {
                    if let Ok(mut guard) = child.lock() {
                        *guard = Some(process);
                    }
                }
                Err(err) => {
                    eprintln!("[firstpass] failed to spawn backend sidecar: {err}");
                }
            }
            app.on_menu_event(menu::handle_menu_event);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_secret,
            commands::show_item_in_folder,
            commands::get_log_path,
            commands::update_menu_state
        ])
        .build(tauri::generate_context!())
        .expect("failed to build FirstPass application")
        .run(move |app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                let state = app.state::<AppState>();
                sidecar::shutdown_shared(&state.child);
            }
        });
}
