/**
 * Desk→phone handoff human code (4 Crockford chars). Pure — client + server.
 *
 * GateGuard: SignInQrScanDialog, qr-login claim-by-code, /m/claim.
 * User: type the four characters from the desk — no CF- prefix.
 */

/** Crockford base32 without I/L/O/U — readable on a desk screen. */
export const HANDOFF_SHORT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const SHORT_CODE_RE = new RegExp(
  `^[${HANDOFF_SHORT_CODE_ALPHABET}]{4}$`,
  'i',
);

/** Canonical display / wire form — uppercase 4-char code (no brand prefix). */
export function formatHandoffDisplayCode(shortCode: string): string {
  return shortCode.toUpperCase();
}

/**
 * Normalize typed / pasted pairing input to the 4-char short code, or null.
 * Accepts: `7K4M`, `7k4m`, and legacy `CF-7K4M` / `cf 7k4m` pastes.
 */
export function parseHandoffDisplayCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/^CF[\s\-–—_]*/i, '')
    .replace(/[\s\-–—_]/g, '');

  if (!SHORT_CODE_RE.test(cleaned)) return null;
  return cleaned;
}

/**
 * Live field formatter while typing — up to 4 Crockford chars, uppercase.
 * Does not inject a CF- prefix; the phone only needs the code on the desk.
 */
export function formatHandoffCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^CF[\s\-–—_]*/i, '')
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '')
    .slice(0, 4);
}
