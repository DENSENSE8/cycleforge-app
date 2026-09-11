# Project rules — Cycle Forge

@AGENTS.md

When writing, modifying, or reviewing UI code, you MUST call `ds_contract`,
`ds_tokens`, and `ds_critique` (the `design-mcp` server) before writing any
implementation. Prefer native MCP tools when available; otherwise
`node tools/design-mcp/ds.mjs …`. Do not guess Tailwind classes, corner radii,
or component paths. If you do not call the design tools first, your code will
be rejected (project hooks enforce a session stamp).

"Omni Composer" / station mouth = `StationComposerHost`. Dumb stations use
`showModeFaces={false}` (keep the context ring). Clone Pack/Unbox for floor
stations — do not invent rails or second mouths.

The repo is mid-refactor into a Warehouse OS shell. Read
[`docs/warehouse-os/`](docs/warehouse-os/) before building UI — it is the plan of
record. The old house-law corpus was deleted 2026-08-21; do not reconstruct it.

**Mobile-first is repo-wide** (not warehouse-only): every operator verb must be
doable on `/m/*` first. Law: [`docs/mobile-first/SURFACE_LAW.md`](docs/mobile-first/SURFACE_LAW.md).
Cursor: `.cursor/rules/mobile-first-surface.mdc`.
User: "span repo-wide" / "do everything on the mobile app first."

## Garisek graph + eval (non-UI edits / task completion)

- **Code graph:** `find_symbol` → `impact_analysis` before shared component edits.
  CLI: `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" …`
- **Eval:** run `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
  before claiming a task is done.
- **Overlay shell:** SoT is `SCAN_STATION_OVERLAY_COHORT` (all floor peers).
  Mouth/domain + shell: `pnpm run eval:station <id>`. Display eval is
  **slot-table only** — there is no `eval:cohort overlay`.
- **Slot-table cohort (the only display eval):** SoT is engine + `PRODUCT_TABLES`
  (`slot-table-cohort.ts`). After CompoundItem / slot-layout / DataTable funnel
  edits: `pnpm run eval:cohort slot-table`. Hand GRID leftovers:
  `pnpm run eval:discover` — delete only listed DELETE ids; never KEEP.
- **Shortcut-display cohort:** SoT is staff `?` inline on the buttons
  (`shortcut-display-cohort.ts`). After shortcut / TableStatusBar hotkey edits:
  `pnpm run eval:cohort shortcuts`. Standing keycaps: refuse. Cheat sheet from
  the table-foot `?`: refuse. Bind the key; `?` paints the letter on the button.
