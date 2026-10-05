/**
 * Pick scan → unit identity. The QC / pre-box unit label (template `product`)
 * encodes the unit's minted `unit_uid` (`00072-BK-2636-000173`), a GS1
 * `(01)gtin(21)serial` element string, a GS1 Digital Link, or a `U-{serial}`
 * handle — never the bare serial. A prepacked PACKAGE (a SEALED PREBOX
 * manifest carrying N≥2 serials) wears one `KIT-…` label that names every
 * member. Every pick surface resolves a scan through here.
 */

import { routeScan, scannedUnitKey } from '@/lib/barcode-routing';

/** The unit facts a pick surface holds for each open allocation. */
export interface PickScanUnit {
  serialUnitId: number;
  serialNumber: string | null;
  unitUid: string | null;
  /** The SEALED PREBOX package (`KIT-…`) the unit is boxed in, or `null`. */
  packageUid: string | null;
}

/**
 * What a scan names. `label` = a printed unit label (the key is its serial,
 * unit_uid, or — for `U-{id}` / `/m/u/{id}` — the numeric unit id);
 * `package` = a package label (the key is its `KIT-…` manifest uid, naming
 * every member); `raw` = anything else, compared as a typed serial.
 */
export type PickScanKey =
  | { kind: 'label'; key: string }
  | { kind: 'package'; key: string }
  | { kind: 'raw'; key: string };

export function pickScanKey(raw: string): PickScanKey | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  if (routeScan(trimmed)?.type === 'manifest') return { kind: 'package', key: trimmed };
  const label = scannedUnitKey(trimmed);
  if (label) return { kind: 'label', key: label };
  return { kind: 'raw', key: trimmed };
}

function same(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toUpperCase() === b.toUpperCase();
}

/**
 * Does this scan name this unit — a package label by the unit's package; any
 * other scan by serial, by unit_uid, or (label only) by unit id?
 */
export function scanNamesUnit(scan: PickScanKey, unit: PickScanUnit): boolean {
  if (scan.kind === 'package') return same(unit.packageUid, scan.key);
  if (same(unit.serialNumber, scan.key)) return true;
  if (same(unit.unitUid, scan.key)) return true;
  return scan.kind === 'label' && /^\d+$/.test(scan.key) && Number(scan.key) === unit.serialUnitId;
}

/** Every open unit a scan names — one for a unit label, each member for a package label. */
export function unitsForScan<T extends PickScanUnit>(raw: string, units: readonly T[]): T[] {
  const scan = pickScanKey(raw);
  if (!scan) return [];
  return units.filter((u) => scanNamesUnit(scan, u));
}

/**
 * A unit (or package) label that names none of the order's units is a
 * DIFFERENT physical box — refuse it with both identities (owner 2026-09-28:
 * never swap the allocation from the floor). Returns the refusal, or `null`
 * when the scan is not a unit / package label or names one of `units`.
 */
export function wrongUnitLabelRefusal(raw: string, units: readonly PickScanUnit[]): string | null {
  const scan = pickScanKey(raw);
  if (!scan || scan.kind === 'raw') return null;
  if (units.some((u) => scanNamesUnit(scan, u))) return null;
  const expected =
    units.map((u) => u.serialNumber?.trim() || u.unitUid?.trim() || `U-${u.serialUnitId}`).join(' or ') ||
    'no open unit';
  const what = scan.kind === 'package' ? 'Wrong package' : 'Wrong unit';
  return `${what} — this label is ${scan.key}; the order holds ${expected}.`;
}
