# Overnight GOAL — slot-action overlay v1 (shipping label)

**Host:** local coder (Hermes / Cursor). **Human:** verify To-ship hover → Label band.  
**Do not expand this goal.** One verb. Stop when the gate is green.

Paste from **GOAL** through **STOP** into the overnight loop as the task text.

---

## GOAL

On To-ship (`queueMode=fulfillment`), the compound **identity tracking line** (filled chip or empty dash) reveals the existing **CopyChipHoverMenu** (side flyout). A **Label** row starts `startLabelRun([thisRowId])` so `LabelRunBand` + `OrderShippingPanel` expand **under that row**. Click Label again on the active row exits the run. Esc still exits (`UnshippedSheet` listener).

Chip click stays **copy** (filled tracking). Hover menu stays **right of the chip**, never below the row. Compose existing hosts. No new document editor.

## HOW IT MUST FUNCTION

- Mount: `TrackingNumberMenuChip` `extraItems` + empty-dash `CopyChipHoverMenu` when `onOpenLabels` is passed.
- Host: `UnshippedSheet` only. Receiving / Incoming / station history **must not** get Label extras.
- Start: `setLabelRun(startLabelRun([Number(record.id)]))`. Toggle off if that id is already the single-row active run.
- Buy / upload / replace PDF / tracking string live **inside LabelRunBand** (already built). The overlay only **opens** that band.
- Header Labels CTA / `?paperwork=` walk is a **different motion**. Cell Label must not `patchPaperwork`.
- Selection-bar Labels (`hotkey: l` with checkboxes) stays. Cell Label does not require a checkbox.
- `ds_contract` + `ds_tokens` (radius dropdown / elevation overlay) before any `src/**/*.tsx` write. Critique edited UI files. `CopyChipHoverMenu` paint is frozen.
- Graph: impact `TrackingNumberMenuChip` + `CompoundFulfillment` before signature changes.
- Gate: `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast` then `pnpm run eval:cohort slot-table -- --skip-verify` if you touch CompoundItem / slot layout (this ship should not). If you touch overlay workspaces, `pnpm run eval:station unbox -- --skip-verify` is **not** required unless those files change.
- Stamp `.cursor/eval-session.json` via cursor-eval.

## HOW IT MUST NOT FUNCTION

- Do **not** change paint (chip face, dots, row height, LabelRunBand chrome).
- Do **not** fold Queue/Viewed/History into the funnel.
- Do **not** delete overlay `visibility` / `zIndex.panel`.
- Do **not** invent Operator verdict or LEDGER Open gaps.
- Do **not** add FilterRefinementBar, hunt tiles, standing keycaps, cheat sheet from `?`.
- Do **not** add Copy / Replace tracking / Void / Buy / Re-upload / Qty / Condition / Notes / Assign / Image expand / bulk as **new overlay verbs**. Those are later ships. Replace tracking stays the existing `onEdit` path if a host already passes it — do not wire it in this goal unless it is a one-line pass-through already present.
- Do **not** open the right rail or `?paperwork=` walk from the cell.
- Do **not** put Label on `OrderNumberMenuChip`.
- Do **not** fork a second hover menu (no Radix Dropdown under the cell, no title tooltip on Label).
- Do **not** batch-buy labels. K10: one row, one commit, already in LabelRunBand.
- Do **not** lower lighthouse-baseline floors.
- Do **not** invent `SlotActionOverlay.tsx` / `FilterRefinementBar` / a new column for Labels.
- Do **not** pass JSX through `CompoundRowView` (strings only). Callbacks thread like `shipByEdit` / `onOpen`.

## ALLOWED FILES (shrink toward this list)

- `src/lib/tables/slot-action-overlay.ts` (+ colocated test)
- `src/components/ui/TrackingNumberMenuChip.tsx`
- `src/components/tables/compound/CompoundCells.tsx` (`CompoundFulfillment` only)
- `src/components/tables/compound/CompoundGridCell.tsx` (thread `onOpenLabels`)
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx`
- `src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx`
- `src/components/unshipped/UnshippedTable.tsx` (`UnshippedSheet` start/toggle run)
- This GOAL file

If a type must move, touch the `.ts` interface next to the call. Do not “while here” CompoundItem / DataTableFilterMenu.

## DONE WHEN

1. To-ship: hover tracking (or the empty dash) → **Label** → band under that row with shipping panel.
2. Esc / Label again closes. Table still compares.
3. Receiving tracking chip unchanged (no extraItems).
4. cursor-eval `--fast` green. No paint diffs on chips.

## STOP

Do not start overlay v2 (qty, assign, image, bulk tracking). Hand back for human verify.
