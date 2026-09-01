---
name: code-graph
description: >-
  Route non-trivial Cycle Forge edits through Garisek code-graph. Use before
  changing shared components, hooks, table layouts, scan-station overlay shells,
  slot-table engine (CompoundItem / CompoundState / DateRangePickerField compact
  ship-by / useSlotTableLayout), or when code-graph MCP tools are missing from
  the agent catalog.
---

# Code graph

## Instructions

1. Before editing a shared symbol, call `find_symbol` (or `search_code` if unsure of the name).
2. Run `impact_analysis` on the returned `node_key` before changing signatures or props.
3. For behavioural questions, prefer `search_code` with a plain-language query.
4. **Scan-station overlay shell:** SoT is `SCAN_STATION_OVERLAY_COHORT` (all peers).
   Before changing any cohort workspace, `find_symbol` + `impact_analysis` on
   **that station and at least one peer**, or run `pnpm run eval:station <id>`.
   Display eval is slot-table only — there is no `eval:cohort overlay`. Do not
   assume Unbox-only callers.
5. **Slot-table engine:** SoT is `slot-table-cohort.ts` (engine + PRODUCT_TABLES).
   Before editing CompoundItem / `useSlotTableLayout` / materialize / listing util /
   STATUS ship-by, impact **engine** symbols (`CompoundItem`, `CompoundState`,
   `DateRangePickerField`, `useSlotTableLayout`, `materializeTracks`,
   `getExternalUrlByItemNumber`) — not `OrdersQueueTableRow` alone — or run
   `pnpm run eval:cohort slot-table`. Compact ship-by is `DateRangePickerField`
   `variant="compact"` on `CompoundState`; the write is `useOptimisticMutation`
   in `useOrderAssignment`. Before deleting a family `*_GRID_COLUMNS`, run
   `pnpm run eval:discover` and follow the KEEP column.
6. **Shortcut-display / keybinds:** SoT is `shortcut-display-cohort.ts`.
   Impact `KeyboardShortcutsCheatSheet` / `TableStatusBar`, or run
   `pnpm run eval:cohort shortcuts`. Staff `?` reveals letters inline on Buttons.
7. If `GetDynamicTools` finds no code-graph tools, use the CLI from Garisek-OS:

```bash
export CODE_GRAPH_TARGET_REPO="$(pwd)"
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs stats"
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs find ScanOutWorkspace"
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs impact '<node_key>'"
```

8. Default indexed project: `cycleforge-app`.

## Examples

- Shared primitive → `find_symbol Button` → `impact_analysis`
- Overlay shell → `eval:station <id>` or find each peer `*Workspace` / `TechRightPane`
- Slot table paint → `find_symbol CompoundItem` → `impact_analysis` or `eval:cohort slot-table`
- Slot-table ship-by / in-cell date → `find_symbol DateRangePickerField` and `CompoundState` (STATUS delay). Write is `useOptimisticMutation`. Not `calendar`, not `InlineEditableValue`.
- Keybinds / `?` overview → `find_symbol KeyboardShortcutsCheatSheet` or `eval:cohort shortcuts`
- Stale graph → rebuild from Garisek-OS `index-cli.mjs`

## Performance Notes

Semantic search embeds the query (~200ms). `find_symbol` is cheaper when you know the name.
Session stamp: `.cursor/code-graph-session.json` (gitignored).

## Troubleshooting

- Catalog empty: run CLI; reload window; toggle MCP in Settings.
- Smoke: `node "$GARISEK_OS_ROOT/tools/code-graph/verify-clients.mjs"`
