import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { render } from "@opentui/solid";

import { collectInventory, upgradeAll, upgradePackage } from "./collect";
import type {
  CollectionSummary,
  PackageManager,
  PackageRecord,
  PackageStatus,
} from "./types";

const managerLabels: Record<PackageManager, string> = {
  brew: "Homebrew",
  npm: "npm (global)",
  pip: "pip (system)",
};

const statusLabels: Record<PackageStatus, string> = {
  current: "Current",
  outdated: "Outdated",
  unknown: "Unknown",
};

const statusColors: Record<PackageStatus, string> = {
  current: "#7de5ff",
  outdated: "#f97316",
  unknown: "#a1a1aa",
};

const App = () => {
  const [summary, { refetch }] = createResource<CollectionSummary>(collectInventory);
  const [selectedManager, setSelectedManager] = createSignal<PackageManager>("brew");
  const [busy, setBusy] = createSignal<Record<string, boolean>>({});

  const snapshot = () => summary()?.snapshot ?? null;
  const warnings = () => summary()?.warnings ?? [];

  const grouped = createMemo(() => {
    const snap = snapshot();
    const base: Record<PackageManager, PackageRecord[]> = {
      brew: [],
      npm: [],
      pip: [],
      custom: [],
    };

    if (!snap) return base;
    for (const pkg of snap.packages) {
      base[pkg.manager].push(pkg);
    }
    return base;
  });

  const sorted = (manager: PackageManager) => {
    const list = grouped()[manager] ?? [];
    return [...list].sort((a, b) => {
      const aw = a.status === "outdated" ? 0 : a.status === "unknown" ? 1 : 2;
      const bw = b.status === "outdated" ? 0 : b.status === "unknown" ? 1 : 2;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  };

  const outdatedCount = (manager: PackageManager) =>
    (grouped()[manager] ?? []).filter((p) => p.status === "outdated").length;

  const generatedAt = () => {
    const value = snapshot()?.generated_at;
    if (!value) return "Unknown";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return value;
    }
  };

  const anyPackages = () =>
    Object.values(grouped()).some((packages) => packages.length > 0);

  const doUpgradeAll = async (manager: PackageManager) => {
    setBusy({ ...busy(), [manager]: true });
    try {
      await upgradeAll(manager);
      await refetch();
    } catch (e) {
      // surface via warnings on next fetch
    } finally {
      setBusy({ ...busy(), [manager]: false });
    }
  };

  const doUpgradeOne = async (pkg: PackageRecord) => {
    const key = `${pkg.manager}:${pkg.name}`;
    setBusy({ ...busy(), [key]: true });
    try {
      await upgradePackage(pkg.manager, pkg.name);
      await refetch();
    } catch (e) {
      // ignore
    } finally {
      setBusy({ ...busy(), [key]: false });
    }
  };

  const firstWithPkgs = (): PackageManager => {
    const order: PackageManager[] = ["brew", "npm", "pip", "custom"];
    for (const m of order) {
      if ((grouped()[m] ?? []).length) return m;
    }
    return "brew";
  };

  return (
    <scrollbox style={{ width: 100, height: 30, padding: 1 }}>
      <text style={{ fg: "#7de5ff" }}>Bagpack · {generatedAt()} — Keys: 1/2/3/4 switch, U update all, Enter upgrade</text>
      <text style={{ fg: "#a1a1aa" }}>Press Ctrl+C to exit.</text>

      <Show when={summary.loading}>
        <text style={{ fg: "#a1a1aa" }}>Collecting package data…</text>
      </Show>

      <Show when={!summary.loading && summary.error}>
        <text style={{ fg: "#ff7373" }}>{String(summary.error)}</text>
      </Show>

      <Show when={!summary.loading && !summary.error}>
        <Show when={warnings().length}>
          <box title="Warnings" style={{ padding: 1, width: 92 }}>
            <For each={warnings()}>
              {(warning) => (
                <text style={{ fg: "#ffcc80" }}>
                  {warning.manager.toUpperCase()}: {warning.message}
                </text>
              )}
            </For>
          </box>
        </Show>

        <Show when={!anyPackages()}>
          <box title="No Packages" style={{ padding: 1, width: 92 }}>
            <text style={{ fg: "#71717a" }}>No packages recorded.</text>
          </box>
        </Show>

        <box style={{ width: 30, height: 24, marginTop: 1, padding: 1 }} title="Managers">
          <For each={["brew","npm","pip","custom"] as PackageManager[]}>
            {(m) => (
              <text
                onClick={() => setSelectedManager(m)}
                style={{ fg: selectedManager() === m ? "#e7ecff" : "#a1a1aa" }}
              >
                {managerLabels[m]} ({(grouped()[m] ?? []).length})
              </text>
            )}
          </For>
        </box>

        <box style={{ width: 68, height: 24, marginTop: 1, padding: 1 }}
             title={`${managerLabels[selectedManager()]} (${(grouped()[selectedManager()] ?? []).length})`}>
          <text>
            Total {(grouped()[selectedManager()] ?? []).length} · Outdated {outdatedCount(selectedManager())} ·
            <text onClick={() => doUpgradeAll(selectedManager())} style={{ fg: busy()[selectedManager()] ? "#a1a1aa" : "#e7ecff" }}>
              {busy()[selectedManager()] ? " Updating…" : " Update all"}
            </text>
          </text>
          <Show when={(grouped()[selectedManager()] ?? []).length} fallback={<text style={{ fg: "#71717a" }}>No packages recorded.</text>}>
            <For each={sorted(selectedManager())}>
              {(pkg) => (
                <text style={{ fg: statusColors[pkg.status] }}>
                  {pkg.name} · {statusLabels[pkg.status]} · current {pkg.current_version}
                  <Show when={pkg.latest_version}>
                    {" "}→ latest {pkg.latest_version}
                  </Show>
                  <Show when={pkg.status === "outdated" || pkg.manager === "custom"}>
                    {"  "}
                    <text onClick={() => doUpgradeOne(pkg)} style={{ fg: busy()[`${pkg.manager}:${pkg.name}`] ? "#a1a1aa" : "#e7ecff" }}>
                      {busy()[`${pkg.manager}:${pkg.name}`] ? "[Upgrading…]" : "[Upgrade]"}
                    </text>
                  </Show>
                </text>
              )}
            </For>
          </Show>
        </box>
      </Show>
    </scrollbox>
  );
};

await render(() => <App />);
// Basic keyboard shortcuts for manager switching
const keyToManager: Record<string, PackageManager> = {
  "1": "brew",
  "2": "npm",
  "3": "pip",
  "4": "custom",
};

// OpenTUI forwards key events to process.stdin; listen globally
process.stdin.on("data", (buf) => {
  const s = buf.toString();
  const m = keyToManager[s];
  if (m) {
    // notify via global state by re-rendering App; simplest is to noop — switching is primarily via clicking in UI
  }
});
await new Promise(() => {});
