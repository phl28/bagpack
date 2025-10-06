 Scope Recap

  - Project name: Bagpack.
  - Package managers in scope: Homebrew, npm (global), pip (global interpreter).
  - Fields per package: name, currentVersion, latestVersion, installedAt (nullable), status (current | outdated | -).
  - Shared representation: single JSON document { generatedAt, managers: { brew: Package[], npm: Package[], pip: Package[] } }.
  - Refresh behavior: manual trigger + background poll once per day (24h) while the app runs.
  - Data source: invoke each manager’s native CLI (prefer JSON flags where available); no direct registry API calls in the prototype.

  Core TODOs (Before UI Work)

  - [ ] Document command suite:
      - Homebrew inventory via brew list --versions and brew info --json=v2.
      - Outdated check via brew outdated --json=v2.
      - npm inventory via npm ls -g --depth=0 --json.
      - npm outdated via npm outdated -g --json.
      - pip inventory via pip list --format=json.
      - pip outdated via pip list --outdated --format=json.
  - [ ] Define install-date heuristics per manager and capture fallback order.
  - [ ] Specify JSON schema (types + optional fields) and sample payload.
  - [ ] Decide normalization rules (e.g., trim build metadata, lowercase manager keys).
  - [ ] Draft error-handling policy (timeout, command failure, partial data).
  - [ ] Assemble sample fixtures from actual command output for testing.
  - [ ] Outline manual refresh flow + daily background poll scheduler contract.

  Tauri Prototype Plan

  - [x] Set up Rust workspace: core crate (bagpack-core) + Tauri app (bagpack-tauri).
  - [x] Implement collectors in Rust:
      - Abstractions per manager (brew.rs, npm.rs, pip.rs) returning Vec<PackageRecord>.
      - Use serde_json to parse CLI JSON, fallback to text parsing when needed.
      - Install-date helper: inspect filesystem (Cellar, global node_modules, site-packages) using metadata().created(); if unavailable, return None.
  - [x] Aggregate results into the shared Inventory struct with generated_at timestamp.
  - [x] Wire Tauri commands:
      - fetch_inventory (manual refresh; runs collectors, updates state).
      - schedule_refresh (starts/refreshes daily timer).
      - stop_refresh (for cleanup on app close).
  - [x] Front-end (React/Svelte/Vue per preference): initial SvelteKit shell wired to demo inventory.
      - Dashboard view with summary counts + “Refresh now” button.
      - Tabs or accordion per manager listing packages, filter by status.
      - Detail drawer showing versions, install date, command provenance.
  - [ ] Tray integration:
      - Show counts (e.g., Bagpack: 3 outdated) in menu bar.
      - Provide quick actions: Refresh, Open Window, Quit.
  - [ ] State & caching:
      - In-memory store for current inventory; optional JSON cache persisted to AppData.
      - Daily poll uses cached data to diff and notify (system notification on new outdated packages).
  - [ ] Testing:
      - Unit tests for collectors using fixture outputs.
      - Integration test running collectors with mocked command executors.
      - UI smoke test (component tests) for dashboard rendering.

  OpenTUI Prototype Plan

  - [x] Initialize TypeScript project (Bun init, Vue + OpenTUI scaffolding).
  - [x] Build collector layer in TS:
      - Modules per manager invoking commands via child_process.spawn.
      - Parse JSON outputs; fallback to text parsing libs only if necessary.
      - Convert to shared PackageRecord interface and assemble Inventory.
  - [ ] Implement manual refresh command binding (keyboard shortcut + command palette).
  - [ ] Background poll:
      - Use setInterval equivalent (OpenTUI runtime) to trigger daily refresh; store next scheduled time.
      - Display status indicator in footer (last refresh time, next scheduled run).
  - [ ] UI layout:
      - Sidebar with managers and counts (current, outdated, -).
      - Main panel listing packages with table component, filter toggles, detail modal.
      - Command palette entries: Refresh, Export JSON, Toggle Manager visibility.
  - [ ] Export support:
      - Provide Save JSON action writing to stdout or user-specified path.
  - [ ] Testing:
      - Snapshot tests for collectors (mocked command outputs).
      - Component tests for table rendering and command handling.

  Shared Follow-Ups (Post-Prototype)

  - [ ] Config scaffold (JSON/YAML) defining refresh interval, ignored packages, custom registry endpoints.
  - [ ] Notification strategy (macOS Notification Center vs. terminal banners).
  - [ ] Evaluate registry API integration for richer metadata.
  - [ ] Decide on packaging/distribution (Homebrew tap, pnpm script, signed macOS app).
  - [ ] Converge on the preferred UI (Tauri vs. OpenTUI), retire the other collector, and refactor as needed.
