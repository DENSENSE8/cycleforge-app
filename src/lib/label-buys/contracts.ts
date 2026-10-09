/**
 * `/api/v1/label-buys` — buy ONE ShipStation label outright, no order required
 * (the Labels desk's Buy a label compose, `?buy=1` — owner 2026-10-01, was the
 * `/shipping/buy-label` page). Ship-to + parcel → rates → buy. An optional
 * free-text reference rides on the purchase; an optional linked product fills
 * the parcel from `product_parcel_dims` and can remember it back.
 * Framework-free: the wire types, the body/query schemas and the pure rules
 * both sides share.
 */
import { z } from 'zod';
import { ParcelSchema, ShipAddressSchema } from '@/lib/shipping/shipstation/rate-request';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';

export const LABEL_BUY_PURPOSES = ['outbound', 'return', 'replacement'] as const;
export type LabelBuyPurpose = (typeof LABEL_BUY_PURPOSES)[number];

export const MAX_LABEL_BUY_REFERENCE = 64;
export const MAX_LABEL_BUY_PRODUCTS = 20;
export const MIN_LABEL_BUY_PRODUCT_QUERY = 2;

/** Codes the label-buy routes answer with beyond the v1 base set. */
export const LABEL_BUY_ERROR_CODES = [
  /** No ShipStation key for this organization (or it was refused). */
  'SHIPSTATION_NOT_CONNECTED',
  /** No warehouse ship-from address configured. */
  'SHIP_FROM_NOT_CONFIGURED',
  /** Test-label mode (non-production / sandbox org) with no sandbox key: the purchase was refused before it was sent. */
  'LABEL_TEST_MODE_BLOCKED',
  /** ShipStation answered with an error (bad address, unavailable rate, outage). */
  'SHIPSTATION_ERROR',
  /** This clientEventId's purchase is in progress or did not finish — check ShipStation before buying again. */
  'LABEL_PURCHASE_IN_FLIGHT',
  /** This clientEventId's label was voided — get fresh rates (and a new clientEventId) to buy again. */
  'LABEL_PURCHASE_VOIDED',
] as const;
export type LabelBuyErrorCode = (typeof LABEL_BUY_ERROR_CODES)[number];

const purposeSchema = z.enum(LABEL_BUY_PURPOSES);

/** POST /api/v1/label-buys/rates */
export const labelBuyRatesBodySchema = z
  .object({ purpose: purposeSchema, shipTo: ShipAddressSchema, parcel: ParcelSchema })
  .strict();
export type LabelBuyRatesBody = z.input<typeof labelBuyRatesBodySchema>;
export type LabelBuyRatesInput = z.output<typeof labelBuyRatesBodySchema>;

/** A free-text reference (order #, RMA, note): trimmed; blank → none. Never required. */
export function normalizeLabelBuyReference(raw: string | null | undefined): string | null {
  const ref = (raw ?? '').trim();
  return ref ? ref : null;
}

/** A linked product: its catalog row, its SKU, or both — neither is no product. */
export function normalizeLabelBuyProduct(
  raw: { skuCatalogId?: number | null; sku?: string | null } | null | undefined,
): { skuCatalogId: number | null; sku: string | null } | null {
  if (!raw) return null;
  const skuCatalogId = raw.skuCatalogId ?? null;
  const sku = (raw.sku ?? '').trim() || null;
  return skuCatalogId == null && sku == null ? null : { skuCatalogId, sku };
}

const productSchema = z
  .object({
    skuCatalogId: z.number().int().positive().nullish(),
    sku: z.string().max(128).nullish(),
  })
  .strict();

/** POST /api/v1/label-buys */
export const labelBuyBodySchema = labelBuyRatesBodySchema
  .extend({
    /** One per intended purchase: a retry with the same id never buys twice. */
    clientEventId: z.string().trim().min(8).max(128),
    rateId: z.string().trim().min(1),
    carrierId: z.string().trim().min(1),
    serviceCode: z.string().trim().min(1),
    reference: z.string().trim().max(MAX_LABEL_BUY_REFERENCE).nullish().transform(normalizeLabelBuyReference),
    product: productSchema.nullish().transform(normalizeLabelBuyProduct),
    /** Upsert `product_parcel_dims` for the linked product (ignored without one). */
    rememberParcel: z.boolean().default(false),
  })
  .strict();
export type LabelBuyBody = z.input<typeof labelBuyBodySchema>;
export type LabelBuyInput = z.output<typeof labelBuyBodySchema>;

