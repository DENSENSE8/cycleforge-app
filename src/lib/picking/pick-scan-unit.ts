/**
 * Pick scan → unit identity. The QC / pre-box unit label (template `product`)
 * encodes the unit's minted `unit_uid` (`00072-BK-2636-000173`), a GS1
 * `(01)gtin(21)serial` element string, a GS1 Digital Link, or a `U-{serial}`
 * handle — never the bare serial. Every pick surface resolves a scan through
 * here so the label the picker holds names exactly one serial unit.
 */

import { scannedUnitKey } from '@/lib/barcode-routing';

/** The unit facts a pick surface holds for each open allocation. */
export interface PickScanUnit {
  serialUnitId: number;
  serialNumber: string | null;
  unitUid: string | null;
}

/**
 * What a scan names. `label` = a printed unit label (the key is its serial,
 * unit_uid, or — for `U-{id}` / `/m/u/{id}` — the numeric unit id); `raw` =
 * anything else, compared as a typed serial.
 */
export type PickScanKey = { kind: 'label'; key: string } | { kind: 'raw'; key: string };

export function pickScanKey(raw: string): PickScanKey | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const label = scannedUnitKey(trimmed);
  if (label) return { kind: 'label', key: label };
  return { kind: 'raw', key: trimmed };
}

function same(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toUpperCase() === b.toUpperCase();
}

/** Does this scan name this unit — by serial, by unit_uid, or (label only) by unit id? */
export function scanNamesUnit(scan: PickScanKey, unit: PickScanUnit): boolean {
  if (same(unit.serialNumber, scan.key)) return true;
  if (same(unit.unitUid, scan.key)) return true;
  return scan.kind === 'label' && /^\d+$/.test(scan.key) && Number(scan.key) === unit.serialUnitId;
}

/** The open unit a scan names, or `null`. */
export function unitForScan<T extends PickScanUnit>(raw: string, units: readonly T[]): T | null {
  const scan = pickScanKey(raw);
  if (!scan) return null;
  return units.find((u) => scanNamesUnit(scan, u)) ?? null;
}

/**
 * A unit label that names none of the order's units is a DIFFERENT physical
 * box — refuse it with both identities (owner 2026-09-28: never swap the
 * allocation from the floor). Returns the refusal, or `null` when the scan is
 * not a unit label or names one of `units`.
 */
export function wrongUnitLabelRefusal(raw: string, units: readonly PickScanUnit[]): string | null {
  const scan = pickScanKey(raw);
  if (!scan || scan.kind !== 'label') return null;
  if (units.some((u) => scanNamesUnit(scan, u))) return null;
  const expected = units
    .map((u) => u.serialNumber?.trim() || u.unitUid?.trim() || `U-${u.serialUnitId}`)
    .join(' or ');
  return `Wrong unit — this label is ${scan.key}; the order holds ${expected || 'no open unit'}.`;
}
