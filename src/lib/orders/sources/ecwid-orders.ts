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
import {
  cleanText,
  parseSaleAmount,
  type CanonicalOrderLine,
} from '@/lib/orders/canonical-order';

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
 * Units on this line, for the money math only.
 *
 * Ecwid's `price` is PER UNIT, so this multiplier decides whether the line's
 * money is right. A blank, unparseable or non-positive quantity is one unit —
 * the same reading the `quantity` field itself gets — and never zero, which
 * would turn a real price into a claim that the line was free.
 */
function parseEcwidLineUnits(value: unknown): number {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * This line's money as a decimal string.
 *
 * `orders.sale_amount` is line-grained (one row per item), so the order total
 * is the wrong fact: it would over-report every line of a multi-item order.
 * Ecwid's v3 order items carry no line-total key in the payloads this store
 * returns, so the number is unit price × quantity; an explicit `item.total` is
 * still preferred where a payload does carry one, because Ecwid applies
 * per-line coupon and volume discounts that the source's own total already
 * reflects and unit × quantity cannot.
 *
 * Order-level `total` is deliberately NOT a fallback: it includes tax and
 * shipping (a live order shows two units at $28.00 on a $74.15 total), so
 * adopting it would book freight and tax as merchandise revenue.
 *
 * Always two decimals, on every path. Ecwid serializes its own float dust —
 * a $36.88 line arrives as `36.879999999999995` — and binary multiplication
 * adds more (18.88 × 2 is 37.759999999999998). `orders.sale_amount` is
 * numeric(12,2) and would round it away silently, which leaves the rounding
 * undocumented and makes every log line and backfill dry-run report carry 15
 * digits of noise for a two-decimal fact.
 *
 * Null — never `'0'` — when the payload carries no price. `parseSaleAmount`
 * owns that distinction, and it matters permanently here: the writer treats a
 * non-null saleAmount as authoritative and rewrites it on every sync, so a
 * zero would erase an operator's corrected number for good, with no source
 * value left to restore it from.
 */
function resolveEcwidLineSaleAmount(item: Record<string, unknown>, units: number): string | null {
  const lineTotal = parseSaleAmount(item.total);
  if (lineTotal !== null) return Number(lineTotal).toFixed(2);

  // `price` is the transacted per-unit figure and includes item options and
  // surcharges that `productPrice` does not (a live line: price 36.88 against
  // productPrice 26.88), so the base price only stands in when the order item
  // omits `price` entirely.
  const unitPrice = parseSaleAmount(item.price ?? item.productPrice);
  if (unitPrice === null) return null;

  // Round to cents BEFORE multiplying, so the quantity multiplies a real price
  // rather than amplifying the source's float dust.
  return ((Math.round(Number(unitPrice) * 100) * units) / 100).toFixed(2);
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
 *
 * Added 2026-09-23: `buyer`. Every Ecwid order landed with
 * `orders.customer_id IS NULL` (494/494) because this mapper dropped the
 * customer block the payload already carried. See the body for the tiering.
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
    // Ecwid carries an order currency only on some stores — the v3 orders this
    // store returns have no `currency` key at all. Null when absent, so the
    // writer defaults it on insert and never rewrites an existing order's
    // currency from a source that never knew it.
    const currency = cleanText(order.currency).toUpperCase() || null;

    // The BUYER, in the transport shape `resolveBuyerCustomers` reads. This is
    // never persisted onto `orders` — only the customer id it resolves to is —
    // so populating it costs one object per order and closes the reason every
    // Ecwid order carried `customer_id IS NULL` (494/494 before this).
    //
    // `customerId` is Ecwid's storefront account and is the TIER-1 key
    // (CHANNEL_IDENTITY_COLUMNS.ecwid → customers.ecwid_customer_id): it
    // survives a buyer changing their email or phone, which neither of the
    // lower tiers do. Shipping person wins over billing for contact because
    // that is who the unit is going back to.
    //
    // The name is deliberately NOT an identity here: `buyerIdentityKey` returns
    // null without an id/email/phone, and the whole block is dropped rather
    // than resolved by name — two different "John Smith"s must never merge.
    const shippingPerson = (order.shippingPerson ?? {}) as Record<string, any>;
    const billingPerson = (order.billingPerson ?? {}) as Record<string, any>;
    // `||`, not `??`: Ecwid sends present-but-empty strings on these, and a
    // nullish fallback would keep the empty one.
    const buyerName = cleanText(shippingPerson.name || billingPerson.name);
    const buyerPhone = cleanText(shippingPerson.phone || billingPerson.phone || order.phone);
    const buyerEmail = cleanText(order.email);
    const channelCustomerId = cleanText(order.customerId);
    const shipFrom = cleanText(shippingPerson.street) ? shippingPerson : billingPerson;
    const buyer =
      channelCustomerId || buyerEmail || buyerPhone
        ? {
            channelCustomerId,
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
            shipTo: cleanText(shipFrom.street)
              ? {
                  address1: cleanText(shipFrom.street),
                  address2: null,
                  city: cleanText(shipFrom.city),
                  state: cleanText(shipFrom.stateOrProvinceCode),
                  postalCode: cleanText(shipFrom.postalCode),
                  country: cleanText(shipFrom.countryCode),
                  residential: null,
                }
              : null,
          }
        : null;

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
        // `customerName` stays empty ON PURPOSE. It is the name-only fallback
        // tier (`resolveCustomersByName`), and routing Ecwid through it would
        // merge two different "John Smith"s. The buyer below carries real
        // identity, so this order never reaches that tier.
        customerName: '',
        buyer,
        accountSource: 'ecwid',
        // Ecwid fulfillment state is not read here — no lifecycle opinion.
        status: null,
        trackings: tracking ? [tracking] : [],
        shipByDate: null,
        orderDate,
        saleAmount: resolveEcwidLineSaleAmount(item, parseEcwidLineUnits(item.quantity)),
        currency,
      });
    }
  }

  return lines;
}

