use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, WindowEvent,
};
use tauri_plugin_window_state::StateFlags;

/// Closing the main window hides it to the tray (music keeps playing) instead of quitting.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

/// The tray menu's Play/Pause entry, relabelled as playback changes.
#[cfg(desktop)]
struct TrayPlayItem(MenuItem<tauri::Wry>);

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

/// Called by the web layer when the song or play state changes: tooltip and Play/Pause label.
#[tauri::command]
fn set_tray_state(app: tauri::AppHandle, title: Option<String>, playing: bool) {
    #[cfg(desktop)]
    {
        if let Some(tray) = app.tray_by_id("main") {
            let tip = match title {
                Some(t) if !t.is_empty() => format!("Sonora — {t}"),
                _ => "Sonora".to_string(),
            };
            let _ = tray.set_tooltip(Some(tip));
        }
        if let Some(item) = app.try_state::<TrayPlayItem>() {
            let _ = item.0.set_text(if playing { "Pause" } else { "Play" });
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, title, playing);
}

#[cfg(desktop)]
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tray icon: left click shows Sonora; the menu controls playback (handled by the web layer
/// through the "tray" event), shows the window or quits.
#[cfg(desktop)]
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Sonora", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Sonora", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&play, &previous, &next, &separator, &show, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Sonora")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            action => {
                let _ = app.emit("tray", action.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayPlayItem(play));
    Ok(())
}

/// Desktop shell for the Sonora web UI.
///
/// All Navidrome communication, playback and caching happen in the web layer
/// (shared with the browser build). The native side adds window-state
/// persistence and single-instance behaviour (launching Sonora again focuses
/// the running window instead of starting a second player), opening links in
/// the system browser, self-updates from the GitHub "Latest build" release and
/// a tray icon (closing the window can keep the music playing in the tray).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Neither a window hidden in the tray nor the frameless mini player should come back that way.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![set_close_to_tray, set_tray_state])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                build_tray(app)?;
            }
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            #[cfg(not(desktop))]
            let _ = (window, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running Sonora");
}
