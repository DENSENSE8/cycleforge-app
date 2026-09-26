/** Slot-action overlay — engine seed (v1 = shipping-label verb only). */

export const SLOT_ACTION_OVERLAY_V1_VERB = 'label' as const;

/** Whether TrackingNumberMenuChip must wrap in CopyChipHoverMenu. */
export function trackingHoverMenuHasActions(opts: {
  trackingUrl: string | null | undefined;
  hasEdit: boolean;
  extraCount: number;
}): boolean {
  return Boolean(opts.trackingUrl) || opts.hasEdit || opts.extraCount > 0;
}
