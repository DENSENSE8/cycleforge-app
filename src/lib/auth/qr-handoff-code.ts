/**
 * Desk→phone handoff human code. Pure — client + server.
 *
 * GateGuard: SignInQrScanDialog, qr-login claim-by-code, /m/claim.
 * User: type the code from the desk — number pad, no Caps Lock, no keyboard
 * switching.
 *
 * DIGITS ONLY, on purpose. The code used to be 4 Crockford base32 characters:
 * that forces the phone keyboard into alpha mode, makes the operator hop
 * between the letter and number planes, and needs Shift/Caps for a code that is
 * uppercase by definition. Six digits carries the same entropy (10^6 ≈ 32^4)
 * and lets the field raise a number pad — the whole code is one thumb sweep.
 */

/** Six digits ≈ 20 bits — the same space the old 4-char base32 code covered. */
export const HANDOFF_SHORT_CODE_LENGTH = 6;

const SHORT_CODE_RE = new RegExp(`^[0-9]{${HANDOFF_SHORT_CODE_LENGTH}}$`);

/** Canonical display / wire form. */
export function formatHandoffDisplayCode(shortCode: string): string {
  return shortCode.trim();
}

/**
 * Normalize typed / pasted pairing input to the short code, or null.
 * Accepts `481902`, `481 902`, `481-902`, and legacy `CF-481902` pastes.
 */
export function parseHandoffDisplayCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^CF[\s\-–—_]*/i, '')
    .replace(/[\s\-–—_]/g, '');

  if (!SHORT_CODE_RE.test(cleaned)) return null;
  return cleaned;
}

/** Live field formatter while typing — digits only, capped at the code length. */
export function formatHandoffCodeInput(raw: string): string {
  return raw
    .replace(/^CF[\s\-–—_]*/i, '')
    .replace(/[^0-9]/g, '')
    .slice(0, HANDOFF_SHORT_CODE_LENGTH);
}
