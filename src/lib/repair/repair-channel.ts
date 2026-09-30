/**
 * How a repair reached us — `repair_service.intake_channel` (owner 2026-09-29).
 * One vocabulary for the column, the `?channel=` URL param on `/repair` and
 * Sales `?mode=repairs`, and `GET /api/repair-service?channel=`.
 * Browser-safe: no server imports.
 *
 * The desk's views (owner 2026-09-30): All (no `?channel=` — every channel,
 * the landing) · Shipped in (`shipment`) · Dropped off (`pickup`).
 */

export const REPAIR_CHANNELS = ['shipment', 'pickup'] as const;
export type RepairChannel = (typeof REPAIR_CHANNELS)[number];

export const REPAIR_CHANNEL_PARAM = 'channel';

export const REPAIR_CHANNEL_LABEL: Record<RepairChannel, string> = {
  shipment: 'Shipped in',
  pickup: 'Dropped off',
};

/** The view a bare repair desk URL (no `?channel=`) shows — every channel. */
export const REPAIR_ALL_CHANNELS_LABEL = 'All repairs';

export function parseRepairChannel(raw: string | null | undefined): RepairChannel | null {
  return raw === 'shipment' || raw === 'pickup' ? raw : null;
}
