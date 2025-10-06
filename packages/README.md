# Shared Packages

Use this folder for reusable TypeScript utilities (for example schema validators, IPC clients, logging helpers). Configure each package with `package.json` and export only stable APIs consumed by front ends.

When adding a package:
1. Create a directory like `packages/schema-utils`.
2. Add `index.ts` plus a focused test suite.
3. Update `pnpm-workspace.yaml` so both apps resolve the package.
