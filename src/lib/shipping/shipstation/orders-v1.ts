/** ShipStation legacy v1 order client — the ORDER-DATA source. */

import { z } from 'zod';
import type { ShipAddress, WeightUnit } from './types';

const DEFAULT_BASE_URL = process.env.SHIPSTATION_V1_BASE_URL ?? 'https://ssapi.shipstation.com';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

export class ShipStationV1Error extends Error {
  constructor(readonly httpStatus: number, message: string) {
    super(message);
    this.name = 'ShipStationV1Error';
  }
  get isNotConnected(): boolean {
    return this.httpStatus === 401 || this.httpStatus === 403;
  }
}

/** One line item on a v1 order. */
export interface ShipStationV1Item {
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPrice: number | null;
  weightOz: number | null;
  /** The marketplace's own line id (Amazon OrderItemId, eBay line item id). */
  lineItemKey: string | null;
  orderItemId: number | null;
  upc: string | null;
  imageUrl: string | null;
  /** Variation / personalization options as the marketplace sent them. */
  options: Array<{ name: string; value: string }>;
  /** A discount/fee pseudo-line, not a product. */
  adjustment: boolean;
}

/** A normalized v1 order — enough to sync into `orders` (incl. buyer identity
 * for the customer book), to build a rate, and to resolve a ship-to. */
