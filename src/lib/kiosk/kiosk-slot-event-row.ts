/**
 * One kiosk slot / lane state transition — phase 2 history family row.
 *
 * Separate from `KioskDeviceTableRow` (fleet). No Revoke. Device link is FK only.
 * PRODUCT_TABLES peer registration lands after list API + spreadsheet glue.
 */

export type KioskSlotHardwareSnapshot = 'ok' | 'stale' | 'offline' | 'no_reader';

export interface KioskSlotEventTableRow {
  id: number;
  organizationId: string;
  kioskDeviceId: number;
  /** Enrolled tablet label at read time (join) — identity/subtitle, not a verb target. */
  deviceLabel: string | null;
  slotKey: string;
  fromState: string;
  toState: string;
  dwellMs: number | null;
  hardwareStatus: KioskSlotHardwareSnapshot | null;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}
