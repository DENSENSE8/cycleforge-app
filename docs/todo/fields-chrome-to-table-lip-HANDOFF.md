# Handoff — Retire chrome Fields → table top-right lip (sole entry)

**Copy everything below the line into a fresh Claude Code / Cursor session.**
Repo: `cycleforge-app` · stay on the checkout’s branch · attach to the user’s
dev server on `:3050` (never start/restart/kill it).
**Do not edit this handoff file** as part of the implementation.

**Prior art (already landed — do not re-build):**

- Table lip + `GridColumnDetailsPanel`: plan
  [`table_lip_column_details_8223d1d8`](../../.cursor/plans/table_lip_column_details_8223d1d8.plan.md)
  (implemented): sticky top-right control on `LedgerGridColumnHeader` opens
  non-modal `detail:grid-column-details` rail (pick column · visibility ·
  highlight · chip). Prefs: `staff_preferences.tableColumns[tableId].display`.
- Chrome Fields altitude (to **retire** for Fields only):
  [`table-action-bar-fields-PLAN.md`](./table-action-bar-fields-PLAN.md) —
  Fields was deliberately put in `WorkbenchTrailingCluster`. This handoff
  **moves** that entry into the table lip. Sort / Import / Add stay in trailing.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

**Remove the Fields control from the workbench top chrome bar**
(`WorkbenchTrailingCluster` `fields=` / `GridFieldsMenu`) and make the
**LedgerGrid top-right header lip** the **sole** operator entry for column
visibility + display across every spreadsheet that already (or should) expose
Fields.

Outcome the operator sees:

1. No `ColumnsThree` / “Fields” button in the page chrome trailing cluster.
2. Every in-scope table shows the same top-right lip (mirror of the select-all
   corner) inside the framed grid card.
3. Clicking the lip opens the existing **Column display** right rail
   (`GridColumnDetailsPanel`) — visibility toggles, highlight, chip mode,
   and **Reset to default** (migrate from the retired Fields popover).
4. One entry point, one rail id, no double-mounted panels.

## Product / SoT frame (hard laws)

- **Navigators push, inspectors float** — the details form stays
  `DetailStackRailRegistrar` `modal={false}` on `RightRailHost`. Never
  invent a third ambient right region or squeeze the grid.
- **No Sheets-like in-card `TableActionBar`** sticky band above the grid —
  the lip lives **inside** the sticky column-header band of `LedgerGrid`
  (already implemented). Do not add a second sticky row.
- **Columns stay product-defined** — staff show/hide + display prefs only;
  no runtime custom columns.
- **Compose from SoT** — grow `LedgerGridColumnHeader` / `GridColumnDetailsPanel`
  / `useGridFields` / `useGridColumnDisplay`. Do not fork a page-local Fields UI.
- **`npm run verify` green** before done; never raise DS / knip baselines.
- User manages commits; no `git stash`; stay on the checkout’s branch.

## Read before writing code

| File | Why |
|---|---|
| `.claude/rules/display/workbench.md` → Trailing Display & Actions | Today still says Fields lives in trailing — **update this law** when chrome Fields is gone |
| `.claude/rules/source-of-truth.md` → Grid column visibility + sort | Update the “staff opt in from `GridFieldsMenu`” line to lip + details rail |
| `.cursor/rules/workbench-sort-chrome.mdc` | Sort → Fields → Import → Add → rewrite to **Sort → Import → Add** (Fields absent) |
| `src/design-system/components/grid/LedgerGridColumnHeader.tsx` | Lip SoT (`data-grid-column-details-lip`, `onOpenColumnDetails`) |
| `src/components/ui/table-column-config/GridColumnDetailsPanel.tsx` | Rail body to grow (Reset) |
| `src/components/ui/table-column-config/GridFieldsMenu.tsx` | **Retire from chrome mounts**; harvest checklist behaviors into the rail |
| `src/components/dashboard/workbench-trailing-cluster.guard.test.ts` | Guard that currently **requires** chrome `GridFieldsMenu` — invert |
| `tests/e2e/grid-fields-menu.spec.ts` | E2E still opens Fields from chrome — retarget to lip |

## Current state (inventory)

### Chrome `GridFieldsMenu` mounts (REMOVE `fields={...}`)

