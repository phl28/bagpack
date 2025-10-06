use serde::{Deserialize, Serialize};

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
