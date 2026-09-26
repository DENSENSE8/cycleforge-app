/** Single source of truth for the `view` axis on `/api/receiving-lines`. */

/** Every server-supported value of `?view=`. */
export const RECEIVING_VIEWS = [
  'all',
  'received',
  'incoming',
  'incoming_removed',
  'activity',
  'scanned',
  'unbox_opened',
  'testing',
  'needs-test',
  'testing_opened',
  'viewed',
] as const;

export type ReceivingView = (typeof RECEIVING_VIEWS)[number];

const RECEIVING_VIEW_SET: ReadonlySet<string> = new Set(RECEIVING_VIEWS);

/** True when `value` is one of the known {@link RECEIVING_VIEWS}. */
export function isReceivingView(value: unknown): value is ReceivingView {
  return typeof value === 'string' && RECEIVING_VIEW_SET.has(value);
}

/**
 * Parse a raw `?view=` query value. Returns the matched {@link ReceivingView},
 * or `null` for anything unrecognized/absent (the server treats `null` as
 * org-wide default scoping).
 */
export function parseReceivingView(raw: string | null | undefined): ReceivingView | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return isReceivingView(normalized) ? normalized : null;
}
