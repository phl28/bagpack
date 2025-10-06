<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type {
    CollectionSummary,
    CollectionWarning,
    InventorySnapshot,
    PackageRecord,
  } from "$lib/types";

  let summary: CollectionSummary | null = null;
  let inventory: InventorySnapshot | null = null;
  let warnings: CollectionWarning[] = [];
  let error: string | null = null;
  let isLoading = true;

  const managerLabels: Record<string, string> = {
    brew: "Homebrew",
    npm: "npm (global)",
    pip: "pip (system)",
  };

  const statusLabels: Record<string, string> = {
    current: "Current",
    outdated: "Outdated",
    unknown: "Unknown",
  };

  onMount(async () => {
    try {
      summary = await invoke<CollectionSummary>("get_inventory");
      inventory = summary.snapshot;
      warnings = summary.warnings ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load inventory";
    } finally {
      isLoading = false;
    }
  });

  const formattedTimestamp = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return value;
    }
  };

  const packagesByManager = (manager: string): PackageRecord[] => {
    return inventory?.packages.filter((pkg) => pkg.manager === manager) ?? [];
  };

  const allManagers = ["brew", "npm", "pip"];
</script>

<main class="wrapper">
  <header class="hero">
    <h1>Bagpack Inventory</h1>
    <p>
      Snapshot generated
      {#if inventory?.generated_at}
        on <strong>{formattedTimestamp(inventory.generated_at)}</strong>
      {:else}
        at <strong>an unknown time</strong>
      {/if}
    </p>
  </header>

  {#if isLoading}
    <p class="status">Loading package data…</p>
  {:else if error}
    <p class="status error">{error}</p>
  {:else if !inventory || inventory.packages.length === 0}
    <p class="status">No packages found yet.</p>
  {:else}
    {#if warnings.length}
      <aside class="warnings">
        <h2>Collection Warnings</h2>
        <ul>
          {#each warnings as warning}
            <li>
              <strong>{warning.manager}</strong>
              <span>{warning.message}</span>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
    <section class="grid">
      {#each allManagers as manager}
        <article class="panel">
          <header>
            <h2>{managerLabels[manager] ?? manager}</h2>
            <span class="badge">
              {packagesByManager(manager).length} pkg
            </span>
          </header>

          <ul>
            {#each packagesByManager(manager) as pkg}
              <li>
                <div>
                  <strong>{pkg.name}</strong>
                  <span class={`status-label ${pkg.status}`}>
                    {statusLabels[pkg.status] ?? pkg.status}
                  </span>
                </div>
                <small>
                  Installed {formattedTimestamp(pkg.installed_at)} ·
                  current {pkg.current_version}
                  {#if pkg.latest_version}
                    → latest {pkg.latest_version}
                  {/if}
                </small>
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  {/else}
</main>

<style>
:global(body) {
  margin: 0;
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, #16213d, #0b0c10 60%);
  color: #f5f7ff;
}

.wrapper {
  max-width: 960px;
  margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
}

.hero {
  text-align: center;
  margin-bottom: 2rem;
}

.hero h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.hero p {
  color: rgba(245, 247, 255, 0.78);
}

.status {
  text-align: center;
  background: rgba(23, 34, 68, 0.75);
  border-radius: 0.75rem;
  padding: 1rem 1.5rem;
  color: #cfd8ff;
}

.status.error {
  color: #ffb4b4;
  background: rgba(134, 32, 44, 0.6);
}

.warnings {
  background: rgba(38, 26, 56, 0.65);
  border: 1px solid rgba(141, 122, 255, 0.4);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  color: #d7ccff;
}

.warnings h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #f1eaff;
}

.warnings ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warnings li {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.warnings strong {
  font-size: 0.85rem;
  color: #b19cff;
  text-transform: uppercase;
}

.grid {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.panel {
  background: rgba(17, 24, 45, 0.85);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.panel header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}

.panel h2 {
  font-size: 1.125rem;
  margin: 0;
}

.badge {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(80, 129, 255, 0.25);
  color: #e7ecff;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

li {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(92, 112, 164, 0.35);
}

li:last-child {
  border-bottom: none;
}

li strong {
  font-size: 1rem;
}

li small {
  color: rgba(207, 216, 255, 0.65);
}

.status-label {
  font-size: 0.75rem;
  margin-left: 0.5rem;
  padding: 0.1rem 0.45rem;
  border-radius: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status-label.current {
  background: rgba(76, 201, 240, 0.25);
  color: #7de5ff;
}

.status-label.outdated {
  background: rgba(255, 111, 60, 0.25);
  color: #ffb48a;
}

.status-label.unknown {
  background: rgba(153, 153, 153, 0.25);
  color: #d5d5d5;
}
</style>
