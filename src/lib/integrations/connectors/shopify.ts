/**
 * Shopify connector sync adapter — connection-driven order ingestion.
 *
 * Shopify is a Nango-connected storefront (authKind 'nango'), mirroring Square:
 * the hosted Connect flow lands a connection marker in organization_integrations
 * and Nango custodies the OAuth token + its refresh. This adapter is the only
 * net-new code per provider — it pulls the org's Shopify orders and upserts them
 * into `orders` with the SAME shape eBay/Amazon/Square use (account_source /
 * sale_amount / currency), so every downstream surface (price chip, tracker,
 * source-platform label) renders it generically.
 *
 * Transport: Shopify's GraphQL Admin API through Nango's proxy. REST is avoided
 * on purpose — its cursor pagination lives in the `Link` response header, which
 * `nangoProxy` discards (it returns the body only). GraphQL carries the cursor
 * in the JSON body (`pageInfo.endCursor`), so it paginates cleanly through the
 * proxy and never handles a raw token. A vault paste-key fallback
 * (ShopifyCredentials.shopDomain + accessToken) covers orgs on the non-Nango
 * path or a custom-app token.
 *
 * Reuses:
 *   - nangoProxy / getIntegrationCredentials (token + shop resolution)
 *   - the orders upsert shape from src/lib/integrations/connectors/square.ts
 *     (idx_orders_unique_account_order)
 *   - getSyncCursor / updateSyncCursor for the incremental updated_at watermark
 *
 * Lazily imported by the registry so the connection reader never pulls in this
 * module.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestConnectorOrders } from './ingest-connector-orders';
import { getIntegrationCredentials, type ShopifyCredentials } from '@/lib/integrations/credentials';
import { getNangoConnection, isNangoConfigured, nangoProxy } from '@/lib/integrations/nango';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import type { HealthResult, SyncOutcome } from './types';

const ACCOUNT_SOURCE = 'shopify';
/** Seeded on a brand-new row only; never overwrites a real title. */
const SHOPIFY_TITLE_FALLBACK = 'Shopify order';
/** Admin API version for the vault-direct fallback. The Nango proxy pins the
 *  version in the provider template, so this only applies off the Nango path. */
const DEFAULT_API_VERSION = '2024-10';
// First-run lookback when no watermark exists yet.
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100; // Shopify GraphQL caps `orders(first:)` at 250; 100 is safe.
const MAX_PAGES = 50; // safety bound: 50 * 100 = 5k orders / run.

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface ShopMoney { amount?: string; currencyCode?: string }
interface ShopifyLineItemNode { title?: string; quantity?: number }
interface ShopifyOrderNode {
  legacyResourceId?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  displayFulfillmentStatus?: string;
  currentTotalPriceSet?: { shopMoney?: ShopMoney };
  lineItems?: { edges?: Array<{ node?: ShopifyLineItemNode }> };
}
interface OrdersPage {
  orders?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    edges?: Array<{ node?: ShopifyOrderNode }>;
  };
}
interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

/**
 * Run one GraphQL query. Prefers the Nango proxy (app never sees the token);
 * falls back to a direct call with the vault paste-key credential when Nango
 * isn't configured. Throws on transport or GraphQL-level errors.
 */
