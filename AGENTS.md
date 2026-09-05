When writing, modifying, or reviewing UI code, you MUST consult the CycleForge
design system **before** implementation:

1. Prefer native MCP tools `ds_contract`, `ds_tokens`, `ds_critique` when they
   appear in the tool catalog (`design-mcp` or a `plugin-*-design-mcp` namespace).
2. If `GetDynamicTools` finds no `ds_*` tools, call the CLI (same handlers):
   `node tools/design-mcp/ds.mjs contract "<job>"`
   `node tools/design-mcp/ds.mjs tokens <axis>`
   `node tools/design-mcp/ds.mjs critique <file>`
3. Do not guess Tailwind classes, corner radii, or component paths.
4. Project hooks deny UI writes under `src/**/*.{tsx,jsx,css}` without a fresh
   design-mcp session stamp.
5. The engine lives in Garisek-OS (`DESIGN_MCP_PROJECT=cycleforge-app`); the law
   stays here (`pinned.json`, cohorts, `router.json`, `design-mcp.profile.json`).
   `ds_adjudicate` answers "would this be allowed?" with the SAME rules the
   write gate enforces on Cursor and Claude Code: every router `refuse[]` with a
   `diffPattern` (`sortable: false` on a fact, native `type="date"`,
   `showModeRow={false}`, `FilterRefinementBar`, …). Engine-file writes also
   need a fresh `find_symbol` → `impact_analysis` stamp (`cg.mjs stamp` alone is
   refused), and `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`,
   `docs/eval/sessions/**` are never agent-writable.

## Composer / station mouth naming

- "Omni Composer", "station composer", "station mouth" → **StationComposerHost**.
- `OmnichannelComposerDock` alone is the outline — incomplete mouth.
- "No modes" / dumb gun station → `showModeRow` + `showModeFaces={false}`
  (keep the bottom-right context ring). Never `showModeRow={false}` to hide faces.
- Feedback / reaction / receive confirm on that mouth → **WeldedFeedbackPanel**
  (`@/components/composer/WeldedFeedbackPanel`) on `StationComposerHost` `reaction`
  (`ds_contract "staff reaction on the composer"`). Staff look at the mouth all
  day for what just happened and what to process next. Never a second card,
  caption band, toast, popover, or a new hinge. Dockless workbench feedback
  stays `InlineActionFeedbackCard`.

## Floor stations

Clone Pack / Unbox station chrome first. Do not invent a left recent rail unless
explicitly asked. Prefer a thin adapter around `StationComposerHost`; do not
invent `*NotesComposer` shells or a second scan bar. Scan-station materials come
from `ds_tokens({ axis: "station-skin" })` (`applyStationSkin`); do not hex-fill
a well or fork a packing-bench class on one station.

## Dates / ship-by

Slot-table ship-by, due date, or pick-a-date-in-a-cell is
`DateRangePickerField variant="compact"` (`ds_contract` returns `pickVariant` +
`mount`). Not `variant="range"` (filter: presets + Apply + X + year). Not a
native `input type=date`. Not `InlineEditableValue`. Graph: `CompoundState` +
`DateRangePickerField`. Eval: `pnpm run eval:cohort slot-table`.

## Center Lock (Q5)

Desk record edits stay on the table tile — eyes never leave the center. L1 =
in-cell (`DateRangePickerField variant="compact"`, `InlineEditableValue`). L2 =
`DeskStageOverlay` on the stage (`ds_contract "edit a row on the desk table"`).
Forbidden on desks: `RightRailHost detail:*`, new `DeskRecordWalkHost`, Dialog
as record plane. Scan stations: Displays stay right; table stays visible under
overlay. Classifier: `docs/warehouse-os/PLAN-center-lock.md`.

## One table engine (never fork a table, a column, or a verb)

`src/lib/tables/table-engine-law.ts` is the law; `table-engine-law.test.ts` is
the tripwire (runs under `pnpm run eval:cohort slot-table`).

1. **One engine, generic over the row.** Polymorphism lives in the ADAPTER
   (`row -> CompoundRowView`, strings and enums only). A family contributes an
   adapter + a column array. Never a cell, never a row component, never a host.
2. **Register to ENTITIES, mount on pages.** One entity -> one registration ->
   many mounts. Scope, lane lock and layout are parameters of the MOUNT
   (`/shipping/exceptions` is `tableId: 'orders'` with a different row source).
   A registration keyed by page is a fork.
3. **The descriptor carries DATA, never BEHAVIOR.** No render props, no
   per-family cell, no override hook. If a mount needs behaviour the engine
   lacks, the engine gains it for everyone or the mount does without.
4. **Verbs bind to FIELDS, not to lanes.** Declare an action ONCE in the
   family's verb catalog (`VERB_CATALOG_MODULES`), naming the field it writes.
   It is offered wherever the mounted layout resolves that field; its direction
   (do / undo / already-done) comes from row STATE, never from the route.
   Bulk is a cardinality, not a mode — the row menu is the same catalog at n=1.
   A reversible verb is ONE verb with two directions.

