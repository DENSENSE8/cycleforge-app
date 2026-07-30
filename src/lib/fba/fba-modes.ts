/**
 * FBA board sub-modes (plan / combine / shipped).
 *
 * These live as `?fbaMode=` on the canonical path `/shipping/fba`. Legacy
 * `/shipping?mode=fba` redirects there (next.config). Legacy `?mode=` on `/fba`
 * is still accepted by resolvers during the redirect window.
 *
 *   plan    — staff add FNSKUs to today's planned board (PLANNED items)
 *   combine — combiner pulls PACKED items and combines under one FBA shipment ID
 *   shipped — shipped / history
 *
 * Pure data — no JSX. The facet tab UI lives in `FbaWorkspaceHeader`
 * (content-chrome `TabSwitch` via `WorkbenchChromeHeader`).
 */

export type FbaMode = 'plan' | 'combine' | 'shipped';

/** Query param for FBA plan/combine/shipped when nested under Outbound. */
export const FBA_MODE_PARAM = 'fbaMode' as const;

/** Canonical host path for the FBA prep station (under Shipping). */
export const FBA_OUTBOUND_PATH = '/shipping/fba';

const FBA_MODES: FbaMode[] = ['plan', 'combine', 'shipped'];

/**
 * Params the legacy `/fba` redirect forwards to {@link FBA_OUTBOUND_PATH}.
 *
 * `/fba` is a server-side `redirect()`, not a surface, so it deliberately has no
 * entry in the routing registry (`@/lib/routing/registry`) — the same treatment
 * `/tech` and `/packer` get as aliases. But that makes the redirect a HAND-OFF,
 * and a hand-off only works if the DESTINATION declares what it carries: an
 * undeclared key is dropped by the boundary parse the moment `/shipping/fba`
 * parses, so an old bookmark would land on the board with its focus and filters
 * silently gone.
 *
 * Kept as a named list rather than inline in `app/fba/page.tsx` so
 * `fba-modes.test.ts` can assert every key is owned by the FBA spec. Adding a key
 * to the redirect without declaring it downstream is now a failing test instead of
 * a quiet data loss.
 */
export const FBA_LEGACY_REDIRECT_FORWARDED_PARAMS = [
  'q',
  'r',
  'plan',
  'draft',
  'main',
  'details',
] as const;

/** Resolve the active FBA sub-mode from a raw param value, defaulting to combine. */
export function resolveFbaMode(raw: string | null | undefined): FbaMode {
  const v = String(raw || '').trim().toLowerCase();
  return (FBA_MODES as string[]).includes(v) ? (v as FbaMode) : 'combine';
}

/**
 * Read FBA sub-mode from URL search params. Prefer `fbaMode`; fall back to
 * legacy `mode` when not on an outbound-owned mode value.
 */
export function resolveFbaModeFromSearchParams(
  params: Pick<URLSearchParams, 'get'>,
): FbaMode {
  const nested = params.get(FBA_MODE_PARAM);
  if (nested) return resolveFbaMode(nested);
  const legacy = params.get('mode');
  // When nested under /shipping, mode is labels|scan-out|ready|fba — not an FBA sub-mode.
  if (legacy === 'plan' || legacy === 'combine' || legacy === 'shipped') {
    return resolveFbaMode(legacy);
  }
  return 'combine';
}

/** Build `/shipping/fba?…` URL for deep links (dashboard, cmd-K, redirects). */
export function fbaOutboundHref(opts?: {
  fbaMode?: FbaMode | null;
  openShipmentId?: string | number | null;
  extra?: Record<string, string | null | undefined>;
}): string {
  const params = new URLSearchParams();
  const fm = opts?.fbaMode;
  if (fm && fm !== 'combine') params.set(FBA_MODE_PARAM, fm);
  if (opts?.openShipmentId != null && String(opts.openShipmentId).trim()) {
    params.set('openShipmentId', String(opts.openShipmentId));
  }
  if (opts?.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${FBA_OUTBOUND_PATH}?${qs}` : FBA_OUTBOUND_PATH;
}
