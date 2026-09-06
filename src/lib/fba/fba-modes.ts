/**
 * FBA inbound workbench stages (ready / plan / combine / shipped / catalog).
 *
 * These live as `?fbaMode=` on the canonical path `/shipping/fba`. Legacy
 * `/shipping?mode=fba` redirects there (next.config). Legacy `?mode=` on `/fba`
 * is still accepted by resolvers during the redirect window. Standalone
 * `/shipping/ready` permanently redirects here with `fbaMode=ready`.
 *   ready   — post-test channel allocation (FBA vs pre-box vs hold)
 *   plan    — staff add FNSKUs to today's planned board (PLANNED items)
 *   combine — combiner pulls PACKED items and combines under one FBA shipment ID
 *   shipped — shipped / history
 *   catalog — FNSKU catalog rows + CSV imports (ex-Admin › Amazon Prep,
 *             admin dissolution 2026-09-06)
 *
 * Pure data — no JSX. The facet tab UI is the shared `TableTabs` strip that
 * `FbaOutboundWorkspace` foots its body with.
 */

export type FbaMode = 'ready' | 'plan' | 'combine' | 'shipped' | 'catalog';

/** Query param for FBA lifecycle stages when nested under Outbound. */
export const FBA_MODE_PARAM = 'fbaMode' as const;

/** Canonical host path for the FBA inbound workbench (under Shipping). */
export const FBA_OUTBOUND_PATH = '/shipping/fba';

const FBA_MODES: FbaMode[] = ['ready', 'plan', 'combine', 'shipped', 'catalog'];

/** Live FBA mode wires — for route-param hygiene (never a hand-copied twin). */
export const FBA_MODE_WIRE = FBA_MODES;

/**
 * Wire tokens `?fbaMode=` may carry. Do not round-trip {@link resolveFbaMode}
 * — it always coerces to `combine`.
 */
export function parseFbaModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (FBA_MODES as string[]).includes(v) ? v : null;
}

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
  // When nested under /shipping, mode is labels|scan-out|fba — not an FBA sub-mode.
  // `ready` as legacy ?mode= is redirected to /shipping/fba?fbaMode=ready.
  if (
    legacy === 'ready' ||
    legacy === 'plan' ||
    legacy === 'combine' ||
    legacy === 'shipped'
  ) {
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
