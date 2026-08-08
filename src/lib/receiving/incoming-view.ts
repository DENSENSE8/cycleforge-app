/**
 * `?incview=` — which right-pane sub-view Incoming is showing.
 *
 * Its own leaf module (2026-08-02) because the vocabulary now has three values
 * and TWO readers were each re-deriving it with an inline
 * `get('incview') === 'email' ? 'email' : 'pos'` ternary. A third value has to
 * be added to every such ternary, and the one that gets missed silently falls
 * back to `pos` — the surface renders the default lane while the rail says
 * otherwise. One parser, imported.
 *
 * Dependency-free so `useReceivingModeContext` can compose it without pulling
 * `EmailTriagePanel` (which re-exports the type) into its graph.
 */

export const INCOMING_VIEWS = ['pos', 'email', 'removed'] as const;

/**
 * - `pos`     — the default Incoming lane (expected, untouched).
 * - `email`   — the unmatched shipping-email worklist.
 * - `removed` — "where did it go": rows that HAVE left the lane, each stating
 *               why. A lookup surface, not an attention tile.
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
