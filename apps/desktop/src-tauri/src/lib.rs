use tauri::Manager;

/// Desktop shell for the Sonora web UI.
///
/// All Navidrome communication, playback and caching happen in the web layer
/// (shared with the browser build). The native side adds window-state
/// persistence and single-instance behaviour (launching Sonora again focuses
/// the running window instead of starting a second player), opening links in
/// the system browser and self-updates from the GitHub "Latest build" release.
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sonora");
}