| Surface | File | `tableId` | Column SoT |
|---|---|---|---|
| Outbound / Orders | `src/components/dashboard/OutboundWorkspaceHeader.tsx` | `orders` | `ORDERS_QUEUE_COLUMNS` |
| Incoming | `src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx` | `incoming` | `INCOMING_GRID_COLUMNS` |
| History | `src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx` | `receiving` | `RECEIVING_GRID_COLUMNS` |
| Unbox | `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` | `receiving` | `RECEIVING_GRID_COLUMNS` |
| Repair | `src/components/repair/RepairWorkspaceHeader.tsx` | `repair` | `REPAIR_GRID_COLUMNS` |
| Catalog | `src/components/products/catalog/ProductsCatalogWorkspace.tsx` | `catalog` | `CATALOG_GRID_COLUMNS` |
| Pickup | `src/components/receiving/pickup/PickupWorkspace.tsx` | `pickup` | `PICKUP_GRID_COLUMNS` |
| Today / My Day | `src/features/my-day/MyDayWorkspace.tsx` | my-day table id | `MY_DAY_GRID_COLUMNS` |
| Review catalog-link | `src/features/review/catalog-link/ReviewCatalogLinkTable.tsx` | (see file) | catalog-link columns |

Guard list `IN_SCOPE_MOUNTS` in `workbench-trailing-cluster.guard.test.ts` covers the
first seven (not My Day / Review — extend or replace that list as part of this work).

### Lip already wired (`onOpenColumnDetails` → `GridColumnDetailsPanel`)

| Surface | Grid view |
|---|---|
| Receiving (Unbox / History / Testing) | `ReceivingGridView.tsx` |
| Incoming | `IncomingGridView.tsx` |
| Pickup | `PickupGridView.tsx` |
| Catalog | `CatalogGridView.tsx` |
| Repair | `RepairGridView.tsx` |
| Ready | `ReadyGridView.tsx` |
| Warranty | `WarrantyGridView.tsx` |
| Review catalog-link | `ReviewCatalogLinkGridView.tsx` |

Ready / Warranty already have the lip **and no chrome Fields** — leave them as
the target shape; only ensure rail parity (Reset) and E2E coverage if missing.

### Gaps (must land lip before chrome Fields can leave)

| Surface | Gap |
|---|---|
| **Orders / Outbound** | Chrome Fields exists; header is `OrdersQueueColumnHeader` (**not** `LedgerGridColumnHeader`) — **no lip yet**. Port lip onto the Orders sticky header (same absolute top-right recipe as LedgerGridColumnHeader) **or** thin-adapt Orders onto `LedgerGridColumnHeader` if already feasible. Do not leave Orders with zero Fields entry after chrome removal. |
| **My Day / Today** | Chrome Fields exists; `MyDayGridColumnHeader` has **no** `onOpenColumnDetails`. Wire lip + panel like Receiving. |
| **Review catalog-link** | Has lip in grid view **and** Fields in chrome table host — remove chrome mount only after confirming lip + panel use the same `tableId` / full column list. |

## Target UX (locked)

```
WorkbenchChromeHeader trailing:
  before? → Sort → Import/Add actions → after?
  (NO fields=)

LedgerGrid sticky header band:
  [select lip] … columns … [Column display lip] ──click──► RightRailHost
                                                              GridColumnDetailsPanel
```

**Rail contents (grow existing panel — do not invent a second):**

1. Column list (all hideable fields) — already there  
2. Visible `Switch` — already there  
3. Highlight · Display (chip) — already there  
4. **Reset to default** — migrate from `GridFieldsMenu` popover (`useGridFields().reset`) when `dirtyCount > 0`  
5. Done — already there  

**Optional:** keep a compact multi-toggle list in the rail (checkmarks for every
field, menu stays “open” mentally as the rail). Prefer enhancing the existing
column list + Switch over resurrecting a chrome popover.

**Retire:** `GridFieldsMenu` chrome mounts. After all call sites are gone, either
delete `GridFieldsMenu.tsx` or reduce it to a thin deprecated re-export that
throws in dev if mounted — prefer **delete** once knip/guards are green.

## Workstreams (land in order)

### A — Grow the rail (Reset + sole-entry copy)

