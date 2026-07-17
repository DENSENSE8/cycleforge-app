/**
 * Station Timeline subtitle helpers — quiet footnotes vs raw machine status trails.
 *
 * Inventory adapters emit `PREV → NEXT` (e.g. `RECEIVED → ON_HOLD`) as subtitle.
 * On Station floor that duplicates the human title ("Tested — Fail") in a second
 * dialect; omit it. Other subtitles (location, notes, photo counts) stay.
 */

/** Raw inventory/machine status trail like `RECEIVED → ON_HOLD`. */
export function isRawStatusTrailSubtitle(subtitle: string | null | undefined): boolean {
  if (!subtitle) return false;
  return /^[A-Z][A-Z0-9_]*\s*→\s*[A-Z][A-Z0-9_]*$/.test(subtitle.trim());
}

/**
 * Soften `RECEIVED → ON_HOLD` → `Received → On hold` when a quiet footnote is
 * still wanted (non-Station surfaces). Station anatomy omits these instead.
 */
export function softenStatusTrailSubtitle(subtitle: string): string {
  return subtitle
    .trim()
    .split(/\s*→\s*/)
    .map((part) =>
      part
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
    .join(' → ');
}
