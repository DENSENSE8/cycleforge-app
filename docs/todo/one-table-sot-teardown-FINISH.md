# FINISH — the teardown's remaining survivors

Read `docs/todo/one-table-sot-teardown-HANDOFF.md` first (§2 corrections, §4
delete list, §9 done). The teardown landed; a verification pass then found what
follows. **`npm run verify` is green right now — keep it that way.**

Repo runs on `pnpm` (`npx --yes pnpm@11.5.1 install --frozen-lockfile` if
`node_modules` is empty; `npm ci` fails, the npm lockfile is stale). Work on
`main`. Do not commit unless asked. Other sessions edit this checkout — if a
file you did not touch goes red, re-run before "fixing" it.

## Already done (do not redo)

In-cell editing is out of the orders row, `CustomFieldCell` and
`cell-editors.tsx`'s two popovers are unmounted, and the condition cell is
read-only.

## Left to do, in order

### 1. Finish killing in-cell editing (§4.2 said it goes)

Deleting `LedgerCellEditor.tsx` did not delete the feature. Still live:

- `src/components/dashboard/orders-queue/cell-editors.tsx` — now unmounted;
  delete the file.
- `src/components/receiving/unfound/grid/UnfoundGridRow.tsx:76` and
  `src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx:115`
  — **dead edit state**: `editing` / `editSeed` / `closeEditor` plus the
  click/Enter/F2 handlers that set them. The editor they opened is gone, so
  these are controls that look live and do nothing. Remove the state, the
  handlers, and any `tabIndex` / `aria-label` that advertised editability.
- `inCellEdit: true` still declared in three descriptors — the capability is now
  a lie. Set `false`:
  `orders-queue-descriptor.ts:27`, `csv-import-staging-grid-descriptor.ts:35`,
  `unfound-grid-descriptor.ts:33` (fix the docblocks above them too — they
  explain why the flag is load-bearing, which is no longer true).

### 2. Per-column display prefs are unreachable — remove them

The rail that WROTE them was deleted; nothing writes them now, so every read
returns a preference no operator can set.

- `src/design-system/components/grid/useGridColumnDisplay.ts` + its
  `grid-column-display` reads.
- `columnDisplay` threading: `useOrdersSpreadsheet.tsx:206,326`,
  `ReceivingGridHost.tsx:261,354`, and the receiving cells that take it
  (`receiving-grid/cells/*`).
- Then re-check `grid-column-display.ts` / `useGridRowFills` /
  `GridRowPaintTrigger` for orphanhood and delete what has no consumers.

### 3. "All" is not a tab (§2.2) — two desks still pass one

`DataTable`'s own docblock forbids it; these violate their own contract:

- `src/components/tech/shipping/ShippingWorkspaceView.tsx:49`
- `src/components/tech/testing/TestingWorkspaceView.tsx:21`

Drop the `{ id: 'all' }` entry; the default body lights no tab and clicking the
lit tab clears back to it (copy the pattern from `useToShipChrome.ts`).
`ShippingWorkspaceView` also has leftover unused `controlsEl` state — remove it.

### 4. The find field still has a paste button (§2.1)

§2.1: *"no funnel, no chips, no paste button, no inline content."* The three
named slots are gone but `SearchField`'s clipboard button, `pasteVisibility`,
`pasteOnlyTrailing` and `customTrailingSlot` remain. Remove the paste
affordance and its props; Cmd/Ctrl+V still works. Check every call site.

`rightElement` is **fine** — it renders outside the form, beside the field,
which is what § 2.1 asks for. Leave it.

### 5. Delete the orphans

Zero consumers (`npx knip --no-exit-code` confirms):
`PackedExportButton.tsx`, `PackedOrdersTable.tsx` (its only "consumer" is a
docblock `{@link}` in `DashboardShippedTable.tsx` — fix that line too),
`GridRowPaintTrigger.tsx`, `StationRightEdgeAction.tsx`, and the dead
`grid/index.ts` re-exports (`GRID_COLUMN_TEXT_EMPHASIS_OPTS` and the
formatting/resize/editability leftovers).

### 6. Rewrite 9 e2e specs — nothing has run against the rebuild

`npm run verify` is lint+typecheck+unit only, so no Playwright spec has executed.
Four use selectors that no longer exist:

- `tests/e2e/sheet-chrome-to-ship.spec.ts` (the whole deleted toolbar)
- `tests/e2e/grid-column-display-hover.spec.ts`
- `tests/e2e/my-day-today.spec.ts` (`data-grid-column-details-trigger`)
- `tests/e2e/station-history-dock.spec.ts`

Five more only mention deleted names in comments — fix the prose:
`receiving-tech-modes`, `audit-pack-queue-membership`, `incoming-bulk-tracking`,
`search-station-layout`, `sidebar-nav-search`.

New testids: `data-table-toolbar`, `data-table-status`, `data-table-row-count`,
`data-table-selected-count`, `data-table-tab-<id>`, `data-table-filter`,
`data-table-filter-menu`, `data-table-copy-selection`, `filter-menu-trigger`,
`filter-menu`.

Run them on a lane of your own: `next start -p 3100` + `PW_BASE_URL`, and
`pkill -f "next start -p 3100"`. **`:3050` and `usav-dev` are the operator's —
never start, restart or kill them, never delete `.next/`.**

### 7. Bigger, do last — FBA board skipped the rebuild

`src/components/fba/FbaBoardTable.tsx:372` mounts `<LedgerGrid>` directly even
though `FBA_BOARD_TABLE_BINDING` is registered. It is the one registered binding
not going through `DataTable`. It is a board, not a queue, so this is real work
— scope it before starting.

## Known-outstanding, not a bug

47 lines of stale PROSE name deleted components (`TechRailSearchBar` 25,
`LedgerCellEditor` 13, `workbench-shell` 5, `OrdersDrillHost` 3,
`WorkbenchSheetView` 1). Zero are live code. Worth fixing when you touch the
file; do not make a sweep of it. If the count rises, someone added a new lie.

## Done means

`npm run verify` green · `npm run build` green · the checks in
`docs/todo/one-table-sot-teardown-VERIFY.md` come back CLEAN.