1. `GridColumnDetailsPanel`: add Reset (same semantics as Fields popover) when
   `dirtyCount > 0`; wire `useGridFields().reset`.
2. Ensure only the **grid view** mounts the panel (one registrar). Remove the
   nested panel mount inside `GridFieldsMenu` when that component is deleted
   (today Fields menu also mounts `GridColumnDetailsPanel` — dual entry).

### B — Wire missing lips (Orders · My Day)

1. **Orders:** add top-right lip to `OrdersQueueColumnHeader` (or promote onto
   `LedgerGridColumnHeader`). Open `GridColumnDetailsPanel` from
   `OrdersGridView` / dashboard host with `tableId="orders"` +
   `ORDERS_QUEUE_COLUMNS` (full list).
2. **My Day:** add `onOpenColumnDetails` to `MyDayGridColumnHeader` →
   `LedgerGridColumnHeader`; mount panel in `MyDayGridView` (or workspace) with
   my-day `tableId` + full columns. Then remove chrome Fields from
   `MyDayWorkspace`.

### C — Strip chrome Fields from every trailing cluster

For each file in the inventory table above:

1. Remove `fields={<GridFieldsMenu … />}`.
2. Remove unused `GridFieldsMenu` imports.
3. Leave `WorkbenchTrailingCluster` in place for Sort / actions (honest absence
   of `fields` is correct).

### D — Rewrite law + guards + E2E

1. **`.claude/rules/display/workbench.md`** — Trailing cluster becomes
   **Sort → Import → Add**. Column display entry = table lip →
   `GridColumnDetailsPanel`. Update the Fields-icon-only / dirty-badge sentences
   to describe the lip.
2. **`.claude/rules/source-of-truth.md`** — visibility SoT row: lip +
   `useGridFields` / `useGridColumnDisplay` / `GridColumnDetailsPanel` (not
   chrome `GridFieldsMenu`).
3. **`.cursor/rules/workbench-sort-chrome.mdc`** — drop Fields from the order;
   point to the lip.
4. **`workbench-trailing-cluster.guard.test.ts`**:
   - Stop requiring `fields={<GridFieldsMenu` on `IN_SCOPE_MOUNTS`.
   - **Ban** `GridFieldsMenu` inside any `WorkbenchTrailingCluster` / workspace
     header under `src/components` + `src/features` (except tests).
   - Optionally require `onOpenColumnDetails` / `data-grid-column-details-lip`
     for every surface with `fieldsMenu: true` (pair with
     `grid-surface-capabilities.guard.test.ts`).
5. **`tests/e2e/grid-fields-menu.spec.ts`** (rename if useful):
   - Open via `[data-grid-column-details-lip]` button, not chrome Fields.
   - Assert region `Column display`.
   - Keep visibility / persistence / reset / frozen-pane coverage.
   - Drop or rewrite “Add a column” chrome-menu steps (that row dies with
     `GridFieldsMenu`).

### E — Verify

`npm run verify` green. Spot-check on `:3050`: History, Unbox, Incoming,
Outbound Pending, Catalog, Pickup, Repair, Ready, Warranty, Today — chrome has
no Fields icon; lip opens the rail; Reset works; Orders not left without an
entry.

## Explicit non-goals

- Moving Sort / Import / Add into the table lip  
- Sticky-right **body** gutter column on every row  
- Custom/runtime columns  
- Reintroducing `TableActionBar`  
- Raising knip / DS ratchet baselines  
- Editing this handoff file during implementation  

## Definition of done

- [ ] Zero production mounts of `GridFieldsMenu` in workbench chrome  
- [ ] Every `fieldsMenu: true` LedgerGrid (plus Orders) has a working top-right lip  
- [ ] Column display rail owns visibility + highlight + chip + Reset  
- [ ] SoT docs + trailing-cluster guard + E2E updated  
- [ ] `npm run verify` passes  

## Paste prompt (short)

> Read `docs/todo/fields-chrome-to-table-lip-HANDOFF.md` and execute workstreams
> A→E. Do not re-open altitude decisions: Fields leaves chrome; the table
> top-right lip is the sole entry; rail stays non-modal `GridColumnDetailsPanel`.
> Verify by call sites, not docblocks. `npm run verify` before done.
