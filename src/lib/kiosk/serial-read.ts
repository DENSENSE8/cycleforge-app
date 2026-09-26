/** What a camera read on the repair phone companion actually is — a serial to add to a unit, a link that CARRIES one, a link that does not,… */

import { parseGs1DigitalLink } from '@/lib/gs1/parser';
import { parseGs1AiPayload } from '@/lib/scan-resolver';
import { splitSerials } from './serial-list';

export type SerialRead =
  /** A serial to write. `from` says how it was found (a label prefix or GS1 AI stripped). */
  | { kind: 'serial'; serial: string; from: 'plain' | 'labelled' | 'gs1' }
  /** A link that carries a serial — in a query param or as GS1 Digital Link AI 21. */
  | { kind: 'url-serial'; serial: string; url: string; from: string }
  /** A link with no serial in it: offer to open it, never write it. */
  | { kind: 'url'; url: string }
  | { kind: 'reject'; reason: SerialRejectReason };

export type SerialRejectReason = 'empty' | 'too-short' | 'too-long' | 'not-a-serial';

/** The shortest string worth writing as a serial. */
export const SERIAL_MIN_LENGTH = 3;
/**
 * The longest read taken as a serial. Real serials run 8–20 characters; the
 * line field allows 120, but a 65+ character read is a sentence or a payload.
 */
export const SERIAL_MAX_LENGTH = 64;

/** Query params a manufacturer's QR puts its serial in, in the order we trust them. */
const SERIAL_PARAMS = ['sn', 'serial', 'serialnumber', 'serial_number', 'serialno', 'serial_no', 's'] as const;

/**
 * `SN: ABC`, `S/N ABC`, `Serial No. ABC`, `Serial#ABC` — the label's own caption
 * printed into the code. A separator is required: `SN778899` IS the serial.
 */
const LABEL_PREFIX = /^(?:s\/n|sn|serial(?:\s*(?:no\.?|number))?)\s*(?:[:#]|\s)\s*/i;

/** QR payload schemes that are never a serial (contact cards, Wi-Fi joins, mail, phone, …). */
const PAYLOAD_SCHEME = /^(?:mailto|tel|sms|smsto|wifi|mecard|matmsg|geo|market|otpauth|bitcoin|begin):/i;

/** Letters, digits and the punctuation serials actually use; no whitespace. */
const SERIAL_SHAPE = /^[A-Za-z0-9][A-Za-z0-9\-_./#+:]*$/;

function checkShape(value: string): SerialRejectReason | null {
  if (!value) return 'empty';
  if (value.length < SERIAL_MIN_LENGTH) return 'too-short';
  if (value.length > SERIAL_MAX_LENGTH) return 'too-long';
  if (PAYLOAD_SCHEME.test(value) || !SERIAL_SHAPE.test(value)) return 'not-a-serial';
  return null;
}

function asUrl(value: string): URL | null {
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function serialFromUrl(url: URL): { serial: string; from: string } | null {
  // Params are matched case-insensitively (`?SN=`, `?Serial=`).
  const params = new Map<string, string>();
  url.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!params.has(k)) params.set(k, value.trim());
  });
  for (const name of SERIAL_PARAMS) {
    const value = params.get(name);
    if (value && checkShape(value) === null) return { serial: value, from: name };
  }
  // GS1 Digital Link (`/01/<gtin>/21/<serial>`) — our own unit labels and a
  // growing share of manufacturers'. Only with a GTIN: a bare `/21/x` path is
  // any shop's URL.
  const gs1 = parseGs1DigitalLink(url.href);
  if (gs1?.gtin && gs1.serial && checkShape(gs1.serial) === null) return { serial: gs1.serial, from: 'gs1' };
  return null;
}

/**
 * Classify one decoded string. The camera hands up whatever the symbol held;
 * only a `serial` / `url-serial` result may be written onto a unit.
 */
export function classifySerialRead(raw: string): SerialRead {
  // `trim` drops a wedge's CR/LF. ZXing hands GS1 FNC1 up as ASCII GS; it stays for the GS1 parse below.
  const value = raw.trim();
  if (!value) return { kind: 'reject', reason: 'empty' };

  const url = asUrl(value);
  if (url) {
    const found = serialFromUrl(url);
    return found ? { kind: 'url-serial', serial: found.serial, url: url.href, from: found.from } : { kind: 'url', url: url.href };
  }

  // A GS1 element string (DataMatrix on a device box): `(01)…(21)SERIAL` or FNC1-separated.
  if (value.startsWith('(') || value.includes('\u001d')) {
    const serial = parseGs1AiPayload(value)?.ais['21']?.trim();
    if (serial && checkShape(serial) === null) return { kind: 'serial', serial, from: 'gs1' };
  }

  const unlabelled = value.replace(LABEL_PREFIX, '');
  if (unlabelled !== value && unlabelled) {
    const reason = checkShape(unlabelled);
    return reason ? { kind: 'reject', reason } : { kind: 'serial', serial: unlabelled, from: 'labelled' };
  }

  const reason = checkShape(value);
  return reason ? { kind: 'reject', reason } : { kind: 'serial', serial: value, from: 'plain' };
}

/** Serials compare trimmed and case-blind: `abc123` on one unit and `ABC123` on another is one serial. */
export function sameSerial(a: string, b: string): boolean {
  const x = a.trim();
  return x !== '' && x.toUpperCase() === b.trim().toUpperCase();
}

/** Whether a unit's serial list (`serial-list.ts`) already holds `serial`. */
export function unitHasSerial(serialNumber: string, serial: string): boolean {
  return splitSerials(serialNumber).some((s) => sameSerial(s, serial));
}

/**
 * The OTHER unit of the visit that already carries `serial` among its
 * serials, or null. The unit `lineId` itself is never its own duplicate — a
 * serial already on it is a repeat read (`unitHasSerial`), not a clash.
 */
export function findDuplicateSerial<T extends { lineId: string; serialNumber: string }>(
  units: readonly T[],
  lineId: string,
  serial: string,
): T | null {
  return units.find((u) => u.lineId !== lineId && unitHasSerial(u.serialNumber, serial)) ?? null;
}
