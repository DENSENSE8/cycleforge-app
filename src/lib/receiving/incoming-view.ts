/**
 * `?incview=` — leftover Incoming right-pane tokens.
 *
 * Email Triage (`email`) and Recently removed (`removed`) were deleted.
 * Unknown / retired tokens coerce to `pos` so bookmarked URLs land on the
 * POS table. Hygiene strips anything that is not a live value.
 *
 * Dependency-free so `useReceivingModeContext` can compose it without pulling
 * Incoming chrome into its graph.
 */

export const INCOMING_VIEWS = ['pos'] as const;

/** Only live collection face — the Incoming POS table. */
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