export interface ShipStationV1Order {
  orderId: number;
  orderNumber: string;
  orderDate: string | null;
  modifyDate: string | null;
  orderStatus: string | null;
  /**
   * ShipStation's stable per-account customer id (assigned on first sighting;
   * keyed by email/username server-side). The strongest buyer identity the v1
   * order carries — the dedupe key for `customers.shipstation_customer_id`.
   */
  customerId: number | null;
  customerUsername: string | null;
  customerEmail: string | null;
  shipTo: ShipAddress | null;
  billTo: ShipAddress | null;
  items: ShipStationV1Item[];
  orderTotal: number | null;
  /** Order-level parcel weight, normalized. Feeds the v2 rate/label package. */
  weight: { value: number; unit: WeightUnit } | null;
  /** The ShipStation store the order belongs to (`advancedOptions.storeId`) and the marketplace it was placed on (e.g. */
  storeId: number | null;
  marketplace: string | null;
  /** ShipStation's own order key (stable across order-number edits). */
  orderKey: string | null;
  /** When ShipStation first saw the order / the order's recorded ship date. */
  createDate: string | null;
  shipDate: string | null;
  /** Carrier/service chosen on the order (the label's live in `/shipments`). */
  carrierCode: string | null;
  serviceCode: string | null;
  /** Fulfilled outside ShipStation (marketplace-fulfilled, e.g. FBA). */
  externallyFulfilled: boolean;
  paymentDate: string | null;
  shipByDate: string | null;
  amountPaid: number | null;
  taxAmount: number | null;
  shippingAmount: number | null;
  customerNotes: string | null;
  internalNotes: string | null;
  gift: boolean;
  giftMessage: string | null;
  requestedShippingService: string | null;
  dimensions: { length: number | null; width: number | null; height: number | null; units: string | null } | null;
  /** ShipStation split or merged this order (`advancedOptions.mergedOrSplit`). */
  mergedOrSplit: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function basicAuth(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

/** ShipStation v1 weight.units → our WeightUnit. */
function normalizeWeightUnit(units: string | null | undefined): WeightUnit {
  switch ((units ?? '').toLowerCase()) {
    case 'pounds':
      return 'pound';
    case 'grams':
      return 'gram';
    case 'ounces':
    default:
      return 'ounce';
  }
}

const V1WeightSchema = z.object({ value: z.number().nullish(), units: z.string().nullish() }).nullish();

const V1AddressSchema = z
  .object({
    name: z.string().nullish(),
    company: z.string().nullish(),
    street1: z.string().nullish(),
    street2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postalCode: z.string().nullish(),
    // v1 docs name the field `country`, but payloads in the wild (and the
    // newer docs examples) also carry `countryCode` — accept either.
    country: z.string().nullish(),
    countryCode: z.string().nullish(),
    phone: z.string().nullish(),
    residential: z.boolean().nullish(),
  })
  .nullish();

const V1ItemSchema = z.object({
  sku: z.string().nullish(),
  name: z.string().nullish(),
  quantity: z.number().nullish(),
  unitPrice: z.number().nullish(),
  weight: V1WeightSchema,
  lineItemKey: z.string().nullish(),
  orderItemId: z.number().nullish(),
  upc: z.string().nullish(),
  imageUrl: z.string().nullish(),
  adjustment: z.boolean().nullish(),
  options: z
    .array(z.object({ name: z.string().nullish(), value: z.string().nullish() }))
    .nullish(),
});

const V1OrderSchema = z.object({
  orderId: z.number(),
  orderNumber: z.string(),
  orderKey: z.string().nullish(),
  orderDate: z.string().nullish(),
  createDate: z.string().nullish(),
  modifyDate: z.string().nullish(),
  shipDate: z.string().nullish(),
  orderStatus: z.string().nullish(),
  customerId: z.number().nullish(),
  customerUsername: z.string().nullish(),
  customerEmail: z.string().nullish(),
  shipTo: V1AddressSchema,
  billTo: V1AddressSchema,
  items: z.array(V1ItemSchema).nullish(),
  orderTotal: z.number().nullish(),
  weight: V1WeightSchema,
  carrierCode: z.string().nullish(),
  serviceCode: z.string().nullish(),
  externallyFulfilled: z.boolean().nullish(),
  paymentDate: z.string().nullish(),
  shipByDate: z.string().nullish(),
  amountPaid: z.number().nullish(),
  taxAmount: z.number().nullish(),
  shippingAmount: z.number().nullish(),
  customerNotes: z.string().nullish(),
  internalNotes: z.string().nullish(),
  gift: z.boolean().nullish(),
  giftMessage: z.string().nullish(),
  requestedShippingService: z.string().nullish(),
  dimensions: z
    .object({
      length: z.number().nullish(),
      width: z.number().nullish(),
      height: z.number().nullish(),
      units: z.string().nullish(),
    })
    .nullish(),
  advancedOptions: z
    .object({
      storeId: z.number().nullish(),
      source: z.string().nullish(),
      mergedOrSplit: z.boolean().nullish(),
    })
    .nullish(),
});

const V1StoreSchema = z.object({
  storeId: z.number(),
  storeName: z.string().nullish(),
  marketplace: z.string().nullish(),
  marketplaceId: z.number().nullish(),
  marketplaceName: z.string().nullish(),
  active: z.boolean().nullish(),
});

/** v1 `GET /stores` answers a bare JSON array; `{ stores }` is tolerated too. */
const V1StoresResponseSchema = z.union([
  z.array(z.unknown()),
  z.object({ stores: z.array(z.unknown()).nullish() }).transform((r) => r.stores ?? []),
]);

const V1OrdersResponseSchema = z.object({
  orders: z.array(z.unknown()).nullish(),
  total: z.number().nullish(),
  page: z.number().nullish(),
  pages: z.number().nullish(),
});

/** One v1 `/shipments` row — a label generated inside ShipStation. Only the
 * fields the tracking attach needs; everything else is ignored. */
const V1ShipmentSchema = z.object({
  shipmentId: z.number(),
  orderId: z.number().nullish(),
  orderNumber: z.string().nullish(),
  createDate: z.string().nullish(),
  shipDate: z.string().nullish(),
  trackingNumber: z.string().nullish(),
  carrierCode: z.string().nullish(),
  serviceCode: z.string().nullish(),
  isReturnLabel: z.boolean().nullish(),
  voided: z.boolean().nullish(),
  shipmentCost: z.number().nullish(),
  insuranceCost: z.number().nullish(),
});

const V1ShipmentsResponseSchema = z.object({
  shipments: z.array(z.unknown()).nullish(),
  total: z.number().nullish(),
  page: z.number().nullish(),
  pages: z.number().nullish(),
});

function toShipAddress(raw: z.infer<typeof V1AddressSchema>): ShipAddress | null {
  if (!raw || !raw.street1 || !raw.city) return null;
  const country = raw.country ?? raw.countryCode;
  return {
    name: raw.name ?? '',
    phone: raw.phone ?? null,
    company: raw.company ?? null,
    addressLine1: raw.street1,
    addressLine2: raw.street2 ?? null,
    cityLocality: raw.city,
    stateProvince: raw.state ?? '',
    postalCode: raw.postalCode ?? '',
    countryCode: (country ?? 'US').toUpperCase(),
    residential: raw.residential ?? null,
  };
}

function mapOrder(raw: z.infer<typeof V1OrderSchema>): ShipStationV1Order {
  const items: ShipStationV1Item[] = (raw.items ?? []).map((it) => ({
    sku: it.sku ?? null,
    name: it.name ?? null,
    quantity: typeof it.quantity === 'number' ? it.quantity : 1,
    unitPrice: it.unitPrice ?? null,
    weightOz:
      it.weight && typeof it.weight.value === 'number'
        ? toOunces(it.weight.value, it.weight.units)
        : null,
    lineItemKey: it.lineItemKey?.trim() || null,
    orderItemId: it.orderItemId ?? null,
    upc: it.upc?.trim() || null,
    imageUrl: it.imageUrl?.trim() || null,
    options: (it.options ?? [])
      .map((o) => ({ name: String(o.name ?? '').trim(), value: String(o.value ?? '').trim() }))
      .filter((o) => o.name || o.value),
    adjustment: it.adjustment === true,
  }));
  const weight =
    raw.weight && typeof raw.weight.value === 'number'
      ? { value: raw.weight.value, unit: normalizeWeightUnit(raw.weight.units) }
      : null;
  return {
    orderId: raw.orderId,
    orderNumber: raw.orderNumber,
    orderDate: raw.orderDate ?? null,
    modifyDate: raw.modifyDate ?? null,
    orderStatus: raw.orderStatus ?? null,
    customerId: raw.customerId ?? null,
    customerUsername: raw.customerUsername ?? null,
    customerEmail: raw.customerEmail ?? null,
    shipTo: toShipAddress(raw.shipTo),
    billTo: toShipAddress(raw.billTo),
    items,
    orderTotal: raw.orderTotal ?? null,
    weight,
    storeId: raw.advancedOptions?.storeId ?? null,
    marketplace: raw.advancedOptions?.source ?? null,
    orderKey: raw.orderKey ?? null,
    createDate: raw.createDate ?? null,
    shipDate: raw.shipDate ?? null,
    carrierCode: raw.carrierCode ?? null,
    serviceCode: raw.serviceCode ?? null,
    externallyFulfilled: raw.externallyFulfilled === true,
    paymentDate: raw.paymentDate ?? null,
    shipByDate: raw.shipByDate ?? null,
    amountPaid: raw.amountPaid ?? null,
    taxAmount: raw.taxAmount ?? null,
    shippingAmount: raw.shippingAmount ?? null,
    customerNotes: raw.customerNotes?.trim() || null,
    internalNotes: raw.internalNotes?.trim() || null,
    gift: raw.gift === true,
    giftMessage: raw.giftMessage?.trim() || null,
    requestedShippingService: raw.requestedShippingService?.trim() || null,
    dimensions: raw.dimensions
      ? {
          length: raw.dimensions.length ?? null,
          width: raw.dimensions.width ?? null,
          height: raw.dimensions.height ?? null,
          units: raw.dimensions.units ?? null,
        }
      : null,
    mergedOrSplit: raw.advancedOptions?.mergedOrSplit === true,
  };
}

/** A connected ShipStation store — one marketplace storefront. */
export interface ShipStationV1Store {
  storeId: number;
  storeName: string | null;
  /** Machine marketplace id ('eBay', 'Amazon', 'Shopify', …) when present. */
  marketplace: string | null;
  /** ShipStation's numeric marketplace id (2 Amazon, 144 eBay, 92 Ecwid, …). */
  marketplaceId: number | null;
  /** Human marketplace name ('eBay', 'Amazon', 'Ecwid by Lightspeed', …). */
  marketplaceName: string | null;
  active: boolean;
}

function mapStore(raw: z.infer<typeof V1StoreSchema>): ShipStationV1Store {
  return {
    storeId: raw.storeId,
    storeName: raw.storeName ?? null,
    marketplace: raw.marketplace ?? null,
    marketplaceId: raw.marketplaceId ?? null,
    marketplaceName: raw.marketplaceName ?? null,
    active: raw.active !== false,
  };
}

/** A label ShipStation generated for an order (v1 `/shipments`). */
export interface ShipStationV1Shipment {
  shipmentId: number;
  orderId: number | null;
  orderNumber: string | null;
  createDate: string | null;
  shipDate: string | null;
  trackingNumber: string | null;
  /** ShipStation account/carrier code (`stamps_com`, `ups_walleted`, …). */
  carrierCode: string | null;
  serviceCode: string | null;
  isReturnLabel: boolean;
  voided: boolean;
  shipmentCost: number | null;
  insuranceCost: number | null;
}

function mapShipment(raw: z.infer<typeof V1ShipmentSchema>): ShipStationV1Shipment {
  return {
    shipmentId: raw.shipmentId,
    orderId: raw.orderId ?? null,
    orderNumber: raw.orderNumber ?? null,
    createDate: raw.createDate ?? null,
    shipDate: raw.shipDate ?? null,
    trackingNumber: raw.trackingNumber?.trim() || null,
    carrierCode: raw.carrierCode ?? null,
    serviceCode: raw.serviceCode ?? null,
    isReturnLabel: raw.isReturnLabel === true,
    voided: raw.voided === true,
    shipmentCost: raw.shipmentCost ?? null,
    insuranceCost: raw.insuranceCost ?? null,
  };
}

function toOunces(value: number, units: string | null | undefined): number {
  switch ((units ?? '').toLowerCase()) {
    case 'pounds':
      return value * 16;
    case 'grams':
      return value / 28.3495;
    default:
      return value;
  }
}

async function v1Fetch(
  apiKey: string,
  apiSecret: string,
  baseUrl: string,
  path: string,
): Promise<unknown> {
  const retryable = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: basicAuth(apiKey, apiSecret), Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new ShipStationV1Error(503, err instanceof Error ? err.message : 'network error');
      }
      await sleep(500 * 2 ** attempt);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (retryable.has(res.status) && attempt < MAX_RETRIES) {
      // v1 exposes X-Rate-Limit-Reset (seconds) on 429.
      const reset = Number(res.headers.get('X-Rate-Limit-Reset'));
      const delay = res.status === 429 && Number.isFinite(reset) ? reset * 1000 : 500 * 2 ** attempt;
      await sleep(Math.min(delay, 60_000));
      continue;
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new ShipStationV1Error(res.status, text ? text.slice(0, 300) : `v1 error ${res.status}`);
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new ShipStationV1Error(502, 'Malformed v1 JSON response');
    }
  }
  throw new ShipStationV1Error(503, 'v1 request exhausted retries');
}