/**
 * Which slice of the store's order history to pull.
 *
 * The recurring sync wants "everything since last time" (a rolling window);
 * a paced intake batch wants "the newest N regardless of age". Both are the
 * same fetch with different bounds — expressed here rather than as a second
 * fetcher, so there is one Ecwid orders reader in the codebase.
 */
export interface EcwidOrderWindow {
  /**
   * Days back to fetch. `null` removes the date filter entirely (full
   * history). Defaults to {@link LOOKBACK_DAYS} — the recurring-sync window.
   */
  lookbackDays?: number | null;
  /**
   * Hard cap on orders returned, NEWEST FIRST. When set, the request is
   * explicitly sorted `DATE_DESC` so "the last N orders" means the N most
   * recently placed. Omitted → the API's default ordering and the page cap,
   * which is byte-identical to the pre-existing recurring-sync behavior.
   */
  limit?: number | null;
}

async function fetchRecentEcwidOrders(
  storeId: string,
  token: string,
  window: EcwidOrderWindow = {},
): Promise<unknown[]> {
  const lookbackDays = window.lookbackDays === undefined ? LOOKBACK_DAYS : window.lookbackDays;
  const cap = window.limit != null && window.limit > 0 ? window.limit : null;
  const orders: unknown[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/orders`);
    if (lookbackDays != null) {
      url.searchParams.set(
        'createdFrom',
        new Date(Date.now() - lookbackDays * 86_400_000).toISOString(),
      );
    }
    // Newest-first only when a cap is asked for — otherwise the request shape
    // stays exactly what the recurring sync has always sent.
    if (cap != null) url.searchParams.set('sortBy', 'DATE_DESC');
    const pageSize = cap != null ? Math.min(PAGE_LIMIT, cap - orders.length) : PAGE_LIMIT;
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(pageSize));

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

    if (cap != null && orders.length >= cap) break;
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return cap != null ? orders.slice(0, cap) : orders;
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
  opts?: { allowEnvFallback?: boolean; window?: EcwidOrderWindow },
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

  return mapEcwidOrdersToCanonicalLines(
    await fetchRecentEcwidOrders(storeId, token, opts?.window),
  );
}
