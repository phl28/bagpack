use bagpack_core::{collect_inventory, CollectionSummary, InventorySnapshot, PackageManager, PackageRecord, PackageStatus};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn get_inventory() -> CollectionSummary {
    let mut base = match tauri::async_runtime::spawn_blocking(|| collect_inventory()).await {
        Ok(summary) => summary,
        Err(_) => collect_inventory(),
    };

    // Merge custom packages into snapshot
    if let Ok(mut customs) = tauri::async_runtime::spawn_blocking(|| collect_custom_packages()).await {
        if let Ok(list) = customs {
            base.snapshot.packages.extend(list);
        }
    }

    base
}

#[tauri::command]
async fn upgrade_package(manager: String, name: String) -> Result<CollectionSummary, String> {
    let mgr = manager.clone();
    let name_clone = name.clone();
    let join = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        match mgr.as_str() {
            "brew" => run_cmd(&["brew", "upgrade", &name_clone])?,
            "npm" => run_cmd(&["npm", "update", "-g", &name_clone])?,
            "pip" => run_cmd(&["pip", "install", "-U", &name_clone])?,
            "custom" => upgrade_custom_by_name(&name_clone)?,
            _ => return Err(format!("unknown manager: {}", mgr)),
        }
        Ok(())
    });

    // propagate background task errors
    let res = join.await.map_err(|e| e.to_string())?;
    res?;

    let refreshed = tauri::async_runtime::spawn_blocking(|| collect_inventory())
        .await
        .map_err(|e| e.to_string())?;
    Ok(refreshed)
}

#[tauri::command]
async fn upgrade_all(manager: String) -> Result<CollectionSummary, String> {
    let mgr = manager.clone();
    let join = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        match mgr.as_str() {
            "brew" => {
                run_cmd(&["brew", "upgrade"])?;
            }
            "npm" => {
                run_cmd(&["npm", "update", "-g"])?;
            }
            "pip" => {
                upgrade_all_pip()?;
            }
            "custom" => {
                upgrade_all_custom()?;
            }
            _ => return Err(format!("unknown manager: {}", mgr)),
        }
        Ok(())
    });

    let res = join.await.map_err(|e| e.to_string())?;
    res?;

    let refreshed = tauri::async_runtime::spawn_blocking(|| collect_inventory())
        .await
        .map_err(|e| e.to_string())?;
    Ok(refreshed)
}

fn run_cmd(parts: &[&str]) -> Result<(), String> {
    if parts.is_empty() {
        return Err("empty command".into());
    }
    let (program, args) = parts.split_first().unwrap();
    let status = Command::new(program).args(args).status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{} exited with status {:?}", parts.join(" "), status.code()))
    }
}

#[derive(Debug, Deserialize)]
struct PipOutdatedItem {
    name: String,
}

fn upgrade_all_pip() -> Result<(), String> {
    let output = Command::new("pip")
        .args(["list", "--outdated", "--format=json"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "pip list --outdated failed with status {:?}",
            output.status.code()
        ));
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    if stdout.trim().is_empty() {
        return Ok(());
    }
    let items: Vec<PipOutdatedItem> = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
    for item in items {
        let _ = run_cmd(&["pip", "install", "-U", &item.name])?;
    }
    Ok(())
}

// ---------------- Custom packages (Others) ----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CustomEntry {
    id: String,
    name: String,
    install_cmd: String,
    update_cmd: String,
    #[serde(default)]
    version_cmd: Option<String>,
    #[serde(default)]
    version_regex: Option<String>,
    #[serde(default)]
    last_updated_at: Option<String>,
    #[serde(default)]
    notes: Option<String>,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn custom_store_path() -> Result<PathBuf, String> {
    let mut base = home_dir().ok_or_else(|| "HOME not set".to_string())?;
    base.push(".bagpack");
    if !base.exists() {
        fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    }
    base.push("custom-packages.json");
    Ok(base)
}

fn load_custom_entries() -> Result<Vec<CustomEntry>, String> {
    let path = custom_store_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_custom_entries(entries: &[CustomEntry]) -> Result<(), String> {
    let path = custom_store_path()?;
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(path).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())
}

