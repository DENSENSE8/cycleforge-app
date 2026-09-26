/**
 * The phone companion's wire shapes — what a counter tablet shares with a
 * staff phone joined to its repair visit, and what the phone sends back.
 *
 * Pure (no DB, no React): the routes validate with these schemas, the tablet
 * and the phone type their payloads with them, {@link mergeCompanionDevices}
 * is the one rule for which serial list wins on the server, and
 * {@link layPhoneWrites} is the same rule on the phone for its own writes.
 *
 * Callers: `src/lib/kiosk/companion-link.ts`, `/api/kiosk/companion/**`,
 * `/api/counter/companion`, `useKioskCompanionLink`, `/m/repair-scan`.
 * Schemas: `kiosk_companion_links.devices` / `.pending_serials`.
 */

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

/**
 * The snapshot the phone should see after a tablet sync: the tablet's devices
 * (it owns WHICH units exist), with every serial list the phone wrote that the
 * tablet had not applied yet laid over them. Without the overlay the tablet's
 * own snapshot — taken a beat before it applied the write — would blank the
 * phone's serials for one sync.
 *
 * A pending list is the unit's WHOLE list (a scan appends, undo removes), so
 * it replaces the tablet's value rather than joining it. A pending list for a
 * unit the tablet no longer has is dropped: the staffer removed that unit, so
 * there is nothing to write it onto.
 */
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

/**
 * The phone's view of a snapshot it just read: its own recent writes laid
 * over the units the snapshot has not caught up on yet. A poll that left
 * before a write landed would otherwise put the unit's OLD list back, and the
 * next scan onto that unit — built on the list the phone shows — would drop
 * the serial just read (two quick scans on one Wave: the second must build on
 * the first).
 *
 * `readAt` is when the snapshot's request LEFT. A snapshot that left before a
 * write can say nothing about it: the write stays. One that left after it
 * settles the write when it shows the same list, and outranks it once the
 * write is `holdMs` old (the tablet's value wins — its staffer may have edited
 * the field). A write for a unit the snapshot no longer has is dropped.
 */
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