export interface ListOrdersParams {
  /** ISO date; pulls orders modified at/after this (incremental sync watermark). */
  modifyDateStart?: string;
  /** ISO date; upper bound of a historical backfill window. */
  modifyDateEnd?: string;
  /** Exact order number — every ShipStation order carrying it (split copies). */
  orderNumber?: string;
  page?: number;
  /** v1 caps this at 500. */
  pageSize?: number;
}

export interface ListOrdersResult {
  orders: ShipStationV1Order[];
  page: number;
  pages: number;
  total: number;
}

export interface ListShipmentsParams {
  /** Shipments CREATED at/after this date (label bought). */
  createDateStart?: string;
  /** Shipments created at/before this date (backfill window). */
  createDateEnd?: string;
  /** Shipments whose ship date is at/after this date. */
  shipDateStart?: string;
  /** Exact-match filters (v1 `trackingNumber` / `orderNumber`). */
  trackingNumber?: string;
  orderNumber?: string;
  page?: number;
  pageSize?: number;
}

export interface ListShipmentsResult {
  shipments: ShipStationV1Shipment[];
  page: number;
  pages: number;
  total: number;
}

export interface ShipStationV1Client {
  listOrders(params?: ListOrdersParams): Promise<ListOrdersResult>;
  getOrderByNumber(orderNumber: string): Promise<ShipStationV1Order | null>;
  /** The account's connected stores — the marketplace identifications the
   * platform catalog sync mirrors into the org's picker. */
  listStores(): Promise<ShipStationV1Store[]>;
  /** Labels generated in ShipStation, oldest-created first (voided included —
   * the caller decides). */
  listShipments(params?: ListShipmentsParams): Promise<ListShipmentsResult>;
}

