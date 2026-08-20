/**
 * Segment perspective chords — Alt+1 / Alt+2 (… up to 3) flip the active
 * leaf’s child mode control — a flush `SearchableSelectField` since 2026-08-19
 * (Claim New·Link golden; `TabDisplay` is deleted).
 *
 * Distinct from nav-keys letters (`⌘;` → letter): these are modifier chords,
 * wedge-safe (bare digits never bind). Face labels come from
 * {@link segmentChordHint} so hint paint and the listener cannot drift.
 *
 * Spec: `docs/todo/displays-root-to-leaf-deferred-SOT-HANDOFF.md` Phase C;
 * Claim mounts always-visible hints (staff density) — other segments may stay
 * reveal-on-arm until they opt in.
 */

const MAX_SEGMENT_CHORDS = 3;

function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
    // iPadOS 13+ reports MacIntel
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform === 'macOS'
  );
}

/** 0-based index from Alt+Digit1…3 — null when not a segment chord. */
export function segmentChordIndexFromEvent(e: KeyboardEvent): number | null {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return null;
  // Prefer `code` — on macOS Alt+1 often yields `¡` / etc. on `key`.
  const m = /^Digit([1-3])$/.exec(e.code);
  if (!m) return null;
  const idx = Number(m[1]) - 1;
  if (idx < 0 || idx >= MAX_SEGMENT_CHORDS) return null;
  return idx;
}

/** Always-visible face for slot 1…3 — platform glyph, never a hand-typed twin. */
export function segmentChordHint(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SEGMENT_CHORDS) return '';
  const mod = isAppleModPlatform() ? '⌥' : 'Alt+';
  return `${mod}${slot}`;
}

export function isSegmentChordEditableTarget(node: EventTarget | null): boolean {
  const el = node instanceof HTMLElement ? node : null;
  const active =
    el ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (active.isContentEditable) return true;
  const role = active.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}
