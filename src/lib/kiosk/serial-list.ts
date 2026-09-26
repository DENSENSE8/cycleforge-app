/**
 * One repair UNIT can carry several serial numbers — a Wave system and its
 * CD changer, a soundbar and its bass module (operator 2026-09-25: "must allow
 * multiple endless serial numbers").
 *
 * The unit's serials travel as ONE string everywhere they already travel —
 * `RepairPayload.serialNumber`, the persisted cart snapshot, the phone
 * companion, `/api/kiosk/intake`, and `repair_service.serial_number` (TEXT) —
 * joined by {@link SERIAL_SEPARATOR}. That keeps every reader that prints or
 * searches the column (paperwork "SN & Issues", the receipt, ILIKE search)
 * correct with no schema change. Anything that needs the LIST goes through
 * {@link splitSerials}; anything that writes goes through {@link joinSerials}.
 * No other module splits or joins serials by hand.
 *
 * A comma therefore cannot be part of a serial. Scanned serials never contain
 * one (`classifySerialRead` refuses whitespace and prose), and a typed comma is
 * read as "two serials", which is what a person typing `A, B` means.
 *
 * Callers: `KioskSerialListField`, `KioskRepairPane`, `KioskCartLineEditor`,
 * `RepairScanCompanion`, `serial-read.ts`. Schemas: none (pure).
 */

export const SERIAL_SEPARATOR = ', ';

/**
 * Upper bound for the joined string on every schema that carries it. Not a
 * product limit — "endless" in practice — only a guard against a runaway body.
 */
export const SERIAL_LIST_MAX_CHARS = 4000;

/** The unit's serials, in entry order: trimmed, empties dropped. */
export function splitSerials(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((serial) => serial.trim())
    .filter((serial) => serial.length > 0);
}

/**
 * The stored form of a unit's serials. Empty entries (a field the staffer
 * added but has not filled yet) are dropped; exact repeats inside ONE unit
 * collapse to the first, case-blind, because one chassis cannot carry the same
 * serial twice. Repeats ACROSS units are a warning, not a rewrite — see
 * `findDuplicateSerial`.
 */
export function joinSerials(serials: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of serials) {
    for (const serial of splitSerials(raw)) {
      const key = serial.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(serial);
    }
  }
  return kept.join(SERIAL_SEPARATOR);
}

/** The unit's serials with `serial` added at the end (a no-op when already there). */
export function appendSerial(value: string | null | undefined, serial: string): string {
  return joinSerials([...splitSerials(value), serial]);
}

/** The unit's serials without `serial` (case-blind); used by undo and the × on a field. */
export function removeSerial(value: string | null | undefined, serial: string): string {
  const key = serial.trim().toUpperCase();
  return joinSerials(splitSerials(value).filter((s) => s.toUpperCase() !== key));
}
