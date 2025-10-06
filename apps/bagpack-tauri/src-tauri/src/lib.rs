use bagpack_core::{collect_inventory, CollectionSummary};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn get_inventory() -> CollectionSummary {
    collect_inventory()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_inventory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
