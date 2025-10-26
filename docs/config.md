# Configuration Guide

Bagpack relies on local package-manager CLIs rather than remote APIs. Ensure the following environment variables are set when testing collectors:

- `BAGPACK_BREW_BIN` (optional): override Homebrew binary path when Homebrew is not on `PATH`.
- `BAGPACK_NPM_PREFIX` (optional): explicit global npm prefix for installations on managed machines.
- `BAGPACK_PIP_INTERPRETER` (optional): path to the Python interpreter that should provide global pip inventory.
- `BAGPACK_CACHE_DIR` (optional): writable directory for cached snapshots; defaults to `$HOME/Library/Caches/bagpack` on macOS.

Custom Packages (Others)
- User-defined entries are persisted at `~/.bagpack/custom-packages.json` with fields: `name`, `install_cmd`, `update_cmd`, and optional `version_cmd`/`version_regex`. Both the desktop and TUI clients read/write this file.

Store secrets (signing keys, refresh tokens) in the macOS keychain or `.env.local`, never in tracked files. Document any new variable in this file, including default behavior and validation rules, so onboarding contributors can replicate your setup quickly.
