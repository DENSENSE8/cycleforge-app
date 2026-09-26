/** `?incview=` — leftover Incoming right-pane tokens. */

const INCOMING_VIEWS = ['pos'] as const;

/** Only live collection face — the Incoming POS table. */
type IncomingView = (typeof INCOMING_VIEWS)[number];

const VIEW_SET: ReadonlySet<string> = new Set(INCOMING_VIEWS);

/** `pos` is the implicit default and is dropped from the URL. */
function parseIncomingView(raw: string | null | undefined): IncomingView {
  const value = String(raw ?? '').trim().toLowerCase();
  return VIEW_SET.has(value) ? (value as IncomingView) : 'pos';
}

/**
 * Wire tokens `?incview=` may carry (route-param hygiene).
 * Do not round-trip {@link parseIncomingView} — it always coerces to `pos`.
 */
export function parseIncomingViewWire(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return VIEW_SET.has(value) ? value : null;
}
