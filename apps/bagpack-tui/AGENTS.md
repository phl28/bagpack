# Bagpack TUI Guidelines

## Bun Workflow
- Prefer Bun over Node.js tooling. Run `bun install`, `bun run <script>`, and `bun test` in place of npm/pnpm equivalents.
- Use `bun --watch` for local development (`bun run dev` wraps this already).
- Skip `dotenv`; Bun auto-loads `.env*` files.

## API Preferences
- Use Bun’s standard library where possible (`Bun.file`, `Bun.serve`, `Bun.sql`, `bun:sqlite`).
- Lean on Bun’s shell helpers (`Bun.$`) instead of external process wrappers.

## Testing & Builds
- Default to `bun test` for unit coverage.
- Reach for `bun build` or `bun-plugin-vue3` if you need a distributable bundle.

## Frontend Notes
- Vue + `@opentui/vue` renders the terminal UI. No Vite layer is required.
- HTML entry points can import TypeScript directly; Bun handles transpilation.

(Adapted from the generated Bun rule files so the guidance is tracked in-repo.)
