/**
 * The DEVICES on a kiosk repair visit — one row per physical unit the customer
 * put on the counter.
 *
 * ## Why this exists
 * `repair_service` has always been one row per device (its own `serial_number`,
 * `price`, `product_title`), `/api/kiosk/intake` has always taken
 * `serviceLines[]`, and the cart has always held one REPAIR line per device.
 * The UI was the only layer that flattened: the picker joined every selected
 * product name with `', '`, summed the prices, and the repair pane offered ONE
 * serial field and ONE price field for the lot. A two-device drop-off was
 * therefore recorded as one device with a 180-character title, one serial and a
 * summed quote — and the serial that mattered belonged to neither unit.
 *
 * This module is the device list as the pane reads it, derived from the cart
 * (the session root, so it survives the pane unmounting) and nothing else. No
 * second store, no local array that can disagree with the ticket.
 *
 * Pure: no React, no fetch. Callers: `KioskRepairPane`, `KioskShell`,
 * `repair-intake-logic` (the step-1 gate). Affected API: none — the shapes it
 * reads and writes are `cart-line.ts`'s.
 */

import { isRepairPayload, type KioskCartLine, type RepairPayload } from './cart-line';

/** One device on the visit, flattened for the form that edits it. */
export interface KioskRepairDevice {
  /** Cart line id — the identity every edit and the delete verb address. */
  lineId: string;
  /** ONE product's title. Never a join; a visit summary is `summarizeProductTitles`. */
  title: string;
  sku: string | null;
  serialNumber: string;
  /** Quote as typed — mirrors `repair_service.price`, a text column. */
  price: string;
  /** The line's money, which is what the cart total and the header are built from. */
  priceCents: number;
  notes: string | null;
}

/** The visit's devices, in cart order. */
export function repairDevicesFromLines(
  lines: readonly KioskCartLine[],
): KioskRepairDevice[] {
  const devices: KioskRepairDevice[] = [];
  for (const line of lines) {
    if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
    const payload: RepairPayload = line.payload;
    devices.push({
      lineId: line.id,
      title: payload.productModel?.trim() || line.title,
      sku: payload.sourceSku ?? null,
      serialNumber: payload.serialNumber ?? '',
      price: payload.price ?? '',
      priceCents: Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0,
      notes: payload.notes ?? null,
    });
  }
  return devices;
}

/**
 * What each device is still missing.
 *
 * The same two facts `missingRepairIntakeFields` demands server-side (`Serial #`
 * and `Price`), asked PER DEVICE — because that is the row that will be
 * written. A visit that passed the old single-field gate could still reach the
 * counter with device two unserialised.
 */
export function repairDeviceGaps(
  devices: readonly KioskRepairDevice[],
): Array<{ lineId: string; title: string; missing: string[] }> {
  return devices
    .map((device) => ({
      lineId: device.lineId,
      title: device.title,
      missing: [
        device.serialNumber.trim() ? null : 'Serial #',
        device.price.trim() ? null : 'Price',
      ].filter((label): label is string => label !== null),
    }))
    .filter((row) => row.missing.length > 0);
}

/** Step-1 gate: at least one device, every one of them serialised and quoted. */
export function repairDevicesComplete(devices: readonly KioskRepairDevice[]): boolean {
  return devices.length > 0 && repairDeviceGaps(devices).length === 0;
}

/** ONE refusal sentence for the device step, naming the device that is short. */
export function repairDeviceBlockReason(
  devices: readonly KioskRepairDevice[],
): string | undefined {
  if (devices.length === 0) return 'Add the device being dropped off';
  const gaps = repairDeviceGaps(devices);
  if (gaps.length === 0) return undefined;
  const first = gaps[0]!;
  const missing = first.missing.join(' and ');
  // Name the unit when there is more than one, because "Serial # is required"
  // beside four cards does not say WHICH card.
  return devices.length > 1
    ? `${first.title} still needs its ${missing}`
    : `Enter the ${missing}`;
}

/** Quoted total for the visit's repairs, in cents. */
export function repairDevicesTotalCents(devices: readonly KioskRepairDevice[]): number {
  return devices.reduce((sum, device) => sum + device.priceCents, 0);
}

/**
 * A VISIT summarized for chrome that has one line to say it in.
 *
 * `A, B, C, D` is not a title — it is four titles in a trench coat, and at
 * `text-3xl` on the customer display it leaves the viewport. One product plus a
 * count answers "what is this visit about" at any width, and the devices
 * themselves are listed where there is room for them.
 */
export function summarizeProductTitles(titles: readonly string[]): string {
  const named = titles.map((t) => String(t ?? '').trim()).filter(Boolean);
  if (named.length === 0) return '';
  if (named.length === 1) return named[0]!;
  return `${named[0]} + ${named.length - 1} more`;
}