fn parse_version(output: &str, re: &Option<String>) -> Option<String> {
    if let Some(pattern) = re {
        if let Ok(rx) = Regex::new(pattern) {
            if let Some(c) = rx.captures(output) {
                if let Some(m) = c.get(1).or_else(|| c.get(0)) {
                    return Some(m.as_str().trim().to_string());
                }
            }
        }
    }
    // Fallback: first non-empty line
    output.lines().find(|l| !l.trim().is_empty()).map(|s| s.trim().to_string())
}

#[derive(Debug)]
struct ShResult { stdout: String, stderr: String, status: std::process::ExitStatus }

fn run_shell(cmd: &str) -> Result<ShResult, String> {
    let output = Command::new("sh").arg("-lc").arg(cmd).output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let stderr = String::from_utf8(output.stderr).map_err(|e| e.to_string())?;
    Ok(ShResult { stdout, stderr, status: output.status })
}

fn collect_custom_packages() -> Result<Vec<PackageRecord>, String> {
    let entries = load_custom_entries()?;
    let mut out = Vec::new();
    for e in entries {
        let mut current = "-".to_string();
        if let Some(cmd) = &e.version_cmd {
            if let Ok(res) = run_shell(cmd) {
                if res.status.success() {
                    if let Some(v) = parse_version(&res.stdout, &e.version_regex) {
                        current = v;
                    }
                }
            }
        }

        out.push(PackageRecord {
            name: e.name.clone(),
            current_version: current,
            latest_version: None,
            installed_at: e.last_updated_at.clone(),
            status: PackageStatus::Unknown,
            manager: PackageManager::Custom,
        });
    }
    Ok(out)
}

fn upgrade_custom_by_name(name: &str) -> Result<(), String> {
    let mut entries = load_custom_entries()?;
    for e in entries.iter_mut() {
        if e.name == name {
            let res = run_shell(&e.update_cmd)?;
            if !res.status.success() {
                return Err(format!("update failed: {}", res.stderr));
            }
            if let Ok(ts) = time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339) {
                e.last_updated_at = Some(ts);
            }
            save_custom_entries(&entries)?;
            return Ok(());
        }
    }
    Err(format!("custom entry not found: {}", name))
}

fn upgrade_all_custom() -> Result<(), String> {
    let mut entries = load_custom_entries()?;
    let mut changed = false;
    for e in entries.iter_mut() {
        let res = run_shell(&e.update_cmd)?;
        if !res.status.success() {
            // Continue to next; surface error by failing at the end? For MVP, continue
            continue;
        }
        if let Ok(ts) = time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339) {
            e.last_updated_at = Some(ts);
            changed = true;
        }
    }
    if changed { save_custom_entries(&entries)?; }
    Ok(())
}

// CRUD for custom entries
#[tauri::command]
fn custom_list() -> Result<Vec<CustomEntry>, String> { load_custom_entries() }

#[tauri::command]
fn custom_save(entry: CustomEntry) -> Result<Vec<CustomEntry>, String> {
    let mut entries = load_custom_entries()?;
    // Strict upsert by id only. If id is empty, always create a new entry with a generated id.
    if !entry.id.trim().is_empty() {
        let mut updated = false;
        for e in entries.iter_mut() {
            if e.id == entry.id {
                *e = entry.clone();
                updated = true;
                break;
            }
        }
        if !updated {
            entries.push(entry.clone());
        }
    } else {
        let slug = entry
            .name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>();
        let ts = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_else(|_| "now".into());
        let mut new_entry = entry.clone();
        new_entry.id = format!("{}-{}", slug.trim_matches('-'), ts);
        entries.push(new_entry);
    }
    save_custom_entries(&entries)?;
    Ok(entries)
}

#[tauri::command]
fn custom_delete(id_or_name: String) -> Result<Vec<CustomEntry>, String> {
    let mut entries = load_custom_entries()?;
    let before = entries.len();
    entries.retain(|e| e.id != id_or_name && e.name != id_or_name);
    if entries.len() == before {
        return Err("entry not found".into());
    }
    save_custom_entries(&entries)?;
    Ok(entries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_inventory, upgrade_package, upgrade_all, custom_list, custom_save, custom_delete])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
