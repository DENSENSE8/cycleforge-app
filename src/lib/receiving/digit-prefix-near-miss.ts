/** Truncation-tolerant tracking match for Zoho Reference# typos / field cuts. */

/** Digits only — used for prefix comparison (letters/spaces stripped). */
export function trackingDigits(input: string): string {
  return String(input || '').replace(/\D/g, '');
}

/**
 * True when digit strings differ and the shorter is a prefix of the longer,
 * with length delta in `[1, maxDelta]` (default 2).
 */
export function isDigitPrefixNearMiss(
  aDigits: string,
  bDigits: string,
  maxDelta = 2,
): boolean {
  if (!aDigits || !bDigits || aDigits === bDigits) return false;
  const delta = Math.abs(aDigits.length - bDigits.length);
  if (delta < 1 || delta > maxDelta) return false;
  const [shorter, longer] =
    aDigits.length < bDigits.length ? [aDigits, bDigits] : [bDigits, aDigits];
  return longer.startsWith(shorter);
}
