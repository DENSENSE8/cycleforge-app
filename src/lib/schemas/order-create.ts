import { z } from 'zod';
import { CONDITION_GRADES, type ConditionGrade } from '@/lib/conditions';
import { CustomerShipToBody } from '@/lib/schemas/customers';

/**
 * `POST /api/orders/add` body (handoff gap 4). The single-line shape every
 * existing caller sends is unchanged — same fields, same coercions, same
 * error sentences — and a phone order adds `lines[]` (one order number, N
 * rows), a `customer`, a `shipBy` and a `buyerNote`.
 */

const CONDITION_ERROR = `condition must be one of: ${CONDITION_GRADES.join(', ')}`;

/** Optional canonical grade: a non-string is "none"; a string must be a grade (webhooks send none, never free text). */
const conditionField = z.unknown().optional().transform((v, ctx): ConditionGrade | null => {
  const raw = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!raw) return null;
  if (!(CONDITION_GRADES as readonly string[]).includes(raw)) {
    ctx.addIssue({ code: 'custom', message: CONDITION_ERROR });
    return z.NEVER;
  }
  return raw as ConditionGrade;
});

/** Optional money: when present it must be a finite number (`'12.5'` coerces, as it always has). */
const saleAmountField = z.unknown().optional().transform((v, ctx): number | null => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: 'custom', message: 'saleAmount must be a finite number when provided' });
    return z.NEVER;
  }
  return n;
});

/** Optional whole number ≥ 1, stored as its canonical integer string (`orders.quantity` is text). */
const quantityField = z.unknown().optional().transform((v, ctx): string | null => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1) {
    ctx.addIssue({ code: 'custom', message: 'quantity must be a whole number of at least 1 when provided' });
    return z.NEVER;
  }
  return String(n);
});

const optionalText = (max: number) =>
  z.unknown().optional().transform((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null));

export const OrderCreateLine = z.object({
  productTitle: z.string().trim().min(1, 'Each line needs a productTitle').max(500),
  sku: optionalText(100),
  /** A catalog row the caller already resolved — verified against the org before use. */
  skuCatalogId: z.number().int().positive().nullish(),
  // Key order is error order: condition, then saleAmount, then quantity (the route's historical checks).
  condition: conditionField,
  /** The LINE total (unit × qty), like `orders.sale_amount` everywhere else. */
  saleAmount: saleAmountField,
  quantity: quantityField,
});
export type OrderCreateLine = z.infer<typeof OrderCreateLine>;

/**
 * `POST /api/orders/[id]/cage-release { action: 'set-line', line }` — a held
 * row's line rewritten after the intake draft save: the create line's fields
 * and coercions, plus the listing it sold from.
 */
export const HeldOrderLineBody = OrderCreateLine.extend({
  itemNumber: optionalText(100),
});
export type HeldOrderLineBody = z.infer<typeof HeldOrderLineBody>;

export const OrderCreateCustomer = z.union([
  z.object({ id: z.number().int().positive(), shipTo: CustomerShipToBody.optional() }),
  z.object({
    id: z.null().optional(),
    name: z.string().trim().min(1, 'Customer name cannot be blank').max(200),
    phone: z.string().trim().max(40).optional().default(''),
    email: z.string().trim().max(200).optional().default(''),
    shipTo: CustomerShipToBody.optional(),
  }),
]);
export type OrderCreateCustomer = z.infer<typeof OrderCreateCustomer>;

const trackingList = z.unknown().optional().transform((v): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [],
);

export const OrderCreateBody = z.object({
  orderId: z.union([z.string(), z.number()]).transform(String),
  accountSource: z.union([z.string(), z.number()]).transform(String),
  // A destructuring default historically: only an ABSENT status becomes 'unassigned'.
  status: z.unknown().optional().transform((v) => (v === undefined ? 'unassigned' : (v as string | null))),
  currency: z.unknown().optional().transform((v) => (typeof v === 'string' && v.trim()) || 'USD'),
  shippingTrackingNumber: z.unknown().optional().transform((v) => (typeof v === 'string' && v.trim() ? v : null)),
  shippingTrackingNumbers: trackingList,
  typeSlug: z.unknown().optional().transform((v) => (typeof v === 'string' ? v.trim().toUpperCase() : '')),
  isUrgent: z.unknown().optional().transform(Boolean),
  // The legacy single line, flat on the body.
  productTitle: z.unknown().optional(),
  sku: z.unknown().optional(),
  quantity: z.unknown().optional(),
  condition: z.unknown().optional(),
  saleAmount: z.unknown().optional(),
  /** A multi-line (phone) order: every line lands under the same order number. */
  lines: z.array(OrderCreateLine).min(1).max(50).optional(),
  customer: OrderCreateCustomer.optional(),
  /** Civil date → the order's ship-by deadline (`work_assignments.deadline_at`). */
  shipBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'shipBy must be YYYY-MM-DD').nullish(),
  buyerNote: optionalText(1000),
  /** `pickup` = walk-in / counter pickup → `orders.fulfillment_channel = 'PICKUP'` (no label, no tracking). */
  fulfillment: z.enum(['ship', 'pickup']).optional(),
});

export interface OrderCreateInput {
  orderId: string;
  accountSource: string;
  status: string | null;
  currency: string;
  trackingBlobs: string[];
  typeSlug: string;
  isUrgent: boolean;
  lines: OrderCreateLine[];
  customer: OrderCreateCustomer | null;
  shipBy: string | null;
  buyerNote: string | null;
  /** The customer collects it at the counter. */
  pickup: boolean;
}

/**
 * Validate a create body. Errors are the route's historical sentences, in its
 * historical order: missing required fields first, then the field checks.
 */
export function parseOrderCreateBody(
  body: Record<string, unknown>,
): { ok: true; input: OrderCreateInput } | { ok: false; error: string } {
  const hasLines = Array.isArray(body.lines) && body.lines.length > 0;
  if (!body.orderId || !body.accountSource || (!hasLines && !body.productTitle)) {
    return { ok: false, error: 'Missing required fields: orderId, productTitle, accountSource' };
  }
  const parsed = OrderCreateBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid order' };
  const b = parsed.data;

  let lines: OrderCreateLine[];
  if (b.lines) {
    lines = b.lines;
  } else {
    const single = OrderCreateLine.safeParse({
      productTitle: String(b.productTitle),
      sku: b.sku,
      quantity: b.quantity,
      condition: b.condition,
      saleAmount: b.saleAmount,
    });
    if (!single.success) return { ok: false, error: single.error.issues[0]?.message ?? 'Invalid order' };
    lines = [single.data];
  }

  const trackingBlobs = [...b.shippingTrackingNumbers];
  if (b.shippingTrackingNumber) trackingBlobs.push(b.shippingTrackingNumber);

  return {
    ok: true,
    input: {
      orderId: b.orderId,
      accountSource: b.accountSource,
      status: b.status,
      currency: b.currency,
      trackingBlobs,
      typeSlug: b.typeSlug,
      isUrgent: b.isUrgent,
      lines,
      customer: b.customer ?? null,
      shipBy: b.shipBy ?? null,
      buyerNote: b.buyerNote,
      pickup: b.fulfillment === 'pickup',
    },
  };
}
