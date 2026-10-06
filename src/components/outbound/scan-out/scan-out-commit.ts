/**
 * Scan-out composer commit classifier — one OmnichannelComposerDock mouth.
 *
 * Tracking-shaped Enter → SHIP_CONFIRM. Prose / multi-line → note for the
 * last matched scan. Never fork the dock; never invent a second shell.
 */

/** Carrier tracking (or HID wedge paste) vs free-text package note. */
export function isScanOutTrackingCommit(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;

  // Multi-line paste is a note (or a list — scan-out is one label at a time).
  if (/\r?\n/.test(t)) return false;

  // Marketplace order #s are never carrier tracking on this station.
  if (/^\d{2}-\d{4,}-\d{4,}$/.test(t)) return false;
  if (/^\d{3}-\d{7}-\d{7}$/.test(t)) return false;

  // Sentence-shaped: spaces + several word tokens → note.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && /[a-zA-Z]{2,}/.test(t)) return false;

  // UPS.
  if (/^1Z[A-Z0-9]+$/i.test(t.replace(/[\s-]/g, ''))) return true;

  const compact = t.replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]+$/i.test(compact)) return false;
  // Short Ecwid / qty-like tokens stay notes; carrier ids are longer.
  if (compact.length < 10) return false;
  return true;
}

/**
 * Phone Out (`/m/scan`): a classified carrier label, or any label the desk
 * scan-out station would confirm. FBA carton ids are not carrier-shaped and
 * still leave.
 */
export function isMobileScanOutCommit(raw: string, routeType: string | null | undefined): boolean {
  return routeType === 'carrier-tracking' || isScanOutTrackingCommit(raw);
}