Adding a backend table = a field catalog + a resolver + an adapter + a registry
entry. **Zero new `.tsx`.** If you must touch a component to add a table, the
ENGINE is missing a capability — fix that, and say so.

Never add a `SelectionAction` literal at a page or a mount. Never add a per-lane
action key list. Both fail the cohort.

## Code graph (Garisek-OS)

Before non-trivial edits to shared components, hooks, or table infrastructure:

1. Prefer MCP tools `find_symbol` → `impact_analysis` when they appear in the
   catalog (`code-graph` or a `plugin-*-code-graph` namespace).
2. If the catalog is empty, use the CLI (same handlers):
   `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs find <SymbolName>`
   `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs impact <node_key>`
3. Default indexed project: `cycleforge-app` (`CODE_GRAPH_PROJECT` in `.cursor/mcp.json`).

## Eval engineering

Before claiming a coding task is done:

0. **Read the receipt, do not run the gate.** Every commit gets a receipt
   from the self-hosted runner (`.ci/receipts/<sha>.json`, plan
   `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §3). Run
   `node scripts/ci-status.mjs` for HEAD's gates (lint · typecheck · unit ·
   cohorts, cache hit/ran) instead of re-running the full profile in your
   session; run `verify:fast` only on the files you just touched. Gates
   declare their inputs in `scripts/verify-profile.mjs` — a new gate with no
   `inputs` fails `src/lib/ci/ci-core.test.ts`.
1. Run `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
2. On failure: fix or report — do not claim done.
3. Cross-cutting refactors: use `--full` instead of `--fast`.
4. **Floor stations / overlay shell:** SoT is `SCAN_STATION_OVERLAY_COHORT`
   (all peers). Mouth/domain + shell: `pnpm run eval:station <id>`. Display
   eval is **slot-table only** — there is no `eval:cohort overlay`. Never delete
   cohort-law `visibility` / `zIndex.panel` styles to silence critique.
5. **Slot-table cohort (the only display eval):** SoT is engine + `PRODUCT_TABLES`
   (`src/lib/tables/slot-table-cohort.ts`). After CompoundItem / slot-layout /
   STATUS ship-by / DataTable funnel edits run `pnpm run eval:cohort slot-table`
   — not To-ship alone. Ship-by is `DateRangePickerField variant="compact"`.
   Filter icon is `DataTableFilterMenu` beside search (always mounted; idle
   chrome when a family has no facets). Never `FilterRefinementBar` / hunt tiles.
   Every painted DATA column header is click-to-sort (`SLOT_TABLE_PAINT_LAW.headerSort`);
   chrome only is `select` / `actions` / `_fill` / `thumb` (Image photo gutter). The toolbar sort menu lists the
   same facts (`queueColumnSortOptions`) — Pick/Status are rows, not trigger-only.
   After header-sort / `queueSortForColumnKey` edits run `pnpm run eval:cohort slot-table`.
   Graph: impact `queueSortForColumnKey`
   and `LedgerGridColumnHeader`, not one desk row. KEEP `engine:slot-table-header-sort`.
   Outbound `OrdersGridHost` never passes a frozen `sort=` — `useQueueDisplaySort` / `?sort=` is the SoT (passing `sort` made Shipped headers inert).
   Orders / To-ship never remounts the shared actions ⋮ — impact `ordersCompoundColumnsFor`. KEEP `engine:ordersCompoundColumnsFor`. Copy lives on CompoundFulfillment chips.
   Selecting a row always opens the left Morphing menu on every outbound `OrdersGridHost` lane (To-ship **and** Shipped). `queueMode` must not disable it. Graph: impact `OrdersQueueTableRow` / `MorphingRowActionMenu`.
   Hand GRID leftovers: `pnpm run eval:discover` (`slot-table-discover.ts`).
   Delete only unblocked DELETE ids; never KEEP (engine, `*COMPOUND_COLUMNS` /
   `*SHEET_COLUMNS` materializations, catalogs, layout hooks, `DateRangePickerField`,
   `DataTableFilterMenu`, `slot-table-header-sort`, `queueSortForColumnKey`,
   `LedgerGridColumnHeader`, `ordersCompoundColumnsFor`).
6. **Shortcut-display cohort:** SoT is staff `?` **inline on the buttons**
   (`src/lib/keyboard/shortcut-display-cohort.ts`). After shortcut / `?` /
   TableStatusBar hotkey edits run `pnpm run eval:cohort shortcuts`. If asked
   to leave keycaps standing on buttons, **refuse**. If asked to open a cheat
   sheet from the staff `?`, **refuse**. Bind the key; `?` paints `HotkeyGlyph`
   inside the Button next to the label. No `title`/popover on the question-mark.
   KeyboardShortcutsCheatSheet still owns the `?` *key* when no CTA strip is
   mounted. Exception: ⌘; reveal-on-arm (`NAV_KEY_HINT_CLASS`) and ScanHotkeyControl bind-edit.
