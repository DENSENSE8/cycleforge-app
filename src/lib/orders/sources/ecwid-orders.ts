/** Ecwid → `CanonicalOrderLine` adapter. */
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

/** Units on this line, for the money math only. */
function parseEcwidLineUnits(value: unknown): number {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** This line's money as a decimal string. */
function resolveEcwidLineSaleAmount(item: Record<string, unknown>, units: number): string | null {
  const lineTotal = parseSaleAmount(item.total);
  if (lineTotal !== null) return Number(lineTotal).toFixed(2);

  // `price` is the transacted per-unit figure and includes item options and surcharges that `productPrice` does not (a live line:
  const unitPrice = parseSaleAmount(item.price ?? item.productPrice);
  if (unitPrice === null) return null;

  // Round to cents BEFORE multiplying, so the quantity multiplies a real price
  // rather than amplifying the source's float dust.
  return ((Math.round(Number(unitPrice) * 100) * units) / 100).toFixed(2);
}

/** Map raw Ecwid order payloads to canonical lines — one line per item. */
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
    // Ecwid carries an order currency only on some stores — the v3 orders this store returns have no `currency` key at all.
    const currency = cleanText(order.currency).toUpperCase() || null;

    // The BUYER, in the transport shape `resolveBuyerCustomers` reads.
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
        // `customerName` stays empty ON PURPOSE.
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

/** Which slice of the store's order history to pull. */
interface EcwidOrderWindow {
  /**
   * Days back to fetch. `null` removes the date filter entirely (full
   * history). Defaults to {@link LOOKBACK_DAYS} — the recurring-sync window.
   */
  lookbackDays?: number | null;
  /** Hard cap on orders returned, NEWEST FIRST. */
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

/** Fetch this org's recent Ecwid orders as canonical lines. */
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
