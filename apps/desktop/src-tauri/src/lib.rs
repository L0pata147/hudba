use tauri::Manager;

/// Desktop shell for the Sonora web UI.
///
/// All Navidrome communication, playback and caching happen in the web layer
/// (shared with the browser build). The native side adds window-state
/// persistence and single-instance behaviour: launching Sonora again focuses
/// the running window instead of starting a second player.
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
        .run(tauri::generate_context!())
        .expect("error while running Sonora");
}
