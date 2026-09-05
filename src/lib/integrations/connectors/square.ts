/**
 * Square connector sync adapter — connection-driven order ingestion.
 *
 * Square is the Nango pilot: auth (the hosted Connect flow + token rotation)
 * already lands a connection in organization_integrations. This adapter is the
 * "only net-new code per provider" the README describes — it pulls the org's
 * Square orders through the tenant-aware client and upserts them into `orders`
 * with the SAME shape eBay/Amazon use (account_source / sale_amount / currency),
 * so every downstream surface (price chip, tracker, source-platform label)
 * renders it generically.
 *
 * Reuses:
 *   - resolveSquareConfig / squareFetchForOrg (Nango token, env fallback)
 *   - the orders upsert shape from src/lib/ebay/sync.ts (idx_orders_unique_org_account_order_line)
 *   - getSyncCursor / updateSyncCursor for the incremental updated_at watermark
 *
 * Lazily imported by the registry so the connection reader never pulls in the
 * Square client.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestConnectorOrders } from './ingest-connector-orders';
import { squareFetchForOrg } from '@/lib/square/server';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import type { SyncOutcome } from './types';

const ACCOUNT_SOURCE = 'square';
/** Seeded on a brand-new row only; never overwrites a real title. */
const SQUARE_TITLE_FALLBACK = 'Square order';
// First-run lookback when no watermark exists yet (Square POS history is small).
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 200;
const MAX_PAGES = 25; // safety bound: 25 * 200 = 5k orders / run

interface SquareMoney { amount?: number; currency?: string }
interface SquareLineItem {
  uid?: string;
  name?: string;
  quantity?: string;
  catalog_object_id?: string;
  total_money?: SquareMoney;
}
interface SquareOrder {
  id?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  total_money?: SquareMoney;
  line_items?: SquareLineItem[];
}

/** Resolve the location ids to search. Prefer the configured location; else ask
 *  Square for the org's active locations (Orders Search requires ≥1). */
async function resolveLocationIds(orgId: OrgId): Promise<string[]> {
  const res = await squareFetchForOrg<{ locations?: Array<{ id?: string; status?: string }> }>(
    orgId,
    '/locations',
    { method: 'GET' },
  );
  if (!res.ok) return [];
  return (res.data.locations ?? [])
    .filter((l) => l.id && (l.status ?? 'ACTIVE') === 'ACTIVE')
    .map((l) => l.id as string)
    .slice(0, 10); // Square caps location_ids at 10 per search
}

/** One canonical line per Square line item. Empty line_items still emit one
 *  order-level stub so the register sale itself lands. */
export function mapSquareOrderToCanonicalLines(order: SquareOrder): CanonicalOrderLine[] {
  const externalOrderId = String(order.id ?? '');
  const orderDate = order.created_at ? new Date(order.created_at) : null;
  const status = order.state === 'COMPLETED' ? 'shipped' : 'unassigned';
  const items = order.line_items ?? [];
  const orderAmount =
    typeof order.total_money?.amount === 'number' ? String(order.total_money.amount / 100) : null;
  const orderCurrency = order.total_money?.currency || 'USD';

  const base = {
    externalOrderId,
    itemNumber: '',
    sku: '',
    condition: '',
    notes: '',
    customerName: '',
    accountSource: ACCOUNT_SOURCE,
    trackings: [] as string[],
    shipByDate: null as Date | null,
    orderDate,
    status,
  };

  if (items.length === 0) {
    return [{
      ...base,
      externalLineId: '',
      productTitle: '',
      quantity: '1',
      saleAmount: orderAmount,
      currency: orderCurrency,
    }];
  }

  return items.map((li) => {
    const lineAmount =
      typeof li.total_money?.amount === 'number' ? String(li.total_money.amount / 100) : null;
    return {
      ...base,
      externalLineId: String(li.uid ?? '').trim(),
      productTitle: (li.name ?? '').trim(),
      quantity: String(li.quantity || 1),
      saleAmount: lineAmount,
      currency: li.total_money?.currency || orderCurrency,
    };
  });
}

export async function squareSync(orgId: OrgId): Promise<SyncOutcome> {
  const cursorKey = `square:orders:${orgId}`;
  let locationIds: string[];
  try {
    locationIds = await resolveLocationIds(orgId);
  } catch (e) {
    return { ok: false, error: `square: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (locationIds.length === 0) {
    return { ok: false, error: 'square: no active locations (is the connection live?)' };
  }

  const since = (await getSyncCursor(cursorKey)) ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  let maxUpdatedAt = since.getTime();
  let pageCursor: string | undefined;
  const lines: CanonicalOrderLine[] = [];

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await squareFetchForOrg<{ orders?: SquareOrder[]; cursor?: string }>(
        orgId,
        '/orders/search',
        {
          method: 'POST',
          body: {
            location_ids: locationIds,
            limit: PAGE_LIMIT,
            ...(pageCursor ? { cursor: pageCursor } : {}),
            query: {
              filter: {
                date_time_filter: { updated_at: { start_at: since.toISOString() } },
                state_filter: { states: ['OPEN', 'COMPLETED'] },
              },
              sort: { sort_field: 'UPDATED_AT', sort_order: 'ASC' },
            },
          },
        },
      );

      if (!res.ok) {
        const detail = res.errors?.map((e) => e.detail || e.code).filter(Boolean).join('; ');
        return { ok: false, error: `square orders/search ${res.status}: ${detail || 'request failed'}` };
      }

      const orders = res.data.orders ?? [];
      for (const order of orders) {
        if (!order.id) continue;
        lines.push(...mapSquareOrderToCanonicalLines(order));
        const ts = order.updated_at ? Date.parse(order.updated_at) : NaN;
        if (Number.isFinite(ts) && ts > maxUpdatedAt) maxUpdatedAt = ts;
      }

      pageCursor = res.data.cursor;
      if (!pageCursor) break;
    }

    // One ingest for the whole run, so the cache bust + realtime publish fire
    // once rather than per page.
    const counts = await ingestConnectorOrders(orgId, ACCOUNT_SOURCE, lines, {
      fallbackProductTitle: SQUARE_TITLE_FALLBACK,
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
    return { ok: false, error: `square: ${e instanceof Error ? e.message : String(e)}` };
  }
}
