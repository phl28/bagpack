# bagpack-tauri

SvelteKit-powered desktop shell for Bagpack, running on Tauri 2 and sharing domain models with the `bagpack-core` crate.

## Development

```bash
pnpm install        # install frontend + Tauri CLI deps
pnpm tauri dev      # launch the desktop app
pnpm tauri build    # produce a distributable bundle
```

The Rust side lives under `src-tauri/` and depends on `bagpack-core` for shared types.

## Next Steps

- Replace the demo inventory generator in `src-tauri/src/lib.rs` with real collectors once CLI integrations land.
- Flesh out richer dashboards under `src/routes/` and mirror UX decisions in the OpenTUI client.
- Track additional UI experiments (theme, layout) under `docs/ui/tauri/`.
