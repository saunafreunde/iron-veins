// Release builds must not open a console window next to the game window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    iron_veins_lib::run()
}
