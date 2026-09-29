import { normalizeEnvValue } from '@/lib/env-utils';
import { getIntegrationCredentials, type EbayCredentials } from '@/lib/integrations/credentials';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';

/** eBay Browse API client (secondary-market sourcing search). */

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const BROWSE_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const BROWSE_ITEM_URL = 'https://api.ebay.com/buy/browse/v1/item';
const APP_SCOPE = 'https://api.ebay.com/oauth/api_scope';

interface AppTokenCacheEntry {
  token: string;
  expiresAt: number;
}
const appTokenCache = new Map<string, AppTokenCacheEntry>();

async function getAppToken(creds: EbayCredentials): Promise<string> {
  const appId = normalizeEnvValue(creds.appId);
  const certId = normalizeEnvValue(creds.certId);
  if (!appId || !certId) throw new Error('Missing eBay app credentials (appId/certId)');

  const cacheKey = appId;
  const cached = appTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const base64Auth = Buffer.from(`${appId}:${certId}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: APP_SCOPE });

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${base64Auth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay app-token request failed: HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const ttlMs = Math.max(60, (data.expires_in || 7200) - 60) * 1000;
  appTokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + ttlMs });
  return data.access_token;
}

// ─── Browse search ───────────────────────────────────────────────────────────

export type BrowseCondition = 'new' | 'refurbished' | 'used' | 'for_parts';

/** Map our condition enum → eBay Browse `conditions` filter tokens. */
const CONDITION_FILTER: Record<BrowseCondition, string> = {
  new: 'NEW',
  refurbished: 'CERTIFIED_REFURBISHED|SELLER_REFURBISHED',
  used: 'USED',
  for_parts: 'FOR_PARTS_OR_NOT_WORKING',
};

export interface BrowseItemSummary {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string; currency?: string } }>;
  condition?: string;
  conditionId?: string;
  seller?: { username?: string; feedbackPercentage?: string };
  [k: string]: unknown;
}

interface BrowseSearchParams {
  q: string;
  conditions?: BrowseCondition[];
  maxPriceCents?: number | null;
  categoryIds?: string | null;
  limit?: number;
  orgId?: OrgId;
}

interface BrowseSearchResult {
  items: BrowseItemSummary[];
  total: number;
  href: string;
}

/**
 * Run a single Browse item_summary/search. Returns raw eBay item summaries —
 * normalization to the sourcing_candidates shape lives in sourcing/normalize.ts.
 * Resolves eBay creds per-org via the integrations layer (env fallback for USAV).
 */
export async function browseSearch(params: BrowseSearchParams): Promise<BrowseSearchResult> {
  const token = await getBrowseAppToken(params.orgId ?? DOGFOOD_ORG_ID);

  const filters: string[] = ['deliveryCountry:US'];
  if (params.conditions?.length) {
    const tokens = params.conditions.map((c) => CONDITION_FILTER[c]).filter(Boolean).join('|');
    if (tokens) filters.push(`conditions:{${tokens}}`);
  }
  if (params.maxPriceCents != null) {
    filters.push(`price:[..${(params.maxPriceCents / 100).toFixed(2)}],priceCurrency:USD`);
  }

  const search = new URLSearchParams({
    q: params.q,
    limit: String(Math.min(Math.max(params.limit ?? 20, 1), 50)),
  });
  if (filters.length) search.set('filter', filters.join(','));
  if (params.categoryIds) search.set('category_ids', params.categoryIds);

  const url = `${BROWSE_SEARCH_URL}?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay Browse search failed: HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    itemSummaries?: BrowseItemSummary[];
    total?: number;
    href?: string;
  };
  return {
    items: data.itemSummaries ?? [],
    total: data.total ?? 0,
    href: data.href ?? url,
  };
}

/**
 * The org's Browse application token (client-credentials grant). Throws when
 * no eBay keyset resolves or eBay rejects it (`invalid_client` = the App ID /
 * Cert ID pair is wrong or revoked) — the cheap "can we read listings?" probe.
 */
export async function getBrowseAppToken(orgId: OrgId): Promise<string> {
  const creds = await getIntegrationCredentials<EbayCredentials>(orgId, 'ebay');
  if (!creds) throw new Error('eBay credentials are not configured for this organization');
  return getAppToken(creds);
}

// ─── Browse item (by legacy item id) ─────────────────────────────────────────

interface BrowseImage {
  imageUrl?: string;
}

/** The image-bearing slice of `get_item_by_legacy_id` / `get_items_by_item_group`. */
interface BrowseItemImages {
  image?: BrowseImage;
  additionalImages?: BrowseImage[];
  items?: Array<{ image?: BrowseImage; additionalImages?: BrowseImage[] }>;
}

/** The listing's primary picture: the item's hero, else its first gallery shot, else the first variation's. */
export function pickEbayItemImage(payload: BrowseItemImages | null | undefined): string | null {
  const candidates = [
    payload?.image,
    ...(payload?.additionalImages ?? []),
    ...(payload?.items ?? []).flatMap((item) => [item.image, ...(item.additionalImages ?? [])]),
  ];
  for (const image of candidates) {
    const url = String(image?.imageUrl ?? '').trim();
    if (url) return url;
  }
  return null;
}

/** eBay's "this legacy id is a multi-variation listing; ask by item group" error. */
const BROWSE_ITEM_GROUP_ERROR_ID = 11006;

/** The primary picture of an eBay listing by its legacy (12-digit) item id. */
export async function getEbayItemImageUrl(legacyItemId: string, orgId: OrgId): Promise<string | null> {
  const token = await getBrowseAppToken(orgId);
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    Accept: 'application/json',
  };
  const id = encodeURIComponent(legacyItemId);

  const res = await fetch(`${BROWSE_ITEM_URL}/get_item_by_legacy_id?legacy_item_id=${id}`, { headers });
  if (res.ok) return pickEbayItemImage((await res.json()) as BrowseItemImages);

  const text = await res.text().catch(() => '');
  // Ended/purged legacy listings are an ordinary "no image at source" result
  // during a historical backfill, not an integration failure.
  if (res.status === 404 && text.includes('11003')) return null;
  const isItemGroup = res.status === 400 && text.includes(String(BROWSE_ITEM_GROUP_ERROR_ID));
  if (!isItemGroup) throw new Error(`eBay Browse get_item_by_legacy_id failed: HTTP ${res.status} ${text.slice(0, 300)}`);

  const group = await fetch(`${BROWSE_ITEM_URL}/get_items_by_item_group?item_group_id=${id}`, { headers });
  if (!group.ok) {
    const groupText = await group.text().catch(() => '');
    throw new Error(`eBay Browse get_items_by_item_group failed: HTTP ${group.status} ${groupText.slice(0, 300)}`);
  }
  return pickEbayItemImage((await group.json()) as BrowseItemImages);
}
