/**
 * Slot-action overlay — engine seed (v1 = shipping-label verb only).
 *
 * The interference layer sits on CopyChipHoverMenu (side flyout, never below
 * the chip). v1 does not invent a second overlay primitive. To-ship Label
 * opens the paperwork walk (`?paperwork=` → {@link PaperworkWalkHost} /
 * {@link PaperworkEditor} with carton context in the header) — table XOR
 * record, same chrome as exceptions. Do not expand {@link LabelRunBand} under
 * the grid.
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