export function createShipStationV1Client(
  apiKey: string,
  apiSecret: string,
  baseUrl: string = DEFAULT_BASE_URL,
): ShipStationV1Client {
  const listOrders = async (params: ListOrdersParams = {}): Promise<ListOrdersResult> => {
    const q = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 100),
      sortBy: 'ModifyDate',
      sortDir: 'ASC',
    });
    if (params.modifyDateStart) q.set('modifyDateStart', params.modifyDateStart);
    if (params.modifyDateEnd) q.set('modifyDateEnd', params.modifyDateEnd);
    if (params.orderNumber) q.set('orderNumber', params.orderNumber);
    const json = await v1Fetch(apiKey, apiSecret, baseUrl, `/orders?${q.toString()}`);
    const parsed = V1OrdersResponseSchema.safeParse(json);
    const raw = parsed.success ? parsed.data : { orders: [], page: 1, pages: 1, total: 0 };
    const orders: ShipStationV1Order[] = [];
    for (const o of raw.orders ?? []) {
      const order = V1OrderSchema.safeParse(o);
      if (order.success) orders.push(mapOrder(order.data));
    }
    return {
      orders,
      page: raw.page ?? 1,
      pages: raw.pages ?? 1,
      total: raw.total ?? orders.length,
    };
  };

  const getOrderByNumber = async (orderNumber: string): Promise<ShipStationV1Order | null> => {
    const json = await v1Fetch(
      apiKey,
      apiSecret,
      baseUrl,
      `/orders?orderNumber=${encodeURIComponent(orderNumber)}&pageSize=1`,
    );
    const parsed = V1OrdersResponseSchema.safeParse(json);
    const first = parsed.success ? parsed.data.orders?.[0] : undefined;
    if (!first) return null;
    const order = V1OrderSchema.safeParse(first);
    return order.success ? mapOrder(order.data) : null;
  };

  const listStores = async (): Promise<ShipStationV1Store[]> => {
    // Inactive stores still own historical orders, so they are listed too.
    const json = await v1Fetch(apiKey, apiSecret, baseUrl, '/stores?showInactive=true');
    const parsed = V1StoresResponseSchema.safeParse(json);
    if (!parsed.success) return [];
    const stores: ShipStationV1Store[] = [];
    for (const s of parsed.data) {
      const store = V1StoreSchema.safeParse(s);
      if (store.success) stores.push(mapStore(store.data));
    }
    return stores;
  };

  const listShipments = async (params: ListShipmentsParams = {}): Promise<ListShipmentsResult> => {
    const q = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 100),
      sortBy: 'CreateDate',
      sortDir: 'ASC',
    });
    if (params.createDateStart) q.set('createDateStart', params.createDateStart);
    if (params.createDateEnd) q.set('createDateEnd', params.createDateEnd);
    if (params.shipDateStart) q.set('shipDateStart', params.shipDateStart);
    if (params.trackingNumber) q.set('trackingNumber', params.trackingNumber);
    if (params.orderNumber) q.set('orderNumber', params.orderNumber);
    const json = await v1Fetch(apiKey, apiSecret, baseUrl, `/shipments?${q.toString()}`);
    const parsed = V1ShipmentsResponseSchema.safeParse(json);
    const raw = parsed.success ? parsed.data : { shipments: [], page: 1, pages: 1, total: 0 };
    const shipments: ShipStationV1Shipment[] = [];
    for (const s of raw.shipments ?? []) {
      const shipment = V1ShipmentSchema.safeParse(s);
      if (shipment.success) shipments.push(mapShipment(shipment.data));
    }
    return {
      shipments,
      page: raw.page ?? 1,
      pages: raw.pages ?? 1,
      total: raw.total ?? shipments.length,
    };
  };

  return { listOrders, getOrderByNumber, listStores, listShipments };
}
