  # Bagpack

  Bagpack is an internal tool for auditing globally installed packages across Homebrew, npm, and pip on macOS. It gathers package metadata through each manager’s native CLI, normalizes the results into
  a shared JSON schema, and surfaces the data via two experimental front ends: a Tauri desktop app and an OpenTUI terminal UI. The long-term goal is to select the better UX and evolve Bagpack into a
  lightweight menu-bar companion.

  ---

  ## Feature Snapshot

  - Per-manager inventory for Homebrew, npm (`npm install -g`), and pip (system interpreter).
  - Captures `name`, `currentVersion`, `latestVersion`, `installedAt` (nullable), and `status` (`current`, `outdated`, or `-`).
  - Manual refresh trigger plus automatic background refresh once every 24 hours.
  - Shared JSON payload so any UI (desktop, terminal, or future plugins) can consume the same data.
  - Menu-bar counts (planned) and rich dashboards through Tauri; hacker-friendly terminal workflow via OpenTUI.

  ---

  ## Data Collection Strategy

  Bagpack shells out to existing package-manager commands to avoid maintaining registry clients or dealing with auth/rate limits manually.

  Homebrew
  - Inventory: `brew list --versions`
  - Metadata: `brew info --json=v2`
  - Outdated: `brew outdated --json=v2`
  - Install date heuristic: newest timestamp among `Cellar/<pkg>/<version>` directories or `INSTALL_RECEIPT.json`. If unavailable, `installedAt` is `null`.

  npm (global)
  - Inventory: `npm ls -g --depth=0 --json`
  - Outdated: `npm outdated -g --json`
  - Install date heuristic: mtime of the package directory inside the global prefix (`npm root -g`). Missing data defaults to `null`.

  pip (system interpreter)
  - Inventory: `pip list --format=json`
  - Outdated: `pip list --outdated --format=json`
  - Install date heuristic: filesystem timestamp of the package’s `.dist-info` directory. If unreliable, set `installedAt` to `null`.

  Each collector records the command invocation, parses any JSON output directly, and falls back to text parsing only when the manager lacks machine-readable flags.

  ---

  ## JSON Schema

  All collectors emit a single document shaped like:

  ```jsonc
  {
    "generatedAt": "2025-10-05T12:34:56Z",
    "managers": {
      "brew": [
        {
          "name": "wget",
          "currentVersion": "1.24.5",
          "latestVersion": "1.24.6",
          "installedAt": "2024-09-17T08:22:00Z",
          "status": "outdated"
        }
      ],
      "npm": [
        {
          "name": "typescript",
          "currentVersion": "5.5.2",
          "latestVersion": "5.6.3",
          "installedAt": "2025-02-11T15:10:30Z",
          "status": "current"
        }
      ],
      "pip": [
        {
          "name": "requests",
          "currentVersion": "2.32.3",
          "latestVersion": "2.33.0",
          "installedAt": null,
          "status": "-"
        }
      ]
    }
  }

  Notes

  - generatedAt: ISO 8601 UTC timestamp for the overall snapshot.
  - status: current, outdated, or - (unknown/pinned/error).
  - installedAt: ISO 8601 timestamp or null when no reliable value is available.
  - Managers can be extended later without breaking existing consumers.

  ———

  ## Prototype Tracks

  ### Tauri Desktop App

  Rust Workspace

  - bagpack-core: library exposing collector traits and data model (Inventory, PackageRecord).
  - bagpack-tauri: Tauri shell hosting the UI and calling into the core crate.

  Collector Implementation

  - Separate modules per manager (brew.rs, npm.rs, pip.rs) that execute the commands above and normalize output.
  - Filesystem timestamp helpers for install dates.
  - Inventory aggregator merges results and annotates the snapshot with command provenance.

  UI Targets

  - Dashboard view summarizing total packages and outdated counts.
  - Manager tabs with sortable tables and detail drawers.
  - Manual refresh button invoking fetch_inventory.
  - Tray menu showing Bagpack: X outdated with quick actions (Refresh, Open, Quit).

  Background Refresh

  - Daily timer (24h) that re-runs collectors while the app is alive, surfaces notifications if new outdated packages appear, and respects manual refresh overrides.
  - Optional caching to persist the last snapshot to AppData for quick startup.

  Testing

  - Unit tests for collectors with fixture command outputs.
  - Integration tests using mocked command executors.
  - UI smoke tests via Playwright/Vitest (depending on selected frontend framework).

  ### OpenTUI Terminal App

  TypeScript Project

  - bagpack-tui with pnpm + TypeScript configured for OpenTUI.

  Collector Layer

  - Modules per manager using child_process.spawn to invoke commands and parse JSON output.
  - Shared transformer creating the Inventory interface identical to the Tauri collector.

  Terminal UI

  - Sidebar listing managers with counts per status.
  - Main table with filters (All / Outdated / Current / Unknown) and keyboard shortcuts for quick navigation.
  - Command palette entries: Refresh, Export JSON, Toggle Managers, Open Logs.

  Refresh Flow

  - Manual refresh via keyboard shortcut (Cmd+R / Ctrl+R).
  - Daily interval job scheduled with OpenTUI timers; status indicator in footer showing last and next refresh times.

  Exports & Logging

  - Optional bagpack --export command to dump current JSON to stdout or a specified path.
  - Verbose logging mode for debugging command failures.

  Testing

  - Snapshot fixtures for collectors.
  - Component tests using OpenTUI’s testing utilities to validate layout and command responses.

  ———

  ## Core TODOs

  - Define normalization rules (e.g., semver trimming, lowercase manager keys, deduplication).
  - Decide on timeout and retry policy for each CLI invocation.
  - Capture sample outputs from all commands to build fixtures.
  - Implement shared error model (status: "-", errorMessage, command) for partial failures.
  - Document manual refresh flow and daily scheduler interactions for both prototypes.
  - Evaluate supplementary managers (pipx, yarn, cargo, mas) after prototype choice.
  - Explore menu-bar integration beyond SwiftBar (native NSStatusItem via Tauri, future SwiftUI companion).

  ———

  ## Configuration Roadmap (post-prototype)

  - Refresh cadence overrides (manual, 30 min, 2 hours, daily, weekly).
  - Auto-update toggles per manager.
  - Ignored package list with pattern support.
  - Custom registry endpoints or mirrors.
  - Notification preferences (macOS Notification Center vs. in-app banners).
  - Export/archive options (JSONL history, CSV snapshots).

  ———

  ## Development Scripts (future)

  Tauri

  - cargo run -p bagpack-tauri
  - cargo test -p bagpack-core
  - pnpm --filter bagpack-tauri ui:test

  OpenTUI

  - pnpm dev (watch mode with OpenTUI renderer)
  - pnpm test (collector + UI tests)
  - pnpm bagpack --export inventory.json

  Scripts will be added once the prototypes are scaffolded; refer to the project Makefile for unified targets.
