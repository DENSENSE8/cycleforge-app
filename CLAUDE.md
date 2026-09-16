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

## Dev origin — `http://localhost:3050` only

User 2026-09-15: *"only work from 3050."* `:3050` is the switchboard and the
ONLY address an agent may hit — curl, Playwright, browser probes, screenshots.
Cookie scoping (`cf_kiosk` → `cf_kiosk__l7`) happens only through it, so a lane
port tests a namespace the operator's browser never sees.

- Never probe `:307x` / `:3051` / a "free port" app server. `npm run dev`
  answering `EADDRINUSE` on `:3050` is the switchboard working.
- Never hand-start `next dev` on a lane port. The lane behind `:3050` is a unit:
  `systemctl --user {start,restart,status} cycleforge-lane@prod`;
  `journalctl --user -u cycleforge-lane@prod -f`. Switch truth:
  `GET /__switch/state`.
- `503` + `x-switch-error` = the lane is down. Start its unit; do not bind a
  port around it. DSNs live in the worktree `.env` only.
- Full law: [`AGENTS.md`](AGENTS.md) § Dev origin ·
  `.cursor/rules/dev-origin.mdc` (`alwaysApply`).
- Sole exception (a measurement rig, not an origin): `request-shape` builds
  production to an isolated `NEXT_DIST_DIR` + throwaway port, then verifies at
  `:3050`.

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
