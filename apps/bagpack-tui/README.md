# bagpack-tui

OpenTUI-based terminal client for Bagpack inventory data.

## Getting Started

```bash
bun install    # installs @opentui/* and Vue reconcilers (requires registry access)
bun run dev    # watches src/main.ts and renders the TUI
```

If the sandbox lacks network access, update `package.json` now and rerun `bun install` once connectivity returns.

## Project Notes

- Keep shared domain models aligned with the Rust crate—see `src/types.ts` for the mirrored interfaces.
- Collectors shell out to `brew`, `npm`, and `pip`; ensure they are available on `PATH` or expect warnings in the UI.
- Log keyboard shortcuts and ergonomics in `docs/ui/tui/` as features land.
