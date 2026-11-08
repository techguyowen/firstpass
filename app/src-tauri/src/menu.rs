//! Cross-platform native application menu.
//!
//! Menu clicks are forwarded to the frontend webview as `menu-action`,
//! `navigate-to`, and `open-shortcuts` window events.

use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, Menu, MenuEvent, MenuItemBuilder, Submenu, SubmenuBuilder,
};
use tauri::menu::MenuBuilder;
use tauri::{AppHandle, Emitter};

/// Build the full application menu for the current platform.
pub fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let mut builder = MenuBuilder::new(app);
    if cfg!(target_os = "macos") {
        builder = builder.item(&app_submenu(app)?);
    }
    builder = builder
        .item(&file_submenu(app)?)
        .item(&edit_submenu(app)?)
        .item(&view_submenu(app)?)
        .item(&photo_submenu(app)?);
    builder.build()
}

/// Forward menu clicks to the frontend webview as window events.
pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "settings" => {
            let _ = app.emit("navigate-to", "/settings");
        }
        "shortcuts" => {
            let _ = app.emit("open-shortcuts", ());
        }
        id => {
            let _ = app.emit("menu-action", id);
        }
    }
}

/// macOS application menu: About, Settings, Shortcuts, Quit.
fn app_submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let metadata = AboutMetadata {
        name: Some("FirstPass".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        copyright: Some("FirstPass".to_string()),
        ..Default::default()
    };
    let settings = MenuItemBuilder::new("Settings...")
        .id("settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let shortcuts = MenuItemBuilder::new("Keyboard Shortcuts...")
        .id("shortcuts")
        .build(app)?;
    let check_updates = MenuItemBuilder::new("Check for Updates...")
        .id("check-updates")
        .build(app)?;
    SubmenuBuilder::new(app, "FirstPass")
        .about_with_text("About FirstPass", Some(metadata))
        .separator()
        .item(&settings)
        .item(&shortcuts)
        .item(&check_updates)
        .separator()
        .quit_with_text("Quit FirstPass")
        .build()
}

fn file_submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let open = MenuItemBuilder::new("Open Folder...")
        .id("import-folder")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let export = MenuItemBuilder::new("Export...")
        .id("open-export")
        .accelerator("CmdOrCtrl+E")
        .build(app)?;
    let builder = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&export)
        .separator();
    if cfg!(target_os = "macos") {
        builder.close_window_with_text("Close Window").build()
    } else {
        // No app menu off macOS: keep Settings/Shortcuts/Quit reachable here.
        let settings = MenuItemBuilder::new("Settings...")
            .id("settings")
            .accelerator("CmdOrCtrl+,")
            .build(app)?;
        let shortcuts = MenuItemBuilder::new("Keyboard Shortcuts...")
            .id("shortcuts")
            .build(app)?;
        let check_updates = MenuItemBuilder::new("Check for Updates...")
            .id("check-updates")
            .build(app)?;
        builder
            .item(&settings)
            .item(&shortcuts)
            .item(&check_updates)
            .separator()
            .quit_with_text("Exit")
            .build()
    }
}

fn edit_submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .build()
}

fn view_submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let zoom_100 = MenuItemBuilder::new("Zoom 100%")
        .id("zoom-100")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let zoom_200 = MenuItemBuilder::new("Zoom 200%")
        .id("zoom-200")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let zoom_fit = MenuItemBuilder::new("Fit Screen")
        .id("zoom-fit")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let filmstrip = MenuItemBuilder::new("Toggle Filmstrip")
        .id("toggle-filmstrip")
        .build(app)?;
    let lock_zoom = CheckMenuItemBuilder::new("Lock Zoom Between Photos")
        .id("toggle-lock-zoom")
        .checked(false)
        .build(app)?;
    let lock_turn = CheckMenuItemBuilder::new("Lock Turn")
        .id("toggle-lock-turn")
        .checked(false)
        .build(app)?;
    SubmenuBuilder::new(app, "View")
        .item(&zoom_100)
        .item(&zoom_200)
        .item(&zoom_fit)
        .separator()
        .item(&filmstrip)
        .separator()
        .item(&lock_zoom)
        .item(&lock_turn)
        .build()
}

fn photo_submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let accept = MenuItemBuilder::new("Accept")
        .id("rate-accept")
        .accelerator("A")
        .build(app)?;
    let reject = MenuItemBuilder::new("Reject")
        .id("rate-reject")
        .accelerator("R")
        .build(app)?;
    let reset = MenuItemBuilder::new("Reset / Unflag")
        .id("rate-pending")
        .accelerator("U")
        .build(app)?;
    let tag = MenuItemBuilder::new("Tag / Flag")
        .id("toggle-tag")
        .accelerator("\\")
        .build(app)?;
    SubmenuBuilder::new(app, "Photo")
        .item(&accept)
        .item(&reject)
        .item(&reset)
        .item(&tag)
        .build()
}