async function shopifyGraphql<T>(
  orgId: OrgId,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let body: GraphqlResponse<T>;

  // Branch on whether THIS ORG has a Nango connection — not on whether Nango is
  // configured process-wide. `isNangoConfigured()` only reports that
  // NANGO_SECRET_KEY is present, which is true on every environment that has
  // ever connected any Nango provider (Square, today). It said nothing about
  // Shopify, so a Shopify-on-vault org took the Nango branch and died in
  // nangoProxy with "No Nango connection for shopify" — while the vault
  // fallback below sat unreachable in the `else`.
  //
  // Shopify cannot even obtain a connection marker yet: the connect flow gates
  // on NANGO_BACKED_PROVIDERS (src/lib/integrations/nango-providers.ts), which
  // lists only `square`. So this branch is currently always false and the vault
  // path is the live one — as intended until the Nango dashboard config lands.
  const nangoConn = isNangoConfigured() ? await getNangoConnection(orgId, 'shopify') : null;

  if (nangoConn) {
    body = await nangoProxy<GraphqlResponse<T>>(orgId, 'shopify', {
      endpoint: '/graphql.json',
      method: 'POST',
      data: { query, variables },
    });
  } else {
    const creds = await getIntegrationCredentials<ShopifyCredentials>(orgId, 'shopify');
    if (!creds?.shopDomain || !creds.accessToken) {
      throw new Error('not connected (no Nango connection and no vault credentials)');
    }
    const version = creds.apiVersion || DEFAULT_API_VERSION;
    const res = await fetch(
      `https://${creds.shopDomain}/admin/api/${version}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': creds.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (!res.ok) throw new Error(`admin API ${res.status}`);
    body = (await res.json()) as GraphqlResponse<T>;
  }

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).filter(Boolean).join('; ') || 'graphql error');
  }
  if (!body.data) throw new Error('graphql: empty response');
  return body.data;
}

/** One representative line for the orders row (Shopify orders are multi-line). */
function summarizeLines(node: ShopifyOrderNode): { title: string; quantity: number } {
  const lines = (node.lineItems?.edges ?? []).map((e) => e.node).filter(Boolean) as ShopifyLineItemNode[];
  const quantity = lines.reduce((s, li) => s + (Number(li.quantity) || 0), 0) || 1;
  const first = lines.find((li) => (li.title ?? '').trim())?.title?.trim();
  const title = !first
    ? SHOPIFY_TITLE_FALLBACK
    : lines.length > 1
      ? `${first} +${lines.length - 1} more`
      : first;
  return { title, quantity };
}

/** Map a Shopify order node to a canonical line. Title '' means "unknown" —
 *  the writer seeds the placeholder only on a brand-new row. */
function toCanonicalLine(node: ShopifyOrderNode): CanonicalOrderLine {
  const { title, quantity } = summarizeLines(node);
  // GraphQL money is a decimal string (e.g. "42.00") — already in major units,
  // unlike Square's integer cents. Do NOT divide.
  const rawAmount = node.currentTotalPriceSet?.shopMoney?.amount;
  return {
    // legacyResourceId is the stable numeric id; fall back to the order name.
    externalOrderId: String(node.legacyResourceId || node.name || ''),
    itemNumber: '',
    sku: '',
    productTitle: title === SHOPIFY_TITLE_FALLBACK ? '' : title,
    condition: '',
    quantity: String(quantity),
    notes: '',
    accountSource: ACCOUNT_SOURCE,
    trackings: [],
    shipByDate: null,
    orderDate: node.createdAt ? new Date(node.createdAt) : null,
    saleAmount:
      rawAmount != null && rawAmount !== '' && Number.isFinite(Number(rawAmount))
        ? String(Number(rawAmount))
        : null,
    currency: node.currentTotalPriceSet?.shopMoney?.currencyCode || 'USD',
    // A fully fulfilled Shopify order is realized — mark shipped so it lands in
    // the tracker as completed (mirrors Square/Amazon read-only ingestion).
    status: node.displayFulfillmentStatus === 'FULFILLED' ? 'shipped' : 'unassigned',
  };
}

const SHOP_QUERY = `query { shop { name } }`;

const ORDERS_QUERY = `query($cursor: String, $q: String) {
  orders(first: ${PAGE_SIZE}, after: $cursor, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        legacyResourceId
        name
        createdAt
        updatedAt
        displayFulfillmentStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 10) { edges { node { title quantity } } }
      }
    }
  }
}`;

/** Health-check the stored Shopify connection (subsumes an ad-hoc /health). */
export async function shopifyValidate(orgId: OrgId): Promise<HealthResult> {
  try {
    const data = await shopifyGraphql<{ shop?: { name?: string } }>(orgId, SHOP_QUERY, {});
    if (!data.shop?.name) return { ok: false, error: 'shopify: no shop returned (is the connection live?)' };
    return { ok: true, detail: { shop: data.shop.name } };
  } catch (e) {
    return { ok: false, error: `shopify: ${msg(e)}` };
  }
}

/** Connection-driven order ingestion. Incremental on the updated_at watermark. */
export async function shopifySync(orgId: OrgId): Promise<SyncOutcome> {
  const cursorKey = `shopify:orders:${orgId}`;
  const since = (await getSyncCursor(cursorKey)) ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  // Shopify search syntax: `updated_at:>=<ISO8601>`.
  const q = `updated_at:>=${since.toISOString()}`;

  let maxUpdatedAt = since.getTime();
  let cursor: string | null | undefined;
  const lines: CanonicalOrderLine[] = [];

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await shopifyGraphql<OrdersPage>(orgId, ORDERS_QUERY, { cursor: cursor ?? null, q });
      const edges = data.orders?.edges ?? [];

      for (const edge of edges) {
        const node = edge.node;
        if (!node || (!node.legacyResourceId && !node.name)) continue;
        lines.push(toCanonicalLine(node));
        const ts = node.updatedAt ? Date.parse(node.updatedAt) : NaN;
        if (Number.isFinite(ts) && ts > maxUpdatedAt) maxUpdatedAt = ts;
      }

      if (!data.orders?.pageInfo?.hasNextPage) break;
      cursor = data.orders.pageInfo.endCursor;
      if (!cursor) break;
    }

    // One ingest for the whole run, so the cache bust + realtime publish fire
    // once rather than per page.
    const counts = await ingestConnectorOrders(orgId, ACCOUNT_SOURCE, lines, {
      fallbackProductTitle: SHOPIFY_TITLE_FALLBACK,
    });

    // Advance the watermark only on a clean run so a failure re-pulls.
    if (maxUpdatedAt > since.getTime()) {
      await updateSyncCursor(cursorKey, new Date(maxUpdatedAt));
    }

    return {
      ok: true,
      imported: counts.imported,
      updated: counts.updated,
      cursor: new Date(maxUpdatedAt).toISOString(),
    };
  } catch (e) {
    return { ok: false, error: `shopify: ${msg(e)}` };
  }
}
