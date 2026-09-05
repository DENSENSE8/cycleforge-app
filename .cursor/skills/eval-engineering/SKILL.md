---
name: eval-engineering
description: >-
  Run real verify gates before claiming a Cycle Forge coding task is done.
  Uses Garisek-OS eval engineering CLI; floor stations use eval:cohort / eval:station.
  Slot-table ship-by / compact in-cell date: eval:cohort slot-table.
---

# Eval engineering

## Instructions

1. Before telling the user a task is complete, run the fast verify gate:

```bash
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

2. For risky or cross-cutting changes, run full verify:

```bash
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --full
```

3. If verify fails, fix or report — do not claim done.

4. **Floor scan-station overlay shell** (any file in `SCAN_STATION_OVERLAY_COHORT`):

```bash
pnpm run eval:station <id> -- --skip-verify   # after edits
pnpm run eval:station <id>                    # before claiming done
```

   SoT is the **full cohort** (peers), not Pack/Unbox. Display eval is
   **slot-table only** — there is no `eval:cohort overlay`. Never delete
   `style={{ visibility }}` / `zIndex.panel` to silence critique — shell law.
   Read one station LEDGER; implement **one** Open gap per session.

5. **Slot-table cohort** (the only display eval — CompoundItem / `useSlotTableLayout` / PRODUCT_TABLES / `DataTableFilterMenu`):

```bash
pnpm run eval:cohort slot-table -- --skip-verify
pnpm run eval:cohort slot-table
```

   SoT is **engine + every PRODUCT_TABLES peer**, not To-ship alone. Listing/title
   paint lives on CompoundItem. STATUS ship-by is `DateRangePickerField
   variant="compact"` (no X, no year, click commits) via `useOptimisticMutation`.
   Filter icon is `DataTableFilterMenu` beside search (always mounted;
   `DATA_TABLE_FILTER_IDLE` when a family has no facets). Never FilterRefinementBar, never a hunt-tile strip. Every painted DATA column header is click-to-sort (`SLOT_TABLE_PAINT_LAW.headerSort`); chrome only: select / actions / `_fill` / `thumb` (Image photo gutter). Outbound `OrdersGridHost` reads `?sort=` — never pass a frozen `sort=`. Ledger:
   `docs/eval/cohorts/slot-table/LEDGER.md` (paint law + KEEP
   `engine:DateRangePickerField` / `engine:DataTableFilterMenu` /
   `engine:slot-table-header-sort` / `engine:queueSortForColumnKey` /
   `engine:ordersCompoundColumnsFor` / `engine:slot-table-session-laws`).
   Session laws (`src/lib/tables/slot-table-session-laws.ts`) are greps for
   recent operator rulings (Dates header, inbound `.price` under title, no
   Orders-only Amount drop). Orders / To-ship: never remount the ⋮;
   copy lives on identity chips. Selecting a row always opens the left Morphing
   menu on To-ship **and** Shipped (`OrdersGridHost`). Gating Morphing on
   `queueMode === 'fulfillment'` is a cohort fail.

   **Discover (hand-model leftovers):** before deleting a `*_GRID_COLUMNS` array
   or emptying `TABLE_COLUMNS`, run:

```bash
pnpm run eval:discover
```

   SoT: `src/lib/tables/slot-table-discover.ts`. Pick **one** unblocked
   `verdict: delete` id. Never delete a KEEP row (engine, materializations,
   field catalogs, layout hooks). After the kill, remove that id from
   `SLOT_TABLE_KNOWN_DEBT` (shrink-only). Judgment rows (Testing History layout
   id, FBA catalog, station-history, support-tickets) stay human.

6. **Shortcut-display cohort** (`?` reveals letters **on the buttons**):

```bash
pnpm run eval:cohort shortcuts -- --skip-verify
pnpm run eval:cohort shortcuts
```

   SoT: `src/lib/keyboard/shortcut-display-cohort.ts`. Staff `?` paints
   `HotkeyGlyph` inside each CTA (`iconRight`). Never a Dialog. Never a
   `title`/popover on the question-mark. If asked to leave keycaps standing
   on buttons, **refuse**. If asked to open a cheat sheet from staff `?`,
   **refuse**. Bind the key (`useSelectionActionHotkeys`). Cheat sheet still
   owns the `?` *key* when no CTA strip is mounted.
   Ledger: `docs/eval/cohorts/shortcuts/LEDGER.md`.

7. **Single-station mouth/domain / overlay shell:** `pnpm run eval:station <id>`.

8. **Cursor `stop` + Hermes Host twin** — shared
   `tools/eval-ledger/machine-gate.mjs` (`pnpm run eval:machine-gate`).
   Cursor: pass = silence; real red = one `followup_message`; timeout = fail
   open. Hermes: `cycleforge-app` defaults `LOOP_VERIFY_COMMAND` to that CLI
   forever (`defaultVerifyCommandForRepo`); local coder gets the same display
   law in `buildRepairPrompt`. **Perf north star 95:** every pass stamps
   `eval:perf-gate` debt (`.cursor/perf-session.json`); live
   `LOOP_PERF=check` / `strict` optional. **Overnight:**
   `pnpm run perf:overnight` (Hermes Host loop until Tier-1 ≥ 95 or max hours).
   Kill switch: `CYCLEFORGE_EVAL_STOP=0`.
   Dry: `CYCLEFORGE_EVAL_STOP=dry` / `--dry-fail`. Tests:
   `pnpm run eval:stop-gate-test`. Optional MLX brief smoke:
   `pnpm run eval:mlx-smoke`.

9. Full Garisek ratchet (optional): from Garisek-OS
   `npx tsx scripts/ratchet-run.ts --repo cycleforge-app --dry-run`

## Examples

- Overlay shell change on Scan-out → `eval:station scan-out` (peers must stay green)
- CompoundItem listing face / slot layout / table filter funnel → `eval:cohort slot-table`
- Select-gutter Morphing missing on Shipped (or gated on To-ship `queueMode`) → `eval:cohort slot-table`. Paint law `SLOT_TABLE_PAINT_LAW.ordersActions`. Impact `OrdersQueueTableRow` / `MorphingRowActionMenu`.
- Compact ship-by in STATUS → `eval:cohort slot-table`. Paint law `SLOT_TABLE_PAINT_LAW.shipBy`. KEEP `engine:DateRangePickerField`. Never a range filter or `type=date`.
- Dead / missing column-header sort on a DataTable → `eval:cohort slot-table`. Paint law `SLOT_TABLE_PAINT_LAW.headerSort`. KEEP `engine:slot-table-header-sort`. Map the track; do not set `sortable:false` on a labeled fact. Image/`thumb` is chrome. Outbound: never pass `sort=` into `OrdersGridHost` (delete the freeze; do not add a Shipped sort path).
- "Show the shortcut on the button" (standing) → **refuse**; teach via `?` inline; `eval:cohort shortcuts`
- Cheat sheet from the table-foot `?` → **refuse**; `eval:cohort shortcuts`
- Hand GRID leftover / dual SoT → `eval:discover` then one DELETE id
- Composer mouth only → `eval:station scan-out`
- Incoming add extract composer (`IncomingAddExtractComposer`) → `eval:station scan-out` (same `StationComposerHost` SoT as Unbox / scan-out; **not** `SCAN_STATION_OVERLAY_COHORT`, **not** `verify:fast` alone)
- Table layout refactor → `--full` + `eval:cohort slot-table`

## Performance Notes

`verify:fast` is the default agent gate. Cohort skip-verify is ~critique+graph only.
See `docs/eval/README.md`.

## Troubleshooting

- Missing script: confirm `eval:cohort` / `eval:discover` / `verify:fast` / `eval:stop-gate-test` / `eval:mlx-smoke` in package.json
- Garisek path: `GARISEK_OS_ROOT` defaults to `/home/michaelgarisek/Projects/Garisek-OS`
- Stop gate noisy: `CYCLEFORGE_EVAL_STOP=0` for this shell; Hooks channel stderr is pass summary only
- MLX unreachable: wake Mac or set `CYCLEFORGE_MLX_BASE`; never fall back to Ollama 7B
