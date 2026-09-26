/** The DEVICES on a kiosk repair visit — one row per physical unit the customer put on the counter. */

import {
  isLinkedRepairLine,
  isRepairPayload,
  type KioskCartLine,
  type RepairPayload,
} from './cart-line';

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
  /**
   * THIS unit's reasons for repair — the line is the source of truth, so two
   * units on one visit can carry different answers (operator 2026-09-25:
   * "all devices, or per device with a switcher").
   */
  repairReasons: string[];
  /** A keypad-typed device: its "product" is its price, not a catalog SKU. */
  custom: boolean;
}

/** The visit's devices, in cart order. */
export function repairDevicesFromLines(
  lines: readonly KioskCartLine[],
): KioskRepairDevice[] {
  const devices: KioskRepairDevice[] = [];
  for (const line of lines) {
    if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
    if (isLinkedRepairLine(line)) continue;
    const payload: RepairPayload = line.payload;
    devices.push({
      lineId: line.id,
      title: payload.productModel?.trim() || line.title,
      sku: payload.sourceSku ?? null,
      serialNumber: payload.serialNumber ?? '',
      price: payload.price ?? '',
      priceCents: Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0,
      notes: payload.notes ?? null,
      repairReasons: payload.repairReasons ?? [],
      custom: payload.custom === true,
    });
  }
  return devices;
}

/** The ONE reasons set every unit shares, or null when the units disagree. */
export function sharedRepairReasons(
  devices: readonly Pick<KioskRepairDevice, 'repairReasons'>[],
): string[] | null {
  const first = devices[0]?.repairReasons ?? [];
  const same = devices.every(
    (d) =>
      d.repairReasons.length === first.length &&
      d.repairReasons.every((reason, i) => reason === first[i]),
  );
  return same ? first : null;
}

/** What each device is still missing. */
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
 * Identity of a repair PRODUCT: its SKU and its own single title. Two of the
 * same radio share it (two serials, two rows, one card); the picker → cart
 * sync uses it so the same tile tapped twice does not grow a twin.
 */
export function repairDeviceKey(sku: string | null | undefined, title: string): string {
  return `${sku ?? ''}::${title}`;
}

/** One product on the visit and every unit of it — a card on Device & quote. */
export interface KioskRepairDeviceGroup {
  key: string;
  title: string;
  sku: string | null;
  /** One per physical unit (one cart line, one `repair_service` row), cart order. */
  units: KioskRepairDevice[];
}

/**
 * The devices grouped by product, in order of first appearance.
 * with the cart's `−  N  +` (operator 2026-09-24: "add multiple serial numbers
 */
export function repairDeviceGroups(
  devices: readonly KioskRepairDevice[],
): KioskRepairDeviceGroup[] {
  const groups = new Map<string, KioskRepairDeviceGroup>();
  for (const device of devices) {
    const key = device.custom
      ? `custom::${device.title}::${device.priceCents}`
      : repairDeviceKey(device.sku, device.title);
    const group = groups.get(key);
    if (group) group.units.push(device);
    else groups.set(key, { key, title: device.title, sku: device.sku, units: [device] });
  }
  return [...groups.values()];
}

/**
 * Which unit `−` takes away: the newest one still without a serial — nobody
 * has read its chassis yet — else the newest.
 */
export function repairUnitToDrop(units: readonly KioskRepairDevice[]): KioskRepairDevice | null {
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (!units[i]!.serialNumber.trim()) return units[i]!;
  }
  return units[units.length - 1] ?? null;
}

/** A VISIT summarized for chrome that has one line to say it in. */
export function summarizeProductTitles(titles: readonly string[]): string {
  const named = titles.map((t) => String(t ?? '').trim()).filter(Boolean);
  if (named.length === 0) return '';
  if (named.length === 1) return named[0]!;
  return `${named[0]} + ${named.length - 1} more`;
}
