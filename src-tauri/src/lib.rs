/// Boots the Tauri shell.
///
/// The game itself lives entirely in the web view: simulation, rendering and
/// storage are TypeScript. The Rust side only provides the window, the file
/// dialogs and the installer, which is why there are no commands registered
/// here yet - anything the front end needs will be added behind
/// `src/platform/Platform.ts`.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Iron Veins failed to start");
}
