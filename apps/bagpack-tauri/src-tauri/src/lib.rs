use bagpack_core::{
    InventorySnapshot, PackageManager, PackageRecord, PackageStatus,
};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// Temporary inventory generator until real collectors are wired in.
fn demo_inventory() -> InventorySnapshot {
    let mut snapshot = InventorySnapshot::default();
    snapshot.set_generated_at(
        OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "2025-10-05T00:00:00Z".to_string()),
    );

    snapshot.push(PackageRecord {
        name: "wget".into(),
        current_version: "1.24.5".into(),
        latest_version: Some("1.24.6".into()),
        installed_at: Some("2024-09-17T08:22:00Z".into()),
        status: PackageStatus::Outdated,
        manager: PackageManager::Brew,
    });

    snapshot.push(PackageRecord {
        name: "typescript".into(),
        current_version: "5.5.2".into(),
        latest_version: Some("5.6.3".into()),
        installed_at: Some("2025-02-11T15:10:30Z".into()),
        status: PackageStatus::Current,
        manager: PackageManager::Npm,
    });

    snapshot.push(PackageRecord {
        name: "requests".into(),
        current_version: "2.32.3".into(),
        latest_version: None,
        installed_at: None,
        status: PackageStatus::Unknown,
        manager: PackageManager::Pip,
    });

    snapshot
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn get_inventory() -> InventorySnapshot {
    demo_inventory()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_inventory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
