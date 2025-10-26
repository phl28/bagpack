# bagpack-tauri

SvelteKit-powered desktop shell for Bagpack, running on Tauri 2 and sharing domain models with the `bagpack-core` crate.

## Development

```bash
pnpm install        # install frontend + Tauri CLI deps
pnpm tauri dev      # launch the desktop app
pnpm tauri build    # produce a distributable bundle
```

The Rust side lives under `src-tauri/` and depends on `bagpack-core` for shared types.

## Features

- Per-manager lists for Homebrew, npm (global), and pip, sorted with Outdated first.
- Per-package Upgrade and per-manager Update all actions.
- "Others" (custom) manager for user-defined installs; entries are persisted at `~/.bagpack/custom-packages.json` and support install/update/version commands.

## Notes

- The UI disables buttons and shows inline progress labels during long-running upgrades.
- If a manager CLI is missing (e.g., pip), a warning is shown with a quick hint to verify the binary.

## Next Steps

- Track additional UI experiments (theme, layout) under `docs/ui/tauri/`.
