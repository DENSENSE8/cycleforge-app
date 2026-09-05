/**
 * Slot-action overlay — engine seed (v1 = shipping-label verb only).
 *
 * The interference layer sits on CopyChipHoverMenu (side flyout, never below
 * the chip). v1 does not invent a second overlay primitive. To-ship Label
 * opens the paperwork walk (`?paperwork=` → {@link PaperworkWalkHost} /
 * {@link PaperworkEditor} with carton context in the header) — table XOR
 * record, same chrome as exceptions.
 *
 * The walk is the ONE Label surface. All three doors — the header Labels CTA
 * (`OrdersDeskLabelsAction`), this tracking-hover row, and the selection-bar
 * Labels / `l` — land on it. Do NOT expand a band under the grid: the rival
 * in-row host (`LabelRunBand` + its `label-run` stepper, and the
 * `activeWorkRowId` / `renderActiveWorkBand` props on `useOrdersSpreadsheet`)
 * was built, never wired to a door, and deleted 2026-09-05. Rebuilding it
 * forks the record plane Q5 Center Lock already settled. The shipping form
 * itself is not duplicated either — `OrderShippingPanel` is shared, and
 * `PaperworkEditor` is its only mount.
 */

export const SLOT_ACTION_OVERLAY_V1_VERB = 'label' as const;

/** Whether TrackingNumberMenuChip must wrap in CopyChipHoverMenu. */
export function trackingHoverMenuHasActions(opts: {
  trackingUrl: string | null | undefined;
  hasEdit: boolean;
  extraCount: number;
}): boolean {
  return Boolean(opts.trackingUrl) || opts.hasEdit || opts.extraCount > 0;
}
