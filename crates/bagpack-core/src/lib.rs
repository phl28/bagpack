use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Command, ExitStatus};
use thiserror::Error;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// Canonical representation of a package across supported managers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackageRecord {
    pub name: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub installed_at: Option<String>,
    pub status: PackageStatus,
    pub manager: PackageManager,
}

/// Snapshot-level metadata plus manager inventory.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InventorySnapshot {
    pub generated_at: Option<String>,
    pub packages: Vec<PackageRecord>,
}

/// Summary returned to UIs, including non-fatal collection warnings.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectionSummary {
    pub snapshot: InventorySnapshot,
    pub warnings: Vec<CollectionWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectionWarning {
    pub manager: PackageManager,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageStatus {
    Current,
    Outdated,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageManager {
    Brew,
    Npm,
    Pip,
}

impl InventorySnapshot {
    /// Adds a package to the snapshot.
    pub fn push(&mut self, record: PackageRecord) {
        self.packages.push(record);
    }

    /// Returns the number of packages flagged as outdated.
    pub fn outdated_count(&self) -> usize {
        self.packages
            .iter()
            .filter(|record| record.status == PackageStatus::Outdated)
            .count()
    }

    /// Sets the generation timestamp using an ISO-8601 string.
    pub fn set_generated_at(&mut self, iso_timestamp: impl Into<String>) {
        self.generated_at = Some(iso_timestamp.into());
    }
}

impl CollectionSummary {
    pub fn new(snapshot: InventorySnapshot) -> Self {
        Self {
            snapshot,
            warnings: Vec::new(),
        }
    }

    fn push_warning(&mut self, manager: PackageManager, error: CollectionError) {
        self.warnings.push(CollectionWarning {
            manager,
            message: error.to_string(),
        });
    }
}

/// Gather package inventories from Homebrew, npm, and pip.
///
/// The function attempts each manager independently and records failures as warnings so that
/// remaining data can still surface to the UI.
pub fn collect_inventory() -> CollectionSummary {
    let mut snapshot = InventorySnapshot::default();

    if let Ok(timestamp) = OffsetDateTime::now_utc().format(&Rfc3339) {
        snapshot.set_generated_at(timestamp);
    }

    let mut summary = CollectionSummary::new(snapshot);

    match collect_brew() {
        Ok(packages) => summary.snapshot.packages.extend(packages),
        Err(err) => summary.push_warning(PackageManager::Brew, err),
    }

    match collect_npm() {
        Ok(packages) => summary.snapshot.packages.extend(packages),
        Err(err) => summary.push_warning(PackageManager::Npm, err),
    }

    match collect_pip() {
        Ok(packages) => summary.snapshot.packages.extend(packages),
        Err(err) => summary.push_warning(PackageManager::Pip, err),
    }

    summary
}

fn collect_brew() -> Result<Vec<PackageRecord>, CollectionError> {
    let list_output = run_command("brew", &["list", "--versions"], None::<&[i32]>)?;
    ensure_success(&list_output, "brew list --versions")?;

    let mut installed: HashMap<String, String> = HashMap::new();
    for line in list_output
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
    {
        let mut parts = line.split_whitespace();
        if let (Some(name), Some(version)) = (parts.next(), parts.next_back()) {
            installed.insert(name.to_string(), version.to_string());
        }
    }

    if installed.is_empty() {
        return Ok(Vec::new());
    }

    let outdated_output = run_command("brew", &["outdated", "--json=v2"], None::<&[i32]>)?;
    ensure_success(&outdated_output, "brew outdated --json=v2")?;

    #[derive(Debug, Deserialize)]
    struct BrewOutdated {
        formulae: Vec<BrewFormula>,
    }

    #[derive(Debug, Deserialize)]
    struct BrewFormula {
        name: String,
        #[serde(default)]
        installed_versions: Vec<String>,
        #[serde(default)]
        current_version: Option<String>,
        #[serde(default)]
        latest_version: Option<String>,
    }

    let mut latest_map: HashMap<String, String> = HashMap::new();
    if !outdated_output.stdout.trim().is_empty() {
        let parsed: BrewOutdated = serde_json::from_str(&outdated_output.stdout)?;
        for formula in parsed.formulae {
            if let Some(latest) = formula
                .latest_version
                .or(formula.current_version)
                .filter(|v| !v.is_empty())
            {
                latest_map.insert(formula.name, latest);
            }
        }
    }

    let packages = installed
        .into_iter()
        .map(|(name, current_version)| {
            let latest_version = latest_map.get(&name).cloned();
            let status = if let Some(latest) = &latest_version {
                if latest != &current_version {
                    PackageStatus::Outdated
                } else {
                    PackageStatus::Current
                }
            } else {
                PackageStatus::Current
            };

            PackageRecord {
                name,
                current_version,
                latest_version,
                installed_at: None,
                status,
                manager: PackageManager::Brew,
            }
        })
        .collect();

    Ok(packages)
}

fn collect_npm() -> Result<Vec<PackageRecord>, CollectionError> {
    let list_output = run_command("npm", &["ls", "-g", "--depth=0", "--json"], None::<&[i32]>)?;
    ensure_success(&list_output, "npm ls -g --depth=0 --json")?;

    #[derive(Debug, Deserialize)]
    struct NpmTree {
        #[serde(default)]
        dependencies: HashMap<String, NpmPackage>,
    }

    #[derive(Debug, Deserialize)]
    struct NpmPackage {
        #[serde(default)]
        version: Option<String>,
    }

    let tree: NpmTree = serde_json::from_str(&list_output.stdout)?;

    let outdated_output = run_command("npm", &["outdated", "-g", "--json"], Some(&[0, 1]))?;
    // npm returns exit code 1 when outdated packages exist; treat 0/1 as success.
    let mut outdated_map: HashMap<String, String> = HashMap::new();
    if !outdated_output.stdout.trim().is_empty() {
        let value: serde_json::Value = serde_json::from_str(&outdated_output.stdout)?;
        if let serde_json::Value::Object(entries) = value {
            for (name, details) in entries {
                if let Some(latest) = details.get("latest").and_then(|v| v.as_str()) {
                    outdated_map.insert(name, latest.to_string());
                }
            }
        }
    }

    let packages = tree
        .dependencies
        .into_iter()
        .filter_map(|(name, pkg)| {
            pkg.version.map(|current_version| {
                let latest_version = outdated_map.get(&name).cloned();
                let status = if latest_version.is_some() {
                    PackageStatus::Outdated
                } else {
                    PackageStatus::Current
                };

                PackageRecord {
                    name,
                    current_version,
                    latest_version,
                    installed_at: None,
                    status,
                    manager: PackageManager::Npm,
                }
            })
        })
        .collect();

    Ok(packages)
}

fn collect_pip() -> Result<Vec<PackageRecord>, CollectionError> {
    let list_output = run_command("pip", &["list", "--format=json"], None::<&[i32]>)?;
    ensure_success(&list_output, "pip list --format=json")?;

    #[derive(Debug, Deserialize)]
    struct PipPackage {
        name: String,
        version: String,
    }

    let installed: Vec<PipPackage> = serde_json::from_str(&list_output.stdout)?;

    #[derive(Debug, Deserialize)]
    struct PipOutdated {
        name: String,
        #[serde(rename = "latest_version")]
        latest_version: String,
    }

    let outdated_output = run_command(
        "pip",
        &["list", "--outdated", "--format=json"],
        None::<&[i32]>,
    )?;
    ensure_success(&outdated_output, "pip list --outdated --format=json")?;

    let mut outdated_map: HashMap<String, String> = HashMap::new();
    if !outdated_output.stdout.trim().is_empty() {
        let outdated: Vec<PipOutdated> = serde_json::from_str(&outdated_output.stdout)?;
        for pkg in outdated {
            outdated_map.insert(pkg.name, pkg.latest_version);
        }
    }

    let packages = installed
        .into_iter()
        .map(|pkg| {
            let latest_version = outdated_map.get(&pkg.name).cloned();
            let status = if latest_version.is_some() {
                PackageStatus::Outdated
            } else {
                PackageStatus::Current
            };

            PackageRecord {
                name: pkg.name,
                current_version: pkg.version,
                latest_version,
                installed_at: None,
                status,
                manager: PackageManager::Pip,
            }
        })
        .collect();

    Ok(packages)
}

fn ensure_success(output: &CommandResult, label: &str) -> Result<(), CollectionError> {
    if output.status.success() {
        Ok(())
    } else {
        Err(CollectionError::Command(CommandError::Status {
            program: label.to_string(),
            code: output.status.code(),
            stderr: output.stderr.clone(),
        }))
    }
}

fn run_command(
    program: &str,
    args: &[&str],
    allowed_exit_codes: Option<&[i32]>,
) -> Result<CommandResult, CollectionError> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|source| {
            CollectionError::Command(CommandError::Spawn {
                program: program.to_string(),
                source,
            })
        })?;

    let stdout = String::from_utf8(output.stdout).map_err(|source| {
        CollectionError::Command(CommandError::Utf8 {
            program: program.to_string(),
            source,
        })
    })?;

    let stderr = String::from_utf8(output.stderr).map_err(|source| {
        CollectionError::Command(CommandError::Utf8 {
            program: program.to_string(),
            source,
        })
    })?;

    if !output.status.success() {
        if let Some(codes) = allowed_exit_codes {
            if let Some(code) = output.status.code() {
                if codes.contains(&code) {
                    return Ok(CommandResult {
                        stdout,
                        stderr,
                        status: output.status,
                    });
                }
            }
        }

        return Err(CollectionError::Command(CommandError::Status {
            program: format!("{} {}", program, args.join(" ")),
            code: output.status.code(),
            stderr,
        }));
    }

    Ok(CommandResult {
        stdout,
        stderr,
        status: output.status,
    })
}

