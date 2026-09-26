/** GS1 Digital Link resolver. */

import { productDetailHref } from '@/components/products/products-view';
import { parseGs1DigitalLink, type Gs1Context } from './parser';
import { getLocationByBarcode } from '../neon/location-queries';
import { findByNormalizedSerial } from '../neon/serial-units-queries';
import { getSkuCatalogByGtin } from '../neon/sku-catalog-queries';

/** Where an anonymous scan goes when the input carries no resolvable AI. */
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

/** Public branch — pure, no DB. */
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

/** Internal branch — priority tree. */
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

/** Top-level entry. */
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