/** GET /api/v1/label-buys/products?q= */
export const labelBuyProductsQuerySchema = z
  .object({ q: z.string().trim().min(MIN_LABEL_BUY_PRODUCT_QUERY).max(100) })
  .strict();

export interface LabelBuyRates {
  rates: ShippingRateOption[];
  invalidRates: Array<{ carrierCode: string | null; serviceCode: string | null; message: string }>;
}

export interface LabelBuyResult {
  /** The purchase ledger row (`shipping_label_purchases.id`) — prints via `/api/shipping/label-intake/labels/{purchaseId}/pdf`. */
  purchaseId: number;
  /** True when this clientEventId was already bought: the recorded label, no second charge. */
  replayed: boolean;
  tracking: string | null;
  carrier: string | null;
  service: string | null;
  cost: number | null;
  currency: string | null;
  /** The bought label on the Labels desk (unpaired unless the reference names an order); null for a return label. */
  labelIngestionId: number | null;
  /** The label is bought; something after the charge did not finish. */
  warning: string | null;
}

export interface LabelBuyParcel {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface LabelBuyProduct {
  skuCatalogId: number;
  sku: string | null;
  title: string;
  /** The remembered parcel (`product_parcel_dims`), SKU first, then item number. */
  parcel: LabelBuyParcel | null;
  parcelSource: 'sku' | 'item_number' | null;
}

export interface LabelBuyProducts {
  products: LabelBuyProduct[];
}

// ── Response schemas (the browser transport validates what it reads) ──────

const nullableNumber = z.number().nullable();

export const labelBuyRatesSchema: z.ZodType<LabelBuyRates> = z.object({
  rates: z.array(
    z.looseObject({
      rateId: z.string(),
      carrierId: z.string(),
      carrierCode: z.string(),
      carrierName: z.string(),
      serviceCode: z.string(),
      serviceName: z.string(),
      amount: z.number(),
      currency: z.string(),
    }),
  ) as z.ZodType<ShippingRateOption[]>,
  invalidRates: z.array(
    z.object({ carrierCode: z.string().nullable(), serviceCode: z.string().nullable(), message: z.string() }),
  ),
});

export const labelBuyResultSchema: z.ZodType<LabelBuyResult> = z.object({
  purchaseId: z.number().int(),
  replayed: z.boolean(),
  tracking: z.string().nullable(),
  carrier: z.string().nullable(),
  service: z.string().nullable(),
  cost: nullableNumber,
  currency: z.string().nullable(),
  labelIngestionId: z.number().int().nullable(),
  warning: z.string().nullable(),
});

const parcelSchema = z.object({ weightOz: nullableNumber, lengthIn: nullableNumber, widthIn: nullableNumber, heightIn: nullableNumber });

export const labelBuyProductsSchema: z.ZodType<LabelBuyProducts> = z.object({
  products: z.array(
    z.object({
      skuCatalogId: z.number().int(),
      sku: z.string().nullable(),
      title: z.string(),
      parcel: parcelSchema.nullable(),
      parcelSource: z.enum(['sku', 'item_number']).nullable(),
    }),
  ),
});

// ── Pure mapping (server) ──────────────────────────────────────────────────

type Num = string | number | null | undefined;

function positive(value: Num): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One products-search row as the SQL returns it. */
export interface LabelBuyProductRow {
  id: number | string;
  sku: string | null;
  /** Already resolved through `resolveSkuIdentityTitle`. */
  title: string;
  sku_parcel_weight_oz?: Num;
  sku_parcel_length_in?: Num;
  sku_parcel_width_in?: Num;
  sku_parcel_height_in?: Num;
  item_parcel_weight_oz?: Num;
  item_parcel_length_in?: Num;
  item_parcel_width_in?: Num;
  item_parcel_height_in?: Num;
}

function parcelOf(w: Num, l: Num, wd: Num, h: Num): LabelBuyParcel | null {
  const parcel = { weightOz: positive(w), lengthIn: positive(l), widthIn: positive(wd), heightIn: positive(h) };
  return Object.values(parcel).some((v) => v != null) ? parcel : null;
}

/**
 * A catalog row → the wire product. The remembered parcel answers WHOLE from
 * the SKU record, else from the item-number record (never a weight from one
 * and a box from the other); the title falls back to the SKU.
 */
export function toLabelBuyProduct(row: LabelBuyProductRow): LabelBuyProduct {
  const sku = row.sku?.trim() || null;
  const bySku = parcelOf(row.sku_parcel_weight_oz, row.sku_parcel_length_in, row.sku_parcel_width_in, row.sku_parcel_height_in);
  const byItem = bySku
    ? null
    : parcelOf(row.item_parcel_weight_oz, row.item_parcel_length_in, row.item_parcel_width_in, row.item_parcel_height_in);
  return {
    skuCatalogId: Number(row.id),
    sku,
    title: row.title.trim() || sku || `Product #${row.id}`,
    parcel: bySku ?? byItem,
    parcelSource: bySku ? 'sku' : byItem ? 'item_number' : null,
  };
}

// ── OpenAPI ────────────────────────────────────────────────────────────────

export function buildLabelBuyOpenApi(): Record<string, unknown> {
  const error = { $ref: '#/components/schemas/Error' };
  const rejected = (description: string) => ({ description, content: { 'application/json': { schema: error } } });
  const json = (schema: unknown) => ({ required: true, content: { 'application/json': { schema } } });
  const address = {
    type: 'object',
    required: ['name', 'addressLine1', 'cityLocality', 'stateProvince', 'postalCode', 'countryCode'],
    properties: {
      name: { type: 'string' },
      phone: { type: ['string', 'null'] },
      company: { type: ['string', 'null'] },
      addressLine1: { type: 'string' },
      addressLine2: { type: ['string', 'null'] },
      cityLocality: { type: 'string' },
      stateProvince: { type: 'string' },
      postalCode: { type: 'string' },
      countryCode: { type: 'string', minLength: 2, maxLength: 2 },
      residential: { type: ['boolean', 'null'] },
    },
  };
  const parcel = {
    type: 'object',
    required: ['weight'],
    properties: {
      weight: {
        type: 'object',
        required: ['value', 'unit'],
        properties: { value: { type: 'number', exclusiveMinimum: 0 }, unit: { type: 'string', enum: ['ounce', 'pound', 'gram', 'kilogram'] } },
      },
      dimensions: {
        type: ['object', 'null'],
        required: ['length', 'width', 'height', 'unit'],
        properties: {
          length: { type: 'number', exclusiveMinimum: 0 },
          width: { type: 'number', exclusiveMinimum: 0 },
          height: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', enum: ['inch', 'centimeter'] },
        },
      },
    },
  };
  const ratesBody = {
    type: 'object',
    required: ['purpose', 'shipTo', 'parcel'],
    properties: { purpose: { type: 'string', enum: [...LABEL_BUY_PURPOSES] }, shipTo: address, parcel },
  };
  const unavailable = rejected(
    'SHIPSTATION_NOT_CONNECTED / SHIP_FROM_NOT_CONFIGURED (400), SHIPSTATION_ERROR (502) — or an invalid body',
  );
  return {
    '/api/v1/label-buys/rates': {
      post: {
        requestBody: json(ratesBody),
        responses: { '200': { description: 'Rates for the shipment ({ rates, invalidRates })' }, '400': unavailable, '502': rejected('SHIPSTATION_ERROR') },
      },
    },
    '/api/v1/label-buys': {
      post: {
        requestBody: json({
          ...ratesBody,
          required: [...ratesBody.required, 'clientEventId', 'rateId', 'carrierId', 'serviceCode'],
          properties: {
            ...ratesBody.properties,
            clientEventId: { type: 'string', minLength: 8, maxLength: 128, description: 'A uuid minted once per intended purchase' },
            rateId: { type: 'string' },
            carrierId: { type: 'string' },
            serviceCode: { type: 'string' },
            reference: { type: ['string', 'null'], maxLength: MAX_LABEL_BUY_REFERENCE },
            product: {
              type: ['object', 'null'],
              properties: { skuCatalogId: { type: ['integer', 'null'] }, sku: { type: ['string', 'null'] } },
            },
            rememberParcel: { type: 'boolean' },
          },
        }),
        responses: {
          '200': { description: 'Bought (or the recorded purchase for this clientEventId) — LabelBuyResult' },
          '400': unavailable,
          '409': rejected('LABEL_PURCHASE_IN_FLIGHT / LABEL_PURCHASE_VOIDED / LABEL_TEST_MODE_BLOCKED'),
          '502': rejected('SHIPSTATION_ERROR — nothing was charged'),
        },
      },
    },
    '/api/v1/label-buys/products': {
      get: {
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: MIN_LABEL_BUY_PRODUCT_QUERY, maxLength: 100 }, description: 'SKU, title or item number' },
        ],
        responses: {
          '200': { description: `Catalog products with their remembered parcel ({ products }, ≤ ${MAX_LABEL_BUY_PRODUCTS})` },
          '400': rejected('Invalid query'),
        },
      },
    },
  };
}
