/**
 * Ecwid → `CanonicalOrderLine` adapter.
 *
 * Replaces `src/lib/ecwid/fetch-transfer-rows.ts`, which synthesized positional
 * row arrays (`row[colIndices.orderNumber] = …`) so Ecwid JSON could be pushed
 * through a spreadsheet-shaped pipeline. Every field now maps straight from the
 * API payload to a named field; nothing is addressed by column index, so an
 * Ecwid field can never land in the wrong slot because a sheet's header moved.
 *
 * The fetch (IO) and the map (pure) are separate exports so the mapping is unit
 * testable without network or credentials.
 */
import { cleanText, type CanonicalOrderLine } from '@/lib/orders/canonical-order';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';
const PAGE_LIMIT = 100;
const LOOKBACK_DAYS = 7;
const MAX_PAGES = 50;

/** Per-org Ecwid credentials resolved from the vault (organization_integrations). */
interface EcwidTransferCreds {
  storeId: string;
  token: string;
}

function requiredEnv(primary: string, aliases: string[] = []): string {
  for (const key of [primary, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  throw new Error(`Missing required environment variable: ${primary}`);
}

/**
 * Repair-service line items are a service charge, not a resold unit — they must
 * never become an order row in the fulfillment queue.
 */
function isRepairServiceSku(value: unknown): boolean {
  return cleanText(value).toUpperCase().endsWith('-RS');
}

/** Ecwid's placement instant. Unparseable / absent → null, never "now". */
function parseEcwidInstant(value: unknown): Date | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Map raw Ecwid order payloads to canonical lines — one line per item.
 *
 * Behavior preserved from the positional-array adapter it replaces:
 *   • order id is `orderNumber`, falling back to `id`; blank → the order is skipped;
 *   • tracking is read from any of the three shapes Ecwid has used;
 *   • an order with no items still yields ONE line (so the order itself lands);
 *   • the item SKU populates BOTH `sku` and `itemNumber` — Ecwid has a single
 *     identifier, and the writer's catalog resolution probes both keys;
 *   • `shipByDate` is ALWAYS null. Ecwid has no ship-by concept. It previously
 *     received the order's own placement date, which made every Ecwid order due
 *     at the instant the customer checked out — overdue before it was even
 *     ingested, and the reason Ecwid showed the worst average lateness of any
 *     channel (15 days) while nothing was actually wrong with its fulfilment.
 *     An unknown ship-by is null; the placement fact goes to `orderDate`.
 */
export function mapEcwidOrdersToCanonicalLines(ecwidOrders: unknown[]): CanonicalOrderLine[] {
  const lines: CanonicalOrderLine[] = [];

  for (const raw of ecwidOrders) {
    const order = (raw ?? {}) as Record<string, any>;
    const externalOrderId = cleanText(order.orderNumber ?? order.id);
    if (!externalOrderId) continue;

    const tracking = cleanText(
      order.trackingNumber ?? order.shippingTrackingNumber ?? order.shippingInfo?.trackingNumber,
    );
    const orderDate = parseEcwidInstant(order.createDate ?? order.created ?? order.date);
    const notes = cleanText(order.customerComments || order.orderComments);

    const items: unknown[] =
      Array.isArray(order.items) && order.items.length > 0 ? order.items : [{}];

    for (const rawItem of items) {
      const item = (rawItem ?? {}) as Record<string, any>;
      const sku = cleanText(item.sku);
      if (isRepairServiceSku(sku)) continue;

      lines.push({
        externalOrderId,
        // Ecwid exposes one identifier per item; the writer probes both keys.
        itemNumber: sku,
        sku,
        productTitle: cleanText(item.name),
        condition: '',
        quantity: cleanText(item.quantity) || '1',
        notes,
        accountSource: 'ecwid',
        // Ecwid fulfillment state is not read here — no lifecycle opinion.
        status: null,
        trackings: tracking ? [tracking] : [],
        shipByDate: null,
        orderDate,
        // Deliberately null: the positional adapter this replaces never carried
        // an Ecwid price, and the writer treats a non-null saleAmount as
        // authoritative (it overwrites on every sync). Ecwid's `item.price` is
        // per-unit, not the order total, so wiring it here would both change
        // behavior and probably write the wrong number. Populating Ecwid
        // revenue is a separate, deliberate change.
        saleAmount: null,
        // Ecwid carries no currency in this payload — null so the writer
        // defaults it on insert and never rewrites an existing order's.
        currency: null,
      });
    }
  }

  return lines;
}

async function fetchRecentEcwidOrders(storeId: string, token: string): Promise<unknown[]> {
  const createdFrom = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const orders: unknown[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/orders`);
    url.searchParams.set('createdFrom', createdFrom);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(PAGE_LIMIT));

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ecwid orders API ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { items?: unknown[] };
    const items = Array.isArray(data.items) ? data.items : [];
    orders.push(...items);

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return orders;
}

/**
 * Fetch this org's recent Ecwid orders as canonical lines.
 *
 * `creds` is the tenant's vault credential (connector layer) and wins. The
 * legacy `ECWID_*` env fallback is DOGFOOD-ONLY (those creds are the dogfood
 * store's) and is used only when the caller explicitly opts in; every other
 * tenant fails closed rather than syncing another org's store.
 */
export async function fetchEcwidCanonicalOrders(
  creds?: EcwidTransferCreds | null,
  opts?: { allowEnvFallback?: boolean },
): Promise<CanonicalOrderLine[]> {
  if ((!creds?.storeId || !creds?.token) && !opts?.allowEnvFallback) {
    throw new Error(
      'ECWID_NOT_CONNECTED: no Ecwid vault credentials for this org (env fallback is dogfood-only)',
    );
  }

  const storeId =
    creds?.storeId ||
    requiredEnv('ECWID_STORE_ID', ['ECWID_STOREID', 'ECWID_STORE', 'NEXT_PUBLIC_ECWID_STORE_ID']);
  const token =
    creds?.token ||
    requiredEnv('ECWID_API_TOKEN', [
      'ECWID_TOKEN',
      'ECWID_ACCESS_TOKEN',
      'NEXT_PUBLIC_ECWID_API_TOKEN',
    ]);

  return mapEcwidOrdersToCanonicalLines(await fetchRecentEcwidOrders(storeId, token));
}
