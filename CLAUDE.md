# Project rules — Cycle Forge

@AGENTS.md

When writing, modifying, or reviewing UI code, you MUST call `ds_contract`,
`ds_tokens`, and `ds_critique` (the `design-mcp` server) before writing any
implementation. Do not guess Tailwind classes, corner radii, or component paths.
If you do not call the design tools first, your code will be rejected.

The repo is mid-refactor into a Warehouse OS shell. Read
[`docs/warehouse-os/`](docs/warehouse-os/) before building UI — it is the plan of
record. The old house-law corpus was deleted 2026-08-21; do not reconstruct it.