#[derive(Debug)]
struct CommandResult {
    stdout: String,
    stderr: String,
    status: ExitStatus,
}

#[derive(Debug, Error)]
pub enum CollectionError {
    #[error("{program} failed to run: {source}")]
    Command(#[from] CommandError),
    #[error("json parse error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("failed to spawn {program}: {source}")]
    Spawn {
        program: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{program} exited with status {code:?}: {stderr}")]
    Status {
        program: String,
        code: Option<i32>,
        stderr: String,
    },
    #[error("{program} produced invalid UTF-8: {source}")]
    Utf8 {
        program: String,
        #[source]
        source: std::string::FromUtf8Error,
    },
}

#[cfg(test)]
mod tests {
    use super::{InventorySnapshot, PackageManager, PackageRecord, PackageStatus};

    #[test]
    fn counts_outdated_packages() {
        let mut snapshot = InventorySnapshot::default();
        snapshot.push(PackageRecord {
            name: "wget".into(),
            current_version: "1.24.5".into(),
            latest_version: Some("1.24.6".into()),
            installed_at: None,
            status: PackageStatus::Outdated,
            manager: PackageManager::Brew,
        });
        snapshot.push(PackageRecord {
            name: "typescript".into(),
            current_version: "5.5.2".into(),
            latest_version: Some("5.6.3".into()),
            installed_at: None,
            status: PackageStatus::Current,
            manager: PackageManager::Npm,
        });
        snapshot.set_generated_at("2025-10-05T00:00:00Z");

        assert_eq!(snapshot.outdated_count(), 1);
        assert_eq!(
            snapshot.generated_at.as_deref(),
            Some("2025-10-05T00:00:00Z")
        );
    }
}
