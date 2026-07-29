/// One line of environment information, emitted by the front end right after
/// boot and printed to stdout.
///
/// `cross_origin_isolated` is the value that decides whether the game can run
/// at all: without it there is no SharedArrayBuffer and therefore no channel
/// between the simulation worker and the renderer. It depends on the COOP/COEP
/// headers in tauri.conf.json, which are easy to get right in the dev server
/// and wrong in the bundled app - so the app says out loud which one it got.
#[tauri::command]
fn startup_report(
    app_version: String,
    cross_origin_isolated: bool,
    shared_memory: bool,
    user_agent: String,
) {
    println!(
        "[iron-veins] startup version={} crossOriginIsolated={} sharedArrayBuffer={} ua={}",
        app_version, cross_origin_isolated, shared_memory, user_agent
    );
}

/// Boots the Tauri shell.
///
/// The game itself lives entirely in the web view: simulation, rendering and
/// storage are TypeScript. The Rust side provides the window, the application
/// data directory, the file dialogs and the installer - and the front end
/// reaches all of it through `src/platform/`, which is the only directory
/// allowed to import `@tauri-apps/*`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![startup_report])
        .run(tauri::generate_context!())
        .expect("Iron Veins failed to start");
}
