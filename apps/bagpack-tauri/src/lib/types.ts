export type PackageStatus = "current" | "outdated" | "unknown";
export type PackageManager = "brew" | "npm" | "pip";

export interface PackageRecord {
  name: string;
  current_version: string;
  latest_version: string | null;
  installed_at: string | null;
  status: PackageStatus;
  manager: PackageManager;
}

export interface InventorySnapshot {
  generated_at?: string | null;
  packages: PackageRecord[];
}
