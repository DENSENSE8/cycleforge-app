/**
 * The phone companion's wire shapes — what a counter tablet shares with a
 * staff phone joined to its repair visit, and what the phone sends back.
 *
 * Pure (no DB, no React): the routes validate with these schemas, the tablet
 * and the phone type their payloads with them, and {@link mergeCompanionDevices}
 * is the one rule for which serial wins.
 *
 * Callers: `src/lib/kiosk/companion-link.ts`, `/api/kiosk/companion/**`,
 * `/api/counter/companion`, `useKioskCompanionLink`, `/m/repair-scan`.
 * Schemas: `kiosk_companion_links.devices` / `.pending_serials`.
 */

import { z } from 'zod';

/** One unit on the visit as the phone sees it. Serial is the only thing it edits. */
export const CompanionDeviceSchema = z.object({
  lineId: z.string().min(1).max(64),
  title: z.string().max(300),
  sku: z.string().max(120).nullable(),
  serialNumber: z.string().max(120),
});
export type CompanionDevice = z.infer<typeof CompanionDeviceSchema>;

/** A tablet visit is a handful of units; the cap keeps a bad client from writing a blob. */
export const CompanionDevicesSchema = z.array(CompanionDeviceSchema).max(50);

/** A serial the phone scanned for one unit. Same bound as the repair line payload. */
export const CompanionSerialSchema = z.object({
  lineId: z.string().min(1).max(64),
  serialNumber: z.string().trim().max(120),
});
export type CompanionSerial = z.infer<typeof CompanionSerialSchema>;

/**
 * The snapshot the phone should see after a tablet sync: the tablet's devices
 * (it owns WHICH units exist), with every serial the phone scanned that the
 * tablet had not applied yet laid over them. Without the overlay the tablet's
 * own snapshot — taken a beat before it applied the scan — would blank the
 * serial on the phone for one sync.
 *
 * A pending serial for a unit the tablet no longer has is dropped: the staffer
 * removed that unit, so there is nothing to write it onto.
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

/** A later scan for the same unit replaces an earlier one still in flight. */
export function queueCompanionSerial(
  pending: readonly CompanionSerial[],
  next: CompanionSerial,
): CompanionSerial[] {
  return [...pending.filter((p) => p.lineId !== next.lineId), next];
}
