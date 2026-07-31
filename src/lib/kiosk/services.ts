/**
 * Front-desk service SoT — shared by the proven `/kiosk` welcome tiles and the
 * landscape `/kiosk/v2` bottom dock. Bringing a WIP service online is a one-line
 * `status: 'live'` flip — never a second tile / dock design.
 */

export type KioskServiceId = 'sales' | 'pickup' | 'repair';

export interface KioskServiceTile {
  id: KioskServiceId;
  label: string;
  blurb: string;
  /** Only `live` services render as actionable; `wip` stay in the SoT for reuse. */
  status: 'live' | 'wip';
}

export const KIOSK_SERVICES: ReadonlyArray<KioskServiceTile> = [
  { id: 'repair', label: 'Repair Drop-off', blurb: 'Check in a device for service', status: 'live' },
  { id: 'sales', label: 'Buy / Sell', blurb: 'Start a counter sale or trade-in', status: 'live' },
  { id: 'pickup', label: 'Order Pickup', blurb: 'Collect a ready order', status: 'wip' },
];

export function liveKioskServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live');
}
