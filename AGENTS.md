# Repository Guidelines

## Project Structure & Module Organization
Bagpack is converging into a dual-track workspace. Documentation lives in `docs/`. Rust code will reside inside `crates/`—`bagpack-core` for shared models and collectors—and the Tauri shell in `apps/bagpack-tauri/`. The OpenTUI client sits in `apps/bagpack-tui/` with shared TypeScript utilities under `packages/`. Store CLI fixtures in `test-data/manager/<tool>/` and log schema revisions via short notes in `docs/schema/`.

## Build, Test, and Development Commands
Inside `apps/bagpack-tauri/`, run `pnpm install` followed by `pnpm tauri dev` to preview the Svelte desktop shell, or `pnpm tauri build` for bundles. Use `cargo test -p bagpack-core` to exercise collectors (requires cached crates or registry access). The terminal client now uses Bun; from `apps/bagpack-tui/` run `bun install` then `bun run dev` (add `bun run check` once tests exist). After refreshing fixtures, regenerate normalized payloads with `pnpm bagpack --export inventory.json` and commit both the raw CLI traces and the JSON snapshot.
Both front ends depend on shelling out to `brew`, `npm`, and `pip`; ensure those executables resolve on `PATH` (and supply dummy data or skip managers) before running collectors locally.

## Coding Style & Naming Conventions
Rust code follows rustfmt defaults (4 spaces) with modules named after managers (`brew.rs`, `npm.rs`, `pip.rs`). Public structs use UpperCamelCase, functions stay snake_case, and prefer explicit error types over `anyhow::Error`. Run `cargo fmt` and `cargo clippy -- -D warnings` before opening a PR. TypeScript uses 2-space indentation, kebab-case directories, and UpperCamelCase component exports. Enforce linting via `pnpm lint` once configured and treat warnings as build failures.

## Testing Guidelines
Collector crates co-locate tests under `crates/bagpack-core/tests/`; name cases `<manager>_scenario_expected` so failures map to CLI contexts. Integration harnesses should stub command executors and exercise error paths before merging. In the OpenTUI track, place `.spec.ts` files beside modules and keep mocked command transcripts under `test-data/manager/<tool>/fixtures/`. Target ≥80% coverage on collector logic and call out any exceptions in the PR.

## Commit & Pull Request Guidelines
Use short, imperative subject lines (`Add pip fixtures`, `Wire brew collector`). Provide a brief body explaining why the change matters and reference issues when available. PRs must list verification commands (for example `cargo test`, `pnpm test`), attach screenshots or recordings for UI changes, and highlight schema or fixture edits. Request review from one collector maintainer and one UI maintainer when work spans both stacks.

## Data & Configuration Safeguards
Never commit personal package inventories or machine-specific paths. When capturing CLI outputs, scrub usernames and replace precise timestamps with ISO placeholders documented in comments. Store signing keys and refresh tokens in the macOS keychain or `.env.local`, and record required environment variables in `docs/config.md` so onboarding agents can mirror your setup without exposing secrets.
