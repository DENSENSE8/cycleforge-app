/**
 * Order payments — the pure half: what an order costs (computed from its own
 * rows, never from a model), the Square / Stripe request bodies, and how each
 * provider's payment / invoice / refund states move an `order_payments` row.
 *
 * Card details never pass through CycleForge: every provider method hands the
 * customer (or staff keying for them) a provider-hosted page, and `in_person`
 * records only the tender FACTS of a counter payment (./tender.ts).
 */

export const ORDER_PAYMENT_METHODS = ['square_link', 'square_invoice', 'square_terminal', 'stripe_link', 'in_person'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_STATUSES = ['pending', 'sent', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/** Statuses a request is still collecting in (one per order, DB-enforced). */
export const OPEN_PAYMENT_STATUSES: ReadonlyArray<OrderPaymentStatus> = ['pending', 'sent'];

/** Which statuses each target status may be reached from. */
export const PAYMENT_STATUS_FROM: Readonly<Record<OrderPaymentStatus, ReadonlyArray<OrderPaymentStatus>>> = {
  pending: [],
  sent: ['pending'],
  paid: ['pending', 'sent', 'failed'],
  failed: ['pending', 'sent'],
  cancelled: ['pending', 'sent', 'failed'],
  refunded: ['paid'],
};

export interface PaymentLine {
  sku: string | null;
  title: string;
  qty: number;
  unitPriceCents: number;
  lineCents: number;
}

export interface OrderChargeRow {
  id: number;
  order_id: string;
  sku: string | null;
  product_title: string | null;
  quantity: string | number | null;
  sale_amount: string | number | null;
  currency: string | null;
  customer_id: number | null;
}

export interface OrderCharge {
  orderNumber: string;
  orderIds: number[];
  customerId: number | null;
  lines: PaymentLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

/**
 * The charge for one order number, from its line rows. `sale_amount` is the
 * LINE total in major units (unit × qty); shipping and tax are not captured on
 * phone orders yet, so they are 0 and the total is the subtotal.
 */
export function computeOrderCharge(
  orderNumber: string,
  rows: ReadonlyArray<OrderChargeRow>,
  defaultCurrency: string,
): { ok: true; charge: OrderCharge } | { ok: false; error: string } {
  if (rows.length === 0) return { ok: false, error: `No order "${orderNumber}" exists in this workspace.` };
  const lines: PaymentLine[] = [];
  const currencies = new Set<string>();
  for (const row of rows) {
    const amount = Number(row.sale_amount);
    if (row.sale_amount === null || row.sale_amount === '' || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: `Order ${orderNumber} has a line without a price (${row.product_title || row.sku || `row ${row.id}`}). Set the price before taking payment.` };
    }
    const qtyRaw = Math.trunc(Number(row.quantity));
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    const lineCents = Math.round(amount * 100);
    lines.push({
      sku: row.sku?.trim() || null,
      title: row.product_title?.trim() || row.sku?.trim() || `Order ${orderNumber} item`,
      qty,
      unitPriceCents: lineCents % qty === 0 ? lineCents / qty : Math.round(lineCents / qty),
      lineCents,
    });
    currencies.add((row.currency?.trim() || defaultCurrency).toUpperCase());
  }
  if (currencies.size > 1) {
    return { ok: false, error: `Order ${orderNumber} mixes currencies (${[...currencies].join(', ')}); it cannot be charged as one payment.` };
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((id): id is number => typeof id === 'number'))];
  return {
    ok: true,
    charge: {
      orderNumber,
      orderIds: rows.map((r) => Number(r.id)),
      customerId: customerIds.length === 1 ? customerIds[0] : null,
      lines,
      subtotalCents,
      shippingCents: 0,
      taxCents: 0,
      totalCents: subtotalCents,
      currency: [...currencies][0],
    },
  };
}

// ─── Square request bodies ──────────────────────────────────────────────────

export interface PaymentCustomer {
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
}

/** A phone Square accepts (E.164), or null — Square rejects the whole request on a bad one. */
export function e164Phone(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** ISO-3166 alpha-2, or null when the stored country is not recognisable. */
export function countryCode(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  if (/^(united states( of america)?|usa|u\.s\.a?\.?)$/i.test(text)) return 'US';
  if (/^canada$/i.test(text)) return 'CA';
  return null;
}

/** Metadata keys stamped on every Square order we create — how a webhook finds its way home. */
export const SQUARE_ORDER_META = { org: 'cf_org', payment: 'cf_payment', order: 'cf_order' } as const;

export function buildSquareOrder(args: {
  locationId: string;
  orderNumber: string;
  orgId: string;
  paymentId: number;
  currency: string;
  lines: ReadonlyArray<PaymentLine>;
  squareCustomerId?: string | null;
}): Record<string, unknown> {
  return {
    location_id: args.locationId,
    reference_id: args.orderNumber.slice(0, 40),
    ...(args.squareCustomerId ? { customer_id: args.squareCustomerId } : {}),
    line_items: args.lines.map((line) => {
      // An uneven unit price (line total not divisible by qty) is charged as one
      // line at the exact total, so Square's sum equals ours to the cent.
      const even = line.unitPriceCents * line.qty === line.lineCents;
      return {
        name: (even ? line.title : `${line.title} × ${line.qty}`).slice(0, 500),
        quantity: String(even ? line.qty : 1),
        base_price_money: { amount: even ? line.unitPriceCents : line.lineCents, currency: args.currency },
        ...(line.sku ? { note: `SKU ${line.sku}`.slice(0, 2000) } : {}),
      };
    }),
    metadata: {
      [SQUARE_ORDER_META.org]: args.orgId,
      [SQUARE_ORDER_META.payment]: String(args.paymentId),
      [SQUARE_ORDER_META.order]: args.orderNumber.slice(0, 255),
    },
  };
}

export function buildPaymentLinkBody(args: {
  idempotencyKey: string;
  order: Record<string, unknown>;
  orderNumber: string;
  customer: PaymentCustomer | null;
  redirectUrl: string | null;
}): Record<string, unknown> {
  const c = args.customer;
  const phone = e164Phone(c?.phone);
  const country = countryCode(c?.address?.country);
  const address =
    c?.address?.line1 && c.address.city && c.address.postalCode && country
      ? {
          address_line_1: c.address.line1,
          ...(c.address.line2 ? { address_line_2: c.address.line2 } : {}),
          locality: c.address.city,
          ...(c.address.state ? { administrative_district_level_1: c.address.state } : {}),
          postal_code: c.address.postalCode,
          country,
        }
      : null;
  const prefill = {
    ...(c?.email ? { buyer_email: c.email } : {}),
    ...(phone ? { buyer_phone_number: phone } : {}),
    ...(address ? { buyer_address: address } : {}),
  };
  return {
    idempotency_key: args.idempotencyKey,
    order: args.order,
    payment_note: `Order ${args.orderNumber}`.slice(0, 500),
    checkout_options: {
      allow_tipping: false,
      ask_for_shipping_address: false,
      ...(args.redirectUrl ? { redirect_url: args.redirectUrl } : {}),
    },
    ...(Object.keys(prefill).length > 0 ? { pre_populated_data: prefill } : {}),
  };
}

export function buildInvoiceBody(args: {
  idempotencyKey: string;
  locationId: string;
  squareOrderId: string;
  squareCustomerId: string;
  invoiceNumber: string;
  orderNumber: string;
  dueDate: string;
}): Record<string, unknown> {
  return {
    idempotency_key: args.idempotencyKey,
    invoice: {
      location_id: args.locationId,
      order_id: args.squareOrderId,
      primary_recipient: { customer_id: args.squareCustomerId },
      payment_requests: [{ request_type: 'BALANCE', due_date: args.dueDate, automatic_payment_source: 'NONE' }],
      // Square sends nothing: staff share the invoice page themselves.
      delivery_method: 'SHARE_MANUALLY',
      invoice_number: args.invoiceNumber.slice(0, 191),
      title: `Order ${args.orderNumber}`.slice(0, 255),
      accepted_payment_methods: {
        card: true,
        square_gift_card: false,
        bank_account: false,
        buy_now_pay_later: false,
        cash_app_pay: false,
      },
    },
  };
}

/** YYYY-MM-DD for "today" in the Square location's timezone (an invoice may not be due before today). */
export function localDate(now: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// ─── Square state → our status ──────────────────────────────────────────────

/** Square invoice status → our status (null = no change worth recording). */
export function statusForInvoice(status: unknown): OrderPaymentStatus | null {
  switch (String(status ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'CANCELED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    case 'FAILED':
      return 'failed';
    case 'UNPAID':
    case 'SCHEDULED':
    case 'PARTIALLY_PAID':
    case 'PARTIALLY_REFUNDED':
    case 'PAYMENT_PENDING':
      return 'sent';
    default:
      return null;
  }
}

interface SquareOrderLike {
  state?: string;
  tenders?: Array<{ id?: string; payment_id?: string; amount_money?: { amount?: number } }>;
}

/** A Square order's collection state for a request of `amountCents`. */
export function statusForSquareOrder(
  order: SquareOrderLike | null | undefined,
  amountCents: number,
): { status: OrderPaymentStatus | null; paymentId: string | null } {
  if (!order) return { status: null, paymentId: null };
  const tenders = Array.isArray(order.tenders) ? order.tenders : [];
  const paid = tenders.reduce((sum, t) => sum + (typeof t.amount_money?.amount === 'number' ? t.amount_money.amount : 0), 0);
  const paymentId = tenders[0]?.payment_id || tenders[0]?.id || null;
  if (tenders.length > 0 && paid >= amountCents) return { status: 'paid', paymentId };
  if (String(order.state ?? '').toUpperCase() === 'CANCELED') return { status: 'cancelled', paymentId: null };
  return { status: null, paymentId };
}

/** What one Square webhook event means for an order payment, if anything. */
export interface SquarePaymentEventEffect {
  status: OrderPaymentStatus;
  squareOrderId: string | null;
  squareInvoiceId: string | null;
  squarePaymentId: string | null;
}

export function squarePaymentEventEffect(event: unknown): SquarePaymentEventEffect | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as { type?: unknown; data?: { object?: Record<string, unknown> } };
  const type = typeof e.type === 'string' ? e.type : '';
  const obj = e.data?.object ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  if (type === 'payment.created' || type === 'payment.updated' || type === 'payment.completed') {
    const payment = obj.payment as { id?: unknown; order_id?: unknown; status?: unknown } | undefined;
    const status = String(payment?.status ?? '').toUpperCase();
    // A failed / cancelled card attempt on a link does not end the request —
    // the customer can try again on the same page.
    if (!payment || status !== 'COMPLETED') return null;
    return { status: 'paid', squareOrderId: str(payment.order_id), squareInvoiceId: null, squarePaymentId: str(payment.id) };
  }

  if (type.startsWith('invoice.')) {
    const invoice = obj.invoice as { id?: unknown; order_id?: unknown; status?: unknown } | undefined;
    if (!invoice) return null;
    const mapped =
      type === 'invoice.payment_made'
        ? statusForInvoice(invoice.status) === 'paid' ? 'paid' : null
        : type === 'invoice.canceled'
          ? 'cancelled'
          : type === 'invoice.refunded'
            ? statusForInvoice(invoice.status) === 'refunded' ? 'refunded' : null
            : type === 'invoice.published'
              ? 'sent'
              : null;
    if (!mapped) return null;
    return { status: mapped, squareOrderId: str(invoice.order_id), squareInvoiceId: str(invoice.id), squarePaymentId: null };
  }

  if (type === 'refund.created' || type === 'refund.updated') {
    const refund = obj.refund as { payment_id?: unknown; order_id?: unknown; status?: unknown } | undefined;
    if (!refund || String(refund.status ?? '').toUpperCase() !== 'COMPLETED') return null;
    return { status: 'refunded', squareOrderId: str(refund.order_id), squareInvoiceId: null, squarePaymentId: str(refund.payment_id) };
  }

  return null;
}

// ─── Stripe (the tenant's own account) ──────────────────────────────────────

/** Metadata keys stamped on every Stripe Checkout Session (and its PaymentIntent). */
export const STRIPE_SESSION_META = { org: 'organizationId', order: 'orderNumber', payment: 'orderPaymentId' } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The form body for `POST /v1/checkout/sessions` (payment mode). Lines mirror
 * `buildSquareOrder`: an uneven unit price is one line at the exact line total,
 * so Stripe's sum equals ours to the cent.
 */
export function buildStripeCheckoutSessionForm(args: {
  orgId: string;
  paymentId: number;
  orderNumber: string;
  currency: string;
  lines: ReadonlyArray<PaymentLine>;
  customerEmail: string | null;
  successUrl: string;
}): Record<string, string> {
  const form: Record<string, string> = {
    mode: 'payment',
    success_url: args.successUrl,
    client_reference_id: String(args.paymentId),
    'payment_intent_data[description]': `Order ${args.orderNumber}`.slice(0, 1000),
  };
  const meta = {
    [STRIPE_SESSION_META.org]: args.orgId,
    [STRIPE_SESSION_META.order]: args.orderNumber.slice(0, 500),
    [STRIPE_SESSION_META.payment]: String(args.paymentId),
  };
  for (const [k, v] of Object.entries(meta)) {
    form[`metadata[${k}]`] = v;
    form[`payment_intent_data[metadata][${k}]`] = v;
  }
  const currency = args.currency.toLowerCase();
  args.lines.forEach((line, i) => {
    const even = line.unitPriceCents * line.qty === line.lineCents;
    const p = `line_items[${i}]`;
    form[`${p}[quantity]`] = String(even ? line.qty : 1);
    form[`${p}[price_data][currency]`] = currency;
    form[`${p}[price_data][unit_amount]`] = String(even ? line.unitPriceCents : line.lineCents);
    form[`${p}[price_data][product_data][name]`] = (even ? line.title : `${line.title} × ${line.qty}`).slice(0, 250);
    if (line.sku) form[`${p}[price_data][product_data][description]`] = `SKU ${line.sku}`.slice(0, 250);
  });
  const email = args.customerEmail?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) form.customer_email = email;
  return form;
}

interface StripeSessionLike {
  id?: unknown;
  status?: unknown;
  payment_status?: unknown;
  payment_intent?: unknown;
  metadata?: unknown;
}

function stripeId(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return null;
}

/** A Checkout Session's collection state (poll fallback): paid, expired → cancelled, else no change. */
export function statusForStripeSession(
  session: StripeSessionLike | null | undefined,
): { status: OrderPaymentStatus | null; paymentIntentId: string | null } {
  if (!session) return { status: null, paymentIntentId: null };
  const paymentIntentId = stripeId(session.payment_intent);
  if (session.payment_status === 'paid') return { status: 'paid', paymentIntentId };
  if (session.status === 'expired') return { status: 'cancelled', paymentIntentId: null };
  return { status: null, paymentIntentId };
}

/** The org a Stripe event claims (our session metadata) — untrusted until its signature verifies with that org's secret. */
export function stripeEventOrgId(event: unknown): string | null {
  const obj = (event as { data?: { object?: StripeSessionLike } } | null)?.data?.object;
  const meta = obj?.metadata as Record<string, unknown> | undefined;
  const org = meta?.[STRIPE_SESSION_META.org];
  return typeof org === 'string' && UUID_RE.test(org) ? org : null;
}

/** What one Stripe webhook event means for an order payment, if anything. */
export interface StripePaymentEventEffect {
  status: OrderPaymentStatus;
  orgId: string;
  paymentId: number;
  sessionId: string;
  paymentIntentId: string | null;
  lastError: string | null;
}

export function stripeCheckoutEventEffect(event: unknown): StripePaymentEventEffect | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as { type?: unknown; data?: { object?: StripeSessionLike & { object?: unknown } } };
  const obj = e.data?.object;
  if (!obj || obj.object !== 'checkout.session') return null;
  const orgId = stripeEventOrgId(event);
  const sessionId = stripeId(obj.id);
  const rawPayment = (obj.metadata as Record<string, unknown> | undefined)?.[STRIPE_SESSION_META.payment];
  const paymentId = typeof rawPayment === 'string' && /^\d{1,15}$/.test(rawPayment) ? Number(rawPayment) : 0;
  if (!orgId || !sessionId || paymentId <= 0) return null;

  const paymentIntentId = stripeId(obj.payment_intent);
  const base = { orgId, paymentId, sessionId, paymentIntentId, lastError: null };
  switch (e.type) {
    case 'checkout.session.completed':
      // An async method (ACH, …) completes the session `unpaid`; the outcome follows as async_payment_*.
      return obj.payment_status === 'paid' ? { ...base, status: 'paid' } : null;
    case 'checkout.session.async_payment_succeeded':
      return { ...base, status: 'paid' };
    case 'checkout.session.async_payment_failed':
      return { ...base, status: 'failed', lastError: 'Stripe: the customer\'s delayed payment failed.' };
    case 'checkout.session.expired':
      return { ...base, status: 'cancelled', paymentIntentId: null };
    default:
      return null;
  }
}

/** The order-level payment state the order surfaces show. */
export type OrderPaymentState = 'paid' | 'invoice_sent' | 'link_sent' | 'refunded' | 'unpaid';

export function orderPaymentState(latest: { method: OrderPaymentMethod; status: OrderPaymentStatus } | null): OrderPaymentState {
  if (!latest) return 'unpaid';
  if (latest.status === 'paid') return 'paid';
  if (latest.status === 'refunded') return 'refunded';
  if (latest.status === 'pending' || latest.status === 'sent') {
    return latest.method === 'square_invoice' ? 'invoice_sent' : 'link_sent';
  }
  return 'unpaid';
}
