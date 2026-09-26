/** The phone companion's wire shapes — what a counter tablet shares with a staff phone joined to its repair visit, and what the phone sends… */

import { z } from 'zod';
import { joinSerials, SERIAL_LIST_MAX_CHARS } from './serial-list';

/** One unit on the visit as the phone sees it. Serial is the only thing it edits. */
export const CompanionDeviceSchema = z.object({
  lineId: z.string().min(1).max(64),
  title: z.string().max(300),
  sku: z.string().max(120).nullable(),
  /** Every serial the unit carries, joined — see `serial-list.ts`. */
  serialNumber: z.string().max(SERIAL_LIST_MAX_CHARS),
});
export type CompanionDevice = z.infer<typeof CompanionDeviceSchema>;

/** A tablet visit is a handful of units; the cap keeps a bad client from writing a blob. */
export const CompanionDevicesSchema = z.array(CompanionDeviceSchema).max(50);

/**
 * The phone's write for one unit: the unit's WHOLE serial list after the scan
 * (a scan appends, undo removes), joined per `serial-list.ts`. Same bound as
 * the repair line payload.
 */
export const CompanionSerialSchema = z.object({
  lineId: z.string().min(1).max(64),
  serialNumber: z.string().trim().max(SERIAL_LIST_MAX_CHARS),
});
export type CompanionSerial = z.infer<typeof CompanionSerialSchema>;

/**
 * What the joined phone reads: the tablet's units plus who the visit is for,
 * so the phone can say WHICH counter visit it is scanning into.
 */
export interface CompanionVisit {
  devices: CompanionDevice[];
  expiresAt: string;
  /** The tablet's operator-facing name (`kiosk_devices.label`). */
  tablet: string | null;
  /** The open cart the tablet holds (`kiosk_carts`), or null before its first save. */
  cart: { id: number; customer: string | null } | null;
}

/** The snapshot the phone should see after a tablet sync: */
export function mergeCompanionDevices(
  tablet: readonly CompanionDevice[],
  pending: readonly CompanionSerial[],
): CompanionDevice[] {
  const scanned = new Map(pending.map((p) => [p.lineId, p.serialNumber]));
  return tablet.map((device) =>
    scanned.has(device.lineId) ? { ...device, serialNumber: scanned.get(device.lineId)! } : device,
  );
}

/**
 * A later write for the same unit replaces an earlier one still in flight.
 * The phone builds each write on its previous one (`layPhoneWrites`), so the
 * later list already carries the earlier list's serials.
 */
export function queueCompanionSerial(
  pending: readonly CompanionSerial[],
  next: CompanionSerial,
): CompanionSerial[] {
  return [...pending.filter((p) => p.lineId !== next.lineId), next];
}

/** A serial list the phone wrote, and when (ms epoch). */
export interface PhoneSerialWrite extends CompanionSerial {
  at: number;
}

/**
 * How long the phone trusts its own write over a snapshot that does not show
 * it: a few tablet syncs. Past that the tablet's value wins (the staffer may
 * have edited the field there).
 */
export const PHONE_WRITE_HOLD_MS = 10_000;

/** The phone's view of a snapshot it just read: */
export function layPhoneWrites(
  devices: readonly CompanionDevice[],
  writes: readonly PhoneSerialWrite[],
  readAt: number,
  holdMs = PHONE_WRITE_HOLD_MS,
): { devices: CompanionDevice[]; unsettled: PhoneSerialWrite[] } {
  const shown = new Map(devices.map((d) => [d.lineId, joinSerials([d.serialNumber]).toUpperCase()]));
  const unsettled = writes.filter((w) => {
    const current = shown.get(w.lineId);
    if (current === undefined) return false;
    if (readAt < w.at) return true;
    return readAt - w.at < holdMs && current !== joinSerials([w.serialNumber]).toUpperCase();
  });
  return { devices: mergeCompanionDevices(devices, unsettled), unsettled };
}
