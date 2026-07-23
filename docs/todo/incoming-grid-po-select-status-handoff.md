# Handoff — Incoming LedgerGrid: PO group select-all + Status column + no “lines” copy

**For:** next coding agent  
**Lane:** `main` (WS-DOGFOOD)  
**Surface:** `/incoming` → `ReceivingLinesTable` → `IncomingGridView` → `LedgerGrid`  
**Status:** **RESOLVED (2026-07-22)** — group select-all, Status column, no “lines”
copy, and editable leaf Product Title (Pending `LedgerCellEditor` parity).

---

## Resolution (2026-07-22)

1. **Group select** — `IncomingGridGroupSummary` select track checkbox;
   `handleSelectGroup` on `useReceivingRowSelection`; expand-then-bulk via
   controlled `CollapsibleGroupRow`.
2. **Status column** — `status` key in `INCOMING_GRID_COLUMNS` after condition
   (`hideKey: 'rest'`); `IncomingGridStatusCell`; sort in
   `compareIncomingGridRows`; icons removed from title.
3. **No “lines”** — dropped `{n} lines` from group title cell; still omit
   `count` on `CollapsibleGroupRow`.
4. **Editable title** — leaf `IncomingGridRow` title cell uses
   `LedgerCellEditor`; PATCH `/api/receiving-lines` `item_name` (+ catalog
   `productTitle` when `sku_catalog_id`); optimistic cascade via
   `dispatchLineUpdated`. Group PO identity title stays display-only.

---

## Prompt (paste into a new agent session)

