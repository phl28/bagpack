# bagpack-tui

OpenTUI-based terminal client for Bagpack inventory data.

## Getting Started

```bash
bun install    # installs @opentui/core, @opentui/solid, solid-js (requires registry access)
bun run dev    # runs src/main.tsx and renders the Solid-based TUI

# optional hot-reload loop
bun run watch
```

If the sandbox lacks network access, update `package.json` now and rerun `bun install` once connectivity returns. Bun will automatically preload `@opentui/solid/preload` via `bunfig.toml`.

## Project Notes

- Managers: Homebrew, npm (global), pip, plus an "Others" (custom) bucket loaded from `~/.bagpack/custom-packages.json`.
- Sorting: packages show Outdated first, then Unknown, then Current.
- Actions: per-package Upgrade and per-manager Update all; custom entries always allow Upgrade.
- Keep shared domain models aligned with the Rust crate—see `src/types.ts` for the mirrored interfaces.
- Collectors shell out to `brew`, `npm`, and `pip`; ensure they are available on `PATH` or expect warnings in the UI.
