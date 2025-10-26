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
    custom: "Others",
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
      selectedManager = pickDefaultManager();
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
    const list = inventory?.packages.filter((pkg) => pkg.manager === manager) ?? [];
    return [...list].sort((a, b) => {
      const aw = a.status === "outdated" ? 0 : a.status === "unknown" ? 1 : 2;
      const bw = b.status === "outdated" ? 0 : b.status === "unknown" ? 1 : 2;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  };

  const allManagers = ["brew", "npm", "pip", "custom"];

  let actionBusy: Record<string, boolean> = {};

  // Helper: detect common pip-not-found message and show a hint
  const isPipNotFound = (w: CollectionWarning) =>
    w.manager === "pip" && /failed to spawn pip: No such file or directory/i.test(w.message);

  const outdatedCount = (manager: string) =>
    packagesByManager(manager).filter((p) => p.status === "outdated").length;

  let selectedManager: string = "brew";
  const managerCount = (manager: string) => packagesByManager(manager).length;
  function pickDefaultManager() {
    for (const m of allManagers) {
      if (managerCount(m) > 0) return m;
    }
    return "brew";
  }

  // Search filter
  let search = "";
  const displayedPackages = (manager: string): PackageRecord[] => {
    const list = packagesByManager(manager);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  };

  // Add Custom (Others) modal state and handlers
  let showAddModal = false;
  let addName = "";
  let addInstall = "";
  let addUpdate = "";
  let addVersion = "";
  let addRegex = "v?(\\d+\\.\\d+\\.\\d+)";
  let addingCustom = false;

  function openAddCustom() {
    addName = "";
    addInstall = "";
    addUpdate = "";
    addVersion = "";
    addRegex = "v?(\\d+\\.\\d+\\.\\d+)";
    showAddModal = true;
  }

  async function submitAddCustom() {
    const name = addName.trim();
    const install_cmd = addInstall.trim();
    const update_cmd = (addUpdate.trim() || install_cmd);
    const version_cmd = addVersion.trim();
    const version_regex = addRegex.trim();
    if (!name || !install_cmd) {
      showAddModal = false;
      return;
    }
    try {
      addingCustom = true;
      await invoke("custom_save", {
        entry: {
          id: "",
          name,
          install_cmd,
          update_cmd,
          version_cmd: version_cmd || null,
          version_regex: version_regex || null,
        },
      });
      const res = await invoke<CollectionSummary>("get_inventory");
      summary = res;
      inventory = res.snapshot;
      warnings = res.warnings ?? [];
      selectedManager = "custom";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      addingCustom = false;
      showAddModal = false;
    }
  }

  async function refreshAll(manager: string) {
    actionBusy = { ...actionBusy, [manager]: true };
    try {
      const res = await invoke<CollectionSummary>("upgrade_all", { manager });
      summary = res;
      inventory = res.snapshot;
      warnings = res.warnings ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      actionBusy = { ...actionBusy, [manager]: false };
    }
  }

  async function upgradeOne(manager: string, name: string) {
    const key = `${manager}:${name}`;
    actionBusy = { ...actionBusy, [key]: true };
    try {
      const res = await invoke<CollectionSummary>("upgrade_package", { manager, name });
      summary = res;
      inventory = res.snapshot;
      warnings = res.warnings ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      actionBusy = { ...actionBusy, [key]: false };
    }
  }
</script>

<main class="wrapper">
  <header class="hero">
    <h1>Bagpack</h1>
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
              {#if isPipNotFound(warning)}
                <small class="hint">pip not detected on PATH. Try <code>pip -V</code> or <code>python3 -m pip --version</code>. If missing, install or enable with <code>python3 -m ensurepip --upgrade</code>.</small>
              {/if}
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
    {#if showAddModal}
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal">
          <h3>Add custom package</h3>
          <div class="form">
            <label>
              <span>Name</span>
              <input placeholder="droid" bind:value={addName} />
            </label>
            <label>
              <span>Install command</span>
              <input placeholder="curl -fsSL https://example.com/cli | sh" bind:value={addInstall} />
            </label>
            <label>
              <span>Update command</span>
              <input placeholder="(defaults to install command)" bind:value={addUpdate} />
            </label>
            <label>
              <span>Version command (optional)</span>
              <input placeholder="droid -V" bind:value={addVersion} />
            </label>
            <label>
              <span>Version regex (optional)</span>
              <input placeholder="v?(\\d+\\.\\d+\\.\\d+)" bind:value={addRegex} />
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn" on:click={submitAddCustom} disabled={addingCustom}>
              {#if addingCustom}
                <span class="spinner" aria-hidden="true"></span>
                <span>Saving…</span>
              {:else}
                <span>Save</span>
              {/if}
            </button>
            <button class="btn" on:click={() => (showAddModal = false)} disabled={addingCustom}>Cancel</button>
          </div>
        </div>
      </div>
    {/if}
    <div class="app">
      <aside class="sidebar">
        <nav>
          {#each allManagers as manager}
            <button
              class="nav-item {selectedManager === manager ? 'active' : ''}"
              on:click={() => (selectedManager = manager)}
            >
              <span class="label">{managerLabels[manager] ?? manager}</span>
              <span class="count">{packagesByManager(manager).length}</span>
            </button>
          {/each}
        </nav>
      </aside>
      <section class="content">
        <article class="panel">
          <header>
            <div class="panel-heading-row">
              <h2>{managerLabels[selectedManager] ?? selectedManager}</h2>
              <div class="row-actions">
                <input class="search" type="text" placeholder="Search packages…" bind:value={search} />
                <span class="badge">{packagesByManager(selectedManager).length} pkg</span>
                <span class="badge warn">{outdatedCount(selectedManager)} outdated</span>
                {#if selectedManager === "custom"}
                  <button class="btn" on:click={openAddCustom}>Add</button>
                {/if}
                <button class="btn" on:click={() => refreshAll(selectedManager)} disabled={actionBusy[selectedManager] === true}>
                  {actionBusy[selectedManager] ? "Updating…" : "Update all"}
                </button>
              </div>
            </div>
          </header>

          {#if displayedPackages(selectedManager).length === 0}
            <p class="empty">No matching packages.</p>
          {:else}
            <ul>
              {#each displayedPackages(selectedManager) as pkg}
                <li>
                  <div class="row">
                    <div>
                      <strong>{pkg.name}</strong>
                      <span class={`status-label ${pkg.status}`}>
                        {statusLabels[pkg.status] ?? pkg.status}
                      </span>
                    </div>
                    {#if pkg.status === "outdated" || pkg.manager === "custom"}
                      <button class="btn small" on:click={() => upgradeOne(pkg.manager, pkg.name)} disabled={actionBusy[`${pkg.manager}:${pkg.name}`] === true}>
                        {actionBusy[`${pkg.manager}:${pkg.name}`] ? "Upgrading…" : "Upgrade"}
                      </button>
                    {/if}
                  </div>
                  <small>
                    Installed {formattedTimestamp(pkg.installed_at)} · current {pkg.current_version}
                    {#if pkg.latest_version}
                      → latest {pkg.latest_version}
                    {/if}
                  </small>
                </li>
              {/each}
            </ul>
          {/if}
        </article>
      </section>
    </div>
  {/if}
</main>

<style>
:global(html) {
  height: 100%;
  /* Use a solid backdrop to avoid banding/tiling artifacts */
  background: #0b0c10;
}

:global(body) {
  margin: 0;
  min-height: 100%;
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: transparent; /* use html background */
  color: #f5f7ff;
  overscroll-behavior: none; /* prevent bounce/white flash */
}

.wrapper {
  max-width: 1120px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  min-height: 100vh;
}

.hero { margin-bottom: 1rem; }
.hero h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
.hero p { color: rgba(245, 247, 255, 0.65); margin: 0; font-size: 0.9rem; }

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

.warnings .hint {
  display: block;
  margin-top: 0.25rem;
  color: rgba(207, 216, 255, 0.75);
}

.app { display: flex; gap: 1.25rem; }
.sidebar { width: 220px; flex-shrink: 0; }
.sidebar nav { display: flex; flex-direction: column; gap: 0.5rem; }
.nav-item {
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(22, 35, 68, 0.7);
  border: 1px solid rgba(92,112,164,0.35);
  color: #e7ecff;
  padding: 0.5rem 0.6rem; border-radius: 0.6rem;
  cursor: pointer; font-size: 0.95rem;
}
.nav-item .count {
  background: rgba(80, 129, 255, 0.25);
  border-radius: 999px; padding: 0.1rem 0.45rem; font-size: 0.75rem;
}
.nav-item.active { background: rgba(80,129,255,0.18); border-color: rgba(80,129,255,0.45); }
.content { flex: 1; min-width: 0; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 50;
}
.modal {
  width: min(640px, 92vw);
  background: rgba(17, 24, 45, 0.96);
  border: 1px solid rgba(92,112,164,0.35);
  border-radius: 0.75rem;
  padding: 1rem;
  color: #e7ecff;
}
.modal h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.form { display: grid; gap: 0.6rem; }
.form label { display: grid; gap: 0.35rem; }
.form input {
  background: rgba(22,35,68,0.7);
  border: 1px solid rgba(92,112,164,0.35);
  border-radius: 0.5rem;
  color: #e7ecff;
  padding: 0.45rem 0.6rem;
}
.modal-actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; justify-content: flex-end; }

/* Simple spinner */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(231, 236, 255, 0.3);
  border-top-color: #e7ecff;
  border-radius: 999px;
  margin-right: 0.4rem;
  animation: spin 0.9s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  flex-direction: column;
  gap: 0.6rem;
}

.panel-heading-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.row-actions { display: flex; align-items: center; gap: 0.5rem; }
.search {
  background: rgba(22,35,68,0.7);
  border: 1px solid rgba(92,112,164,0.35);
  border-radius: 0.5rem;
  color: #e7ecff;
  padding: 0.3rem 0.55rem;
  min-width: 200px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.badge.warn {
  background: rgba(255, 111, 60, 0.25);
  color: #ffb48a;
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
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn {
  background: rgba(80, 129, 255, 0.18);
  color: #e7ecff;
  border: 1px solid rgba(80, 129, 255, 0.35);
  padding: 0.28rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn.small {
  padding: 0.18rem 0.5rem;
  font-size: 0.78rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.empty {
  color: rgba(207, 216, 255, 0.65);
  margin: 0.25rem 0 0.5rem;
}

.status-label {
  font-size: 0.75rem;
  margin-left: 0.5rem;
  padding: 0.1rem 0.45rem;
  border-radius: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
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
