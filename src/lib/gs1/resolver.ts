/**
 * GS1 Digital Link resolver.
 *
 * Two callers (public anon traffic and authenticated staff) scan the
 * same printed QR. This module decides the destination based on which
 * audience the caller is in:
 *
 *   resolvePublic()   → routes to the canonical Digital Link PAGE, which
 *                       renders the tenant's branded interstitial.
 *                       No DB lookups, no internal data exposed.
 *   resolveInternal() → walks a priority tree (location > serial > GTIN)
 *                       and returns the matching back-office URL.
 *
 * `resolveGs1()` is the orchestrator: parse the raw URL, branch on
 * `isInternal`, return a structured result the API/page can consume.
 *
 * DB lookups are passed in via `LookupDeps` so the lib stays testable
 * without a live Postgres. Default deps wire to the real query helpers.
 */

import { productDetailHref } from '@/components/products/products-view';
import { parseGs1DigitalLink, type Gs1Context } from './parser';
import { getLocationByBarcode } from '../neon/location-queries';
import { findByNormalizedSerial } from '../neon/serial-units-queries';
import { getSkuCatalogByGtin } from '../neon/sku-catalog-queries';

/**
 * Where an anonymous scan goes when the input carries no resolvable AI.
 *
 * Deliberately a RELATIVE path, not a storefront URL. This module used to
 * export `PUBLIC_LANDING_URL` (`NEXT_PUBLIC_STOREFRONT_URL ??
 * 'https://usavshop.com'`) and send every anon scan there — which was a
 * single-tenant assumption hiding in a multi-tenant resolver: once labels mint
 * on `{slug}.app.cycleforge.ai`, one workspace's sticker would have shipped a
 * customer to another workspace's shop. The tenant's own website now comes
 * from `brand.publicLandingUrl`, resolved by the interstitial at the landing
 * page — one place, per tenant, configurable by the tenant.
 */
export const PUBLIC_QR_FALLBACK_PATH = '/qr';

export type ResolverKind =
  | 'public'        // anon caller → storefront
  | 'location'      // matched AI 254
  | 'serial-unit'   // matched AI 21
  | 'sku'           // matched AI 01 (no serial)
  | 'fallback';     // authed caller but nothing recognised

export interface ResolverResult {
  kind: ResolverKind;
  /** Absolute (for public) or relative (for internal) URL to 302 to. */
  redirect: string;
  /** Matched DB row id where applicable — used by audit logging. */
  entityId?: string | number;
  /** The AI key that drove the match (e.g. '254', '21', '01'). */
  matchedAi?: string;
}

/** Lookup surface — overridable for tests. Each fn accepts the caller's org
 *  (undefined for anonymous/public scans, which never reach resolveInternal). */
export interface LookupDeps {
  getLocationByBarcode: (barcode: string, orgId?: string) => Promise<{ id: number } | null>;
  findByNormalizedSerial: (serial: string, orgId?: string) => Promise<{ id: number } | null>;
  getSkuCatalogByGtin: (gtin: string, orgId?: string) => Promise<{ sku: string } | null>;
}

const defaultDeps: LookupDeps = {
  getLocationByBarcode,
  findByNormalizedSerial,
  getSkuCatalogByGtin,
};

/**
 * Public branch — pure, no DB. An external scan still receives no contextual
 * deep-link: it is routed to the canonical Digital Link *page* for what it
 * scanned, and that page renders the tenant interstitial. The path is echoed
 * back from the parsed AIs, so nothing is looked up and nothing internal is
 * disclosed — a customer sees brand + "continue to website", never a record.
 *
 * Relative on purpose: `/gs1/resolve` resolves it against the request origin,
 * which for a platform-minted sticker IS `{slug}.app.cycleforge.ai` — so the
 * interstitial resolves the right tenant with no extra plumbing.
 */
export function resolvePublic(ctx: Gs1Context): ResolverResult {
  if (ctx.gln && ctx.locationCode) {
    return {
      kind: 'public',
      redirect: `/414/${encodeURIComponent(ctx.gln)}/254/${encodeURIComponent(ctx.locationCode)}`,
    };
  }
  if (ctx.gtin) {
    const base = `/01/${encodeURIComponent(ctx.gtin)}`;
    return {
      kind: 'public',
      redirect: ctx.serial ? `${base}/21/${encodeURIComponent(ctx.serial)}` : base,
    };
  }
  return { kind: 'public', redirect: PUBLIC_QR_FALLBACK_PATH };
}

/**
 * Internal branch — priority tree.
 *
 * Order matters when multiple AIs are present on the same QR:
 *   1. Location (AI 254) — physical-place scans win even if a GTIN
 *      sits beside them, because a staffer scanning a bin sticker
 *      wants the bin view.
 *   2. Serial (AI 21) — unique-unit scans take precedence over the
 *      product-class GTIN they're paired with.
 *   3. GTIN alone (AI 01) — product class, used for bulk SKUs.
 *   4. Fallback — known-good landing for unrecognised input.
 *
 * Lookups are best-effort: a missing row doesn't change the redirect,
 * since the target page already renders a sensible empty state.
 */
export async function resolveInternal(
  ctx: Gs1Context,
  deps: LookupDeps = defaultDeps,
  orgId?: string,
): Promise<ResolverResult> {
  if (ctx.locationCode) {
    const row = await deps.getLocationByBarcode(ctx.locationCode, orgId).catch(() => null);
    return {
      kind: 'location',
      redirect: `/inventory?bin=${encodeURIComponent(ctx.locationCode)}`,
      entityId: row?.id,
      matchedAi: '254',
    };
  }

  if (ctx.serial) {
    const row = await deps.findByNormalizedSerial(ctx.serial, orgId).catch(() => null);
    return {
      kind: 'serial-unit',
      redirect: `/serial/${encodeURIComponent(ctx.serial)}`,
      entityId: row?.id,
      matchedAi: '21',
    };
  }

  if (ctx.gtin) {
    const row = await deps.getSkuCatalogByGtin(ctx.gtin, orgId).catch(() => null);
    if (row?.sku) {
      return {
        kind: 'sku',
        redirect: productDetailHref(row.sku),
        entityId: row.sku,
        matchedAi: '01',
      };
    }
    // Unknown GTIN — staffer still gets useful context (the inventory
    // dashboard) rather than a 404.
    return { kind: 'fallback', redirect: '/inventory', matchedAi: '01' };
  }

  return { kind: 'fallback', redirect: '/inventory' };
}

/**
 * Top-level entry. Parses the raw scan, then dispatches to the public
 * or internal branch. Unparseable input always falls through to the
 * public landing for anon callers, or the staff dashboard for authed —
 * either way, no error surface is exposed to the scanner.
 */
export async function resolveGs1(
  rawInput: string,
  opts: { isInternal: boolean; deps?: LookupDeps; orgId?: string },
): Promise<ResolverResult> {
  const ctx = parseGs1DigitalLink(rawInput);
  if (!ctx) {
    return opts.isInternal
      ? { kind: 'fallback', redirect: '/inventory' }
      : { kind: 'public', redirect: PUBLIC_QR_FALLBACK_PATH };
  }
  return opts.isInternal
    ? resolveInternal(ctx, opts.deps ?? defaultDeps, opts.orgId)
    : resolvePublic(ctx);
}
