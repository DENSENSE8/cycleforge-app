---
name: design-mcp
description: >-
  Route Cycle Forge UI work through design-mcp. Use when building or editing
  React UI, composers, stations, tokens, dates, ship-by, or when ds_contract/
  ds_tokens/ds_critique are missing from the agent tool catalog. In-cell /
  ship-by / due date is DateRangePickerField variant=compact (ds_contract
  returns pickVariant + mount) — never the range filter, never type=date.
---

# Design-mcp

## Instructions

1. Before any UI write, call `ds_contract` with the job in plain words.
2. Call `ds_tokens` for each visual axis you will touch (`radius`, `color`, `station-skin`, …).
3. After editing a UI file, call `ds_critique` on that path.
4. If `GetDynamicTools` finds no `ds_*` tools, use the CLI:

```bash
node tools/design-mcp/ds.mjs contract "dumb station scan mouth"
node tools/design-mcp/ds.mjs tokens radius --filter surface
node tools/design-mcp/ds.mjs tokens station-skin --filter porcelain
node tools/design-mcp/ds.mjs critique src/components/outbound/scan-out/ScanOutComposerDock.tsx
```

5. Naming: Omni Composer = `StationComposerHost`. Dumb station =
   `showModeFaces={false}` (keep context ring). Clone Pack/Unbox; no invented rails.

## Examples

- Floor scan mouth → contract intent `dumb station scan mouth gun only context ring`
- Unbox mouth → mount `StationComposerHost` with faces on
- Feedback / reaction / receive confirm on the composer → `ds_contract "staff reaction on the composer"` → mount `WeldedFeedbackPanel` from `@/components/composer/WeldedFeedbackPanel` on `StationComposerHost` `reaction` (any mode) with dock `weldTop`. Staff look at the mouth all day for what just happened and what to process next. Never a caption band, second card, toast, popover, or a new hinge. Dockless workbench feedback stays `InlineActionFeedbackCard`.
- Ship-by / due date / pick a date in a cell → `ds_contract "ship-by date in a table cell"` → mount `DateRangePickerField variant="compact"` (never the range filter, never `input type=date`, never InlineEditableValue). Filter ranges stay `variant="range"`.
- Filter a DataTable / Unbox Queue funnel → `ds_contract "data table filter icon"` → mount `DataTableFilterMenu` beside search (never FilterRefinementBar, never a hunt-tile strip)
- DataTable column header sort → every painted DATA header is click-to-sort (`SLOT_TABLE_PAINT_LAW.headerSort`). Chrome only: select / actions / `_fill`. Image is DATA.
- Scan-station theme → `ds.mjs tokens station-skin` then `applyStationSkin(name)` — never hex a well
- Token lookup → `ds.mjs tokens elevation` before `elevationClass`

## Performance Notes

CLI cold-starts the stdio server (~1–2s). Prefer native MCP when available.
Session stamp lives at `.cursor/design-mcp-session.json` (gitignored).

## Troubleshooting

- Catalog empty: run CLI; confirm Settings → MCP shows design-mcp green; reload window after `workspaceOpen` plugin load.
- UI write denied by hook: run a contract/tokens call to refresh the stamp.
- Smoke: `node tools/design-mcp/smoke.mjs`
