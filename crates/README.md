# Rust Workspace

This directory groups Rust crates that power Bagpack collectors and shared models. Each crate should declare workspace membership in the root `Cargo.toml` once the workspace is initialized.

## Adding A Crate
- Run `cargo new <crate-name> --lib --vcs none` from the repository root.
- Place shared types in `bagpack-core`; additional crates (for example `bagpack-cli`) belong beside it.
- Keep internal docs in `README.md` inside each crate.