```
You are fixing three Incoming POS LedgerGrid gaps on /incoming. Do NOT edit this
handoff file except to mark items done. Stay on the current branch/worktree.
Run npm run verify before claiming done. User manages commits.

## Context (already landed)

Incoming POS composes LedgerGrid via IncomingGridView (NOT OrdersGridView):
  IncomingWorkspaceHeader + IncomingKpiStrip
    → IncomingGridView
      → LedgerGrid (scrollX, gridSkin="airtable")
        → IncomingGridColumnHeader / IncomingGridGroupRow / IncomingGridRow

Column SoT: src/lib/receiving/incoming-grid-layout.ts
  Current scan: select · title · date · age · qty · condition · platform · order · tracking
  Click-to-sort: client-side in IncomingGridView (compareIncomingGridRows).
  Delivery-state icons currently ride the Product Title cell (Status column was
  dropped when aligning to ORDERS_QUEUE_COLUMNS — restore it as its OWN column).

Multi-line POs fold via IncomingGridGroupRow → CollapsibleGroupRow
  (summary = IncomingGridGroupSummary; children = IncomingGridRow leaves).
CollapsibleGroupRow header click ONLY toggles expand — it never selects
(see CollapsibleGroupRow.tsx docblock). Group summary select gutter is empty.

## Goals (do all three)

### 1) PO group header — select checkbox on the far left

Problem: multi-line PO collapsed headers have no checkbox in the select column.
Child line rows do. Screenshot: nested rows under a fold lack a usable group-level
select.

Required behavior:
- IncomingGridGroupSummary MUST render a real checkbox in the `select` track
  (same chrome as IncomingGridRow / Pending QueueGroupRow).
- Clicking that checkbox (stopPropagation so it does not fight expand):
  a) expands the fold if collapsed
  b) selects ALL child ReceivingLineRow ids in the group (bulk)
  c) clicking again when all selected → clear those ids from the set
- Indeterminate state when some-but-not-all children are selected.
- Wire through IncomingGridGroupRow → IncomingGridView using existing
  useReceivingRowSelection / RECEIVING_SELECTION_SCOPE / selectedIds.
  Prefer extending the selection helper (emitSelection / toggle set) over a
  parallel select system. Look at how OrdersGridView / QueueGroupRow handle
  fold selection if any; otherwise grow receiving selection.
- selectMode pencil: when selectMode is on, group checkbox is always visible
  (same as leaf rows). When selectMode is off, match leaf-row gutter behavior
  (empty spacer OR always-on Airtable gutter — stay consistent with
  IncomingGridRow / IncomingGridColumnHeader select-all).

### 2) Status must be its own sortable column

Problem: delivery status (DeliveryStateIcon + seller/carrier confidence) was
folded into the Product Title cell. Operator needs a dedicated Status column
that sorts.

Required:
- Grow INCOMING_GRID_COLUMNS to include `status` again. Suggested scan order
  (keep SoT family; Status is receiving-specific):
    select · title · date · age · qty · condition · status · platform · order · tracking
  OR place status where the old Status track was (after condition).
- Header: label "Status", type tag, sortable, hideKey: 'rest' (receiving
  TableColumnConfig already has rest).
- Leaf + group summary: render DeliveryStateIcon (+ seller / city chips) ONLY
  in the status cell — remove them from the title cell.
- compareIncomingGridRows: add `status` case (delivery_state string + confidence
  as secondary). Default dir asc.
- Update incoming-grid-layout.test.ts keys list + sort coverage.

### 3) Never show “N lines” (or “lines to customer”) operator copy

Problem: IncomingGridGroupSummary paints `{rows.length} lines` next to the
title. Operator language must not say “lines” when the fold is N products on
one PO (e.g. 2 products ≠ “2 lines” customer-facing wording).

Required:
- Delete the `{rows.length} lines` span (and any similar “lines” badge) from
  IncomingGridGroupSummary / CollapsibleGroupRow countLabel for Incoming.
- If a count is useful, use product-scoped wording only when needed
  (e.g. tooltip “2 products”) — prefer silence in the grid cell; the expanded
  children already show each product. Do NOT invent a second visual language.
- CollapsibleGroupRow: Incoming already omits `count` prop — keep it that way
  (do not pass countLabel="lines").

## Out of scope

- History / Unbox embedded / board layout
- Server `?sort=` IncomingSort (zoho_newest …) — do not collide; keep client
  column sort local to IncomingGridView
- Rewriting OrdersGridView / ORDERS_QUEUE_COLUMNS
- Committing / pushing unless asked

## Files to touch (expected)

- src/lib/receiving/incoming-grid-layout.ts          (+ status column)
- src/lib/receiving/incoming-grid-compare.ts         (+ status sort)
- src/lib/receiving/incoming-grid-layout.test.ts
- src/components/station/incoming-grid/IncomingGridColumnHeader.tsx
- src/components/station/incoming-grid/IncomingGridRow.tsx
- src/components/station/incoming-grid/IncomingGridGroupSummary.tsx  (select + status + drop “lines”)
- src/components/station/incoming-grid/IncomingGridGroupRow.tsx      (pass select handlers / expand)
- src/components/station/incoming-grid/IncomingGridView.tsx          (wire selection helpers)
- src/components/station/useReceivingRowSelection.ts and/or
  receiving-lines-table-helpers.ts                   (select-all-in-group if needed)

## Acceptance

1. Multi-line PO fold header shows a left checkbox; click → expands + all child
   lines selected; mixed → indeterminate; click again → clears group selection.
2. Status column visible, sortable (chevron), sorts rows by delivery_state.
3. No “lines” / “N lines” string in Incoming grid UI for multi-product POs.
4. npm run verify green.

## Manual check

/incoming with a multi-SKU PO: fold header checkbox, expand, bulk select bar,
Status column sorts, Product Title clean (no status icons / no “2 lines”).
```

---

## Grounding (file:line as of 2026-07-22)

| Concern | Where |
|---|---|
| Column SoT | `src/lib/receiving/incoming-grid-layout.ts` — no `status` key today |
| Group fold | `IncomingGridGroupRow.tsx` → `CollapsibleGroupRow` (expand only) |
| Empty select on summary | `IncomingGridGroupSummary.tsx` `case 'select'` → empty `<span aria-hidden />` |
| “N lines” copy | `IncomingGridGroupSummary.tsx` title cell — `{rows.length} lines` |
| Status icons on title | `IncomingGridRow.tsx` / `IncomingGridGroupSummary.tsx` title cell (`DeliveryStateIcon`) |
| Selection scope | `RECEIVING_SELECTION_SCOPE` + `useReceivingRowSelection` |
| Collapsible contract | `CollapsibleGroupRow.tsx` — “Header click toggles expansion only — it never selects” |

## Screenshot notes (2026-07-22)

- Folded multi-line groups lack a group-level checkbox (leaf gutters only).
- Status not a dedicated sortable column.
- Group chrome must not advertise “lines” to the operator when the fold is products on a PO.

## Done when

All three goals + verify green; then append a worklog line and mark this handoff **RESOLVED** at the top (do not delete the prompt — stamp resolution like `incoming-click-to-open-handoff.md`).
