/** Desk→phone handoff human code. */

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
