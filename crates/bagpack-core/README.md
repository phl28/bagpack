# bagpack-core

Core Rust crate for collectors, shared data models, and normalization helpers.

## Bootstrap Checklist
- Define `PackageRecord`, `InventorySnapshot`, and error types in `src/lib.rs`.
- Implement manager modules (`brew`, `npm`, `pip`) using async command runners.
- Wire tests under `tests/` consuming fixtures from `../../test-data/manager/`.
