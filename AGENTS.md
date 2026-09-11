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

## Mobile-first (repo-wide)

**Every operator verb must be completable on `/m/*` first.** Desktop desks,
stations, and kiosk faces consume that SoT (phone-width frame + gutters /
compact recents) — they do not invent a second IA phones cannot run. Scope is
the whole product, not Warehouse OS alone.

Callers: all agents. No API/schemas.
User: "span repo-wide" / "do everything on the mobile app first."

- Law: [`docs/mobile-first/SURFACE_LAW.md`](docs/mobile-first/SURFACE_LAW.md)
- Cursor: `.cursor/rules/mobile-first-surface.mdc` (`alwaysApply`)
- Checklist: `src/lib/mobile/mobile-first-surface.ts`
- Start Pick: `/m/pick` · session `/m/pick/[orderId]` · Orders `/m/work`
- Refuse “desktop-only; mobile later” and desktop-shrunk desks called mobile-first.

## Composer / station mouth naming

- "Omni Composer", "station composer", "station mouth" → **StationComposerHost**.
- `OmnichannelComposerDock` alone is the outline — incomplete mouth.
- "No modes" / dumb gun station → `showModeRow` + `showModeFaces={false}`
  (keep the bottom-right context ring). Never `showModeRow={false}` to hide faces.

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

## Staff combobox

Every people picker is `AssigneeCombobox` via `StageStaffAssignPopover`. Rows
paint `StaffAvatar` + name. Never `SearchableSelectField` for staff (name + role
meta, no profile mark). Graph: `AssigneeCombobox` + `StageStaffAssignPopover`.
Eval: `pnpm run eval:cohort slot-table`.

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
   Hand GRID leftovers: `pnpm run eval:discover` (`slot-table-discover.ts`).
   Delete only unblocked DELETE ids; never KEEP (engine, `*COMPOUND_COLUMNS` /
   `*SHEET_COLUMNS` materializations, catalogs, layout hooks, `DateRangePickerField`,
   `DataTableFilterMenu`).
6. **Shortcut-display cohort:** SoT is staff `?` **inline on the buttons**
   (`src/lib/keyboard/shortcut-display-cohort.ts`). After shortcut / `?` /
   TableStatusBar hotkey edits run `pnpm run eval:cohort shortcuts`. If asked
   to leave keycaps standing on buttons, **refuse**. If asked to open a cheat
   sheet from the staff `?`, **refuse**. Bind the key; `?` paints `HotkeyGlyph`
   inside the Button next to the label. No `title`/popover on the question-mark.
   KeyboardShortcutsCheatSheet still owns the `?` *key* when no CTA strip is
   mounted. Exception: ⌘; reveal-on-arm (`NAV_KEY_HINT_CLASS`) and ScanHotkeyControl bind-edit.
