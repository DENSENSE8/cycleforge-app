/**
 * `?incview=` — which right-pane sub-view Incoming is showing.
 *
 * Its own leaf module (2026-08-02) because the vocabulary had multiple values
 * and TWO readers were each re-deriving it with an inline ternary. One parser,
 * imported. `removed` (Recently removed) was deleted 2026-08-10 — wire tokens
 * coerce to `pos`.
 *
 * Dependency-free so `useReceivingModeContext` can compose it without pulling
 * `EmailTriagePanel` into its graph.
 */

export const INCOMING_VIEWS = ['pos', 'email'] as const;

/**
 * - `pos`   — the default Incoming lane (expected, untouched).
 * - `email` — the unmatched shipping-email worklist.
 */
export type IncomingView = (typeof INCOMING_VIEWS)[number];

const VIEW_SET: ReadonlySet<string> = new Set(INCOMING_VIEWS);

/** `pos` is the implicit default and is dropped from the URL. */
export function parseIncomingView(raw: string | null | undefined): IncomingView {
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
