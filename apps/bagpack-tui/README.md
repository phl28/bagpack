# bagpack-tui

OpenTUI-based terminal client for Bagpack inventory data.

## Getting Started

```bash
bun install    # installs @opentui/* and Vue reconcilers (requires registry access)
bun run dev    # watches src/main.ts and renders the TUI
```

If the sandbox lacks network access, update `package.json` now and rerun `bun install` once connectivity returns.

## Project Notes

- Keep shared domain models aligned with the Rust crate—see `src/index.tsx` for the temporary mirror types.
- Prefer pure TypeScript command execution; reach for native bindings only if input latency becomes an issue.
- Log keyboard shortcuts and ergonomics in `docs/ui/tui/` as features land.
