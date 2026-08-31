# Slot-based table — To-ship verification checklist

**Ship:** Phases 0–2 of [`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md), To-ship only.
**Automated:** `npm run verify` (kernel/cascade/materializer/resolver/picker unit suites), plus
`tests/e2e/to-ship-pending-grid.spec.ts` (asserts `data-col="status:1"` present, `data-col="tested"` retired;
derives per-track assertions from `ORDERS_COMPOUND_COLUMNS`). Playwright is not in the verify gate — run
`npx playwright test to-ship-pending-grid` against a live `:3050` when a browser pass is wanted.

## Manual floor pass (default org, no overrides)

1. Open **To-ship** (`/dashboard?unshipped`). The compound grid paints exactly as before this ship:
   select · photo · Order · Item · Status · **Tested** · Amount · ⋮ — the Tested column is now the
   `status:1` slot (inspect: header cell has `data-col="status:1"`; nothing carries `data-col="tested"`).
2. Tested cell is a media-object row: the ACTOR'S MARK on the left spanning both lines
   (photo → initials on their staff colour, via the house `StaffAvatar`; a 2px colour ring keeps
   the staff colour visible once a photo uploads; dashed empty circle when unclaimed), then
   icon + STATE VERB on top — **TESTED** once the stamp lands (`time · station` below),
   **TEST** until then (dash below; an assigned-but-untested row shows the assignee's mark
   beside TEST). Full `name · time · station` on hover — no inline name, fixed widths.
   Verbs are catalog data (`stageLabels` on `field-catalog/orders.ts`), never hard-coded;
   staff colour never repaints the verb (state tones stay the status channel).

## + Fields picker (any staff)

3. Toolbar → **+** button (`data-testid="data-table-fields"`, shadcn Popover from
   `@/design-system/primitives/radix-popover`), beside the filter funnel.
   - Identity row reads "Order — identity, always shown" and is not clickable.
   - **Status columns**: Tested (checked), Packed, Scanned out. **Under the title**: Item #, Qty, Cond, Notes.
4. Click **Packed** → menu row checks; a `status:2` Packed column appears after Tested without reload
   (2 interactions from open table — budget ≤3 ✓). Packed rows show PACKED + `who · time · bench`;
   others show PACK + dash.
5. Click **Qty** → item cells' second line shows the BARE number in the count tone
   (`orderRowQtyTone`: 1 = gray, >1 = warning). Click **Cond** then **Notes** → the line reads
   `qty · grade · note` with the grade in its condition tone. Binding CLICK ORDER is the display
   order (the layout stores an ordered array — org-configurable order, no extra UI).
6. Refresh → both choices persist (they wrote `staff_preferences.prefs.tableLayouts.orders`).
7. Bind status fields until 10 (needs a bigger catalog to hit — structurally guarded; the picker shows
   "Status limit (10) reached — remove one to add another." on unbound rows of a full band).

## Org-wide default (admin: `admin.manage_features`)

8. As **admin**, set the layout you want (e.g. Tested + Packed), open Fields →
   **Save as organization default** → button turns into **Confirm: set for the whole organization** →
   click (3 interactions incl. confirm — budget ✓). Toast confirms; admin's personal override is cleared.
9. As a **different staffer with no personal override**: refresh To-ship → they see Tested + Packed
   (org layout via `GET /api/tables/layouts?tableId=orders`, cascade `staff ?? org ?? product`).
10. That staffer unbinds Packed → only their view changes (personal override). Fields menu now offers
    **Reset to shared default** → restores the org layout.
11. Non-admin's Fields menu has **no** org-save row; `PUT /api/tables/layouts` without
    `admin.manage_features` is 403.

## Honest-dash check

12. Bind **Scanned out**: column paints icon + label with a dashed second line on every To-ship row —
    correct, the To-ship feed excludes SHIP_CONFIRMed orders and does not project the scan-out stamp yet
    (`orders.scanned_out` in `field-catalog/orders.ts` documents this).
