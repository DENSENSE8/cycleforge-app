/**
 * Kiosk counter scan classifier — pure, client-safe.
 *
 * Do NOT reuse warehouse `scan-resolver.ts`: a 12-digit FedEx STN and a 12-digit
 * UPC collide there. At the counter, digit-length + Luhn (IMEI) + RS# grammar
 * decide the action. Side effects (append cart / open pane) live in the shell.
 */

type KioskScanKind = 'upc' | 'imei' | 'pickup_ref' | 'unknown';

interface KioskScanClassification {
  kind: KioskScanKind;
  /** Digits-only (or compact upper) value used for lookup / prefill. */
  normalized: string;
  /** Original buffer as received from the wedge. */
  raw: string;
}

/** Strip to digits for UPC / IMEI checks. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Luhn check — IMEI (15 digits) must pass. Used only for kiosk buyback routing;
 * warehouse serials are not validated this way.
 */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** 15-digit IMEI that passes Luhn. */
export function looksLikeImei(value: string): boolean {
  const d = digitsOnly(value);
  return d.length === 15 && luhnValid(d);
}

/**
 * Retail barcode: 12-digit UPC-A, or 8–14 digit GTIN (EAN-8 / EAN-13 / GTIN-14).
 * Excludes 15-digit IMEI (handled first) and short noise.
 */
export function looksLikeUpcOrGtin(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length === 15) return false; // IMEI lane
  if (d.length === 12) return true; // UPC-A
  return d.length >= 8 && d.length <= 14;
}

/**
 * Repair pickup ref: RS-125 / RS125 / #ticket-shaped (not pure 8–14 digit UPC).
 * Pure numeric short refs (≥3 digits, not UPC/GTIN length) also qualify so a
 * wedge of a ticket id can open pickup.
 */
export function looksLikePickupRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/\s+/g, '').toUpperCase();
  if (/^RS(?:-|_|:|#)?\d+$/i.test(compact)) return true;
  if (/^#\w[\w-]*$/.test(trimmed)) return true;
  const d = digitsOnly(trimmed);
  // Ambiguous pure digits in UPC/GTIN range stay on the retail lane.
  if (looksLikeUpcOrGtin(trimmed) || looksLikeImei(trimmed)) return false;
  return d.length >= 3 && d.length <= 7 && /^\d+$/.test(d);
}

export function classifyKioskScan(raw: string): KioskScanClassification {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { kind: 'unknown', normalized: '', raw: trimmed };
  }

  if (looksLikeImei(trimmed)) {
    return { kind: 'imei', normalized: digitsOnly(trimmed), raw: trimmed };
  }

  if (looksLikeUpcOrGtin(trimmed)) {
    return { kind: 'upc', normalized: digitsOnly(trimmed), raw: trimmed };
  }

  if (looksLikePickupRef(trimmed)) {
    const compact = trimmed.replace(/\s+/g, '');
    return { kind: 'pickup_ref', normalized: compact, raw: trimmed };
  }

  return {
    kind: 'unknown',
    normalized: digitsOnly(trimmed) || trimmed.toUpperCase(),
    raw: trimmed,
  };
}
