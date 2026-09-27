/**
 * Order payments — the server half: request a Square payment link or invoice
 * for an order, read / refresh / cancel it, and apply Square webhooks.
 *
 * Every statement is `organization_id = $1` through `tenantQuery`; the org is
 * always the caller's (route / tool ctx) or, for a webhook, the one resolved
 * from Square's own data and then matched against a row in that org.
 *
 * Amounts come from the order's rows (`computeOrderCharge`) — never from a
 * model, never from the client.
 */

import 'server-only';
import { randomUUID } from 'crypto';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { formatSquareErrors, getSquareConfig, squareFetch, type SquareConfig, type SquareError } from '@/lib/square/client';
import { resolveSquareConfig } from '@/lib/square/server';
import { publishOrderChanged } from '@/lib/realtime/publish';
import {
  OPEN_PAYMENT_STATUSES,
  PAYMENT_STATUS_FROM,
  SQUARE_ORDER_META,
  buildInvoiceBody,
  buildPaymentLinkBody,
  buildSquareOrder,
  computeOrderCharge,
  e164Phone,
  localDate,
  orderPaymentState,
  squarePaymentEventEffect,
  statusForInvoice,
  statusForSquareOrder,
  type OrderCharge,
  type OrderChargeRow,
  type OrderPaymentMethod,
  type OrderPaymentState,
  type OrderPaymentStatus,
  type PaymentCustomer,
  type PaymentLine,
} from './model';

/** The methods staff can request today (Terminal stays on the counter flow). */
export type RequestableMethod = Extract<OrderPaymentMethod, 'square_link' | 'square_invoice'>;

interface OrderPaymentRow {
  id: string | number;
  order_number: string;
  order_ids: number[];
  customer_id: number | null;
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  amount_cents: number;
  currency: string;
  lines: PaymentLine[];
  square_order_id: string | null;
  square_payment_link_id: string | null;
  square_invoice_id: string | null;
  square_invoice_version: number | null;
  square_customer_id: string | null;
  square_payment_id: string | null;
  url: string | null;
  last_error: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the rail renders — plain data, every amount from the DB. */
export interface OrderPaymentView {
  id: number;
  orderNumber: string;
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  amountCents: number;
  currency: string;
  lines: PaymentLine[];
  url: string | null;
  /** The Square dashboard page for an invoice (staff side). */
  squareInvoiceUrl: string | null;
  lastError: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPaymentPanel {
  orderNumber: string;
  /** Live charge from the order rows, or why it cannot be charged. */
  order: OrderCharge | null;
  orderError: string | null;
  customer: { name: string | null; email: string | null; phone: string | null } | null;
  payment: OrderPaymentView | null;
  state: OrderPaymentState;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const ROW_COLUMNS = `id, order_number, order_ids, customer_id, method, status, amount_cents, currency, lines,
  square_order_id, square_payment_link_id, square_invoice_id, square_invoice_version, square_customer_id,
  square_payment_id, url, last_error, paid_at::text AS paid_at, cancelled_at::text AS cancelled_at,
  created_at::text AS created_at, updated_at::text AS updated_at`;

const ORDER_ROWS_SQL = `
  SELECT o.id, o.order_id, o.sku, o.product_title, o.quantity, o.sale_amount::text AS sale_amount, o.currency, o.customer_id
    FROM orders o
   WHERE o.organization_id = $1 AND o.order_id = $2
   ORDER BY o.id
   LIMIT 100`;

const CUSTOMER_SQL = `
  SELECT id,
         COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(customer_name), ''),
                  NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')) AS name,
         NULLIF(TRIM(first_name), '') AS first_name, NULLIF(TRIM(last_name), '') AS last_name,
         NULLIF(TRIM(email), '') AS email,
         COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(mobile), '')) AS phone,
         NULLIF(TRIM(shipping_address_1), '') AS line1, NULLIF(TRIM(shipping_address_2), '') AS line2,
         NULLIF(TRIM(shipping_city), '') AS city, NULLIF(TRIM(shipping_state), '') AS state,
         NULLIF(TRIM(shipping_postal_code), '') AS postal_code, NULLIF(TRIM(shipping_country), '') AS country
    FROM customers
   WHERE organization_id = $1 AND id = $2
   LIMIT 1`;

// ─── Reads ──────────────────────────────────────────────────────────────────

function toView(row: OrderPaymentRow, config: Pick<SquareConfig, 'baseUrl'> | null): OrderPaymentView {
  const sandbox = config?.baseUrl.includes('squareupsandbox') ?? false;
  return {
    id: Number(row.id),
    orderNumber: row.order_number,
    method: row.method,
    status: row.status,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    lines: Array.isArray(row.lines) ? row.lines : [],
    url: row.url,
    squareInvoiceUrl: row.square_invoice_id
      ? `https://app.${sandbox ? 'squareupsandbox' : 'squareup'}.com/dashboard/invoices/${encodeURIComponent(row.square_invoice_id)}`
      : null,
    lastError: row.last_error,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadCharge(orgId: OrgId, orderNumber: string, currency: string) {
  const { rows } = await tenantQuery<OrderChargeRow>(orgId, ORDER_ROWS_SQL, [orgId, orderNumber]);
  return computeOrderCharge(orderNumber, rows, currency);
}

async function loadCustomer(orgId: OrgId, customerId: number | null): Promise<PaymentCustomer | null> {
  if (customerId === null) return null;
  const { rows } = await tenantQuery(orgId, CUSTOMER_SQL, [orgId, customerId]);
  const r = rows[0];
  if (!r) return null;
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const name = s(r.name);
  const [given, ...rest] = (name ?? '').split(/\s+/).filter(Boolean);
  return {
    name,
    givenName: s(r.first_name) ?? given ?? null,
    familyName: s(r.last_name) ?? (rest.length > 0 ? rest.join(' ') : null),
    email: s(r.email),
    phone: s(r.phone),
    address: {
      line1: s(r.line1),
      line2: s(r.line2),
      city: s(r.city),
      state: s(r.state),
      postalCode: s(r.postal_code),
      country: s(r.country),
    },
  };
}

async function rowById(orgId: OrgId, id: number): Promise<OrderPaymentRow | null> {
  const { rows } = await tenantQuery<OrderPaymentRow>(
    orgId,
    `SELECT ${ROW_COLUMNS} FROM order_payments WHERE organization_id = $1 AND id = $2`,
    [orgId, id],
  );
  return rows[0] ?? null;
}

async function latestRow(orgId: OrgId, orderNumber: string): Promise<OrderPaymentRow | null> {
  const { rows } = await tenantQuery<OrderPaymentRow>(
    orgId,
    `SELECT ${ROW_COLUMNS} FROM order_payments
      WHERE organization_id = $1 AND order_number = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [orgId, orderNumber],
  );
  return rows[0] ?? null;
}

/** The rail's whole payload for one order: live charge + its latest payment request. */
export async function getOrderPaymentPanel(orgId: OrgId, orderNumber: string): Promise<OrderPaymentPanel> {
  const config = await resolveSquareConfig(orgId).catch(() => null);
  const [charge, row] = await Promise.all([
    loadCharge(orgId, orderNumber, config?.currency ?? 'USD'),
    latestRow(orgId, orderNumber),
  ]);
  const customer = await loadCustomer(orgId, charge.ok ? charge.charge.customerId : row?.customer_id ?? null);
  return {
    orderNumber,
    order: charge.ok ? charge.charge : null,
    orderError: charge.ok ? null : charge.error,
    customer: customer ? { name: customer.name, email: customer.email, phone: customer.phone } : null,
    payment: row ? toView(row, config) : null,
    state: orderPaymentState(row),
  };
}

/** The order-level payment state (latest request), for order surfaces. */
export async function getOrderPaymentState(orgId: OrgId, orderNumber: string): Promise<OrderPaymentState> {
  return orderPaymentState(await latestRow(orgId, orderNumber));
}

// ─── Transitions ────────────────────────────────────────────────────────────

async function transition(
  orgId: OrgId,
  id: number,
  to: OrderPaymentStatus,
  patch: { squarePaymentId?: string | null; lastError?: string | null } = {},
): Promise<OrderPaymentRow | null> {
  const { rows } = await tenantQuery<OrderPaymentRow>(
    orgId,
    `UPDATE order_payments
        SET status = $3,
            square_payment_id = COALESCE($4, square_payment_id),
            last_error = COALESCE($5, last_error),
            paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
            cancelled_at = CASE WHEN $3 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
            updated_at = now()
      WHERE organization_id = $1 AND id = $2 AND status = ANY($6::text[])
      RETURNING ${ROW_COLUMNS}`,
    [orgId, id, to, patch.squarePaymentId ?? null, patch.lastError ?? null, PAYMENT_STATUS_FROM[to]],
  );
  const row = rows[0] ?? null;
  if (row && (to === 'paid' || to === 'refunded')) {
    await publishOrderChanged({ organizationId: orgId, orderIds: row.order_ids, source: `order-payment.${to}` }).catch(
      (err) => console.error('[order-payments] order.changed publish failed', err),
    );
  }
  return row;
}

async function failRow(orgId: OrgId, id: number, error: string): Promise<void> {
  await transition(orgId, id, 'failed', { lastError: error.slice(0, 1000) });
}

// ─── Square helpers ─────────────────────────────────────────────────────────

function squareError(what: string, res: { status: number; errors?: SquareError[] }): string {
  return `Square ${what} failed (${res.status}): ${formatSquareErrors(res.errors)}`;
}

/** Find (by our reference) or create the Square customer an invoice is addressed to. */
async function ensureSquareCustomer(
  config: SquareConfig,
  orgId: OrgId,
  customerId: number,
  customer: PaymentCustomer,
): Promise<Result<{ squareCustomerId: string }>> {
  const referenceId = `cf:${orgId.slice(0, 8)}:${customerId}`;
  const found = await squareFetch<{ customers?: Array<{ id?: string }> }>('/customers/search', {
    method: 'POST',
    config,
    body: { limit: 1, query: { filter: { reference_id: { exact: referenceId } } } },
  });
  const phone = e164Phone(customer.phone);
  const contact = {
    ...(customer.email ? { email_address: customer.email } : {}),
    ...(phone ? { phone_number: phone } : {}),
  };
  const existing = found.ok ? found.data.customers?.[0]?.id : undefined;
  if (existing) {
    // Square will not publish an invoice to a payer without email or phone — keep it current.
    if (Object.keys(contact).length > 0) {
      const updated = await squareFetch(`/customers/${encodeURIComponent(existing)}`, { method: 'PUT', config, body: contact });
      if (!updated.ok) return { ok: false, error: squareError('customer update', updated) };
    }
    return { ok: true, squareCustomerId: existing };
  }

  const created = await squareFetch<{ customer?: { id?: string } }>('/customers', {
    method: 'POST',
    config,
    body: {
      idempotency_key: randomUUID(),
      reference_id: referenceId,
      ...(customer.givenName ? { given_name: customer.givenName } : {}),
      ...(customer.familyName ? { family_name: customer.familyName } : {}),
      ...(!customer.givenName && !customer.familyName && customer.name ? { company_name: customer.name } : {}),
      ...contact,
    },
  });
  const id = created.data.customer?.id;
  if (!created.ok || !id) return { ok: false, error: squareError('customer create', created) };
  return { ok: true, squareCustomerId: id };
}

async function cancelSquareOrder(config: SquareConfig, squareOrderId: string): Promise<void> {
  const got = await squareFetch<{ order?: { version?: number; state?: string } }>(`/orders/${encodeURIComponent(squareOrderId)}`, { config });
  const order = got.data.order;
  if (!got.ok || !order || order.state !== 'OPEN') return;
  await squareFetch(`/orders/${encodeURIComponent(squareOrderId)}`, {
    method: 'PUT',
    config,
    body: { idempotency_key: randomUUID(), order: { version: order.version, state: 'CANCELED' } },
  });
}

function redirectUrl(orderNumber: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return null;
  return `${base}/pay/thanks?order=${encodeURIComponent(orderNumber)}`;
}

// ─── Request ────────────────────────────────────────────────────────────────

export async function requestOrderPayment(
  orgId: OrgId,
  args: { orderNumber: string; method: RequestableMethod; staffId: number | null; idempotencyKey?: string },
): Promise<Result<{ payment: OrderPaymentView; existing: boolean }>> {
  const orderNumber = args.orderNumber.trim();
  const config = await resolveSquareConfig(orgId);
  const charge = await loadCharge(orgId, orderNumber, config.currency);
  if (!charge.ok) return charge;
  const c = charge.charge;
  if (c.currency !== config.currency) {
    return { ok: false, error: `Order ${orderNumber} is priced in ${c.currency}, but Square takes ${config.currency}.` };
  }

  // A paid order is never asked to pay again: hand back the paid request instead.
  const latest = await latestRow(orgId, orderNumber);
  if (latest?.status === 'paid') return { ok: true, payment: toView(latest, config), existing: true };

  const customer = await loadCustomer(orgId, c.customerId);
  if (args.method === 'square_invoice') {
    if (!customer) {
      return { ok: false, error: `Order ${orderNumber} has no customer on it, so there is no one to address an invoice to. Use a payment link, or add the customer first.` };
    }
    // Square refuses to publish an invoice to a payer with neither.
    if (!customer.email && !e164Phone(customer.phone)) {
      return { ok: false, error: `Order ${orderNumber}'s customer has no email or phone on file, which Square needs for an invoice. Add one, or use a payment link.` };
    }
  }

  // Claim: one open request per order (partial unique index) and one row per key.
  const idempotencyKey = (args.idempotencyKey?.trim() || randomUUID()).slice(0, 100);
  const inserted = await tenantQuery<OrderPaymentRow>(
    orgId,
    `INSERT INTO order_payments
       (organization_id, order_number, order_ids, customer_id, method, status, amount_cents, currency, lines,
        idempotency_key, created_by)
     VALUES ($1, $2, $3::int[], $4, $5, 'pending', $6, $7, $8::jsonb, $9, $10)
     ON CONFLICT DO NOTHING
     RETURNING ${ROW_COLUMNS}`,
    [orgId, orderNumber, c.orderIds, c.customerId, args.method, c.totalCents, c.currency, JSON.stringify(c.lines), idempotencyKey, args.staffId],
  );
  const claimed = inserted.rows[0];
  if (!claimed) {
    const { rows } = await tenantQuery<OrderPaymentRow>(
      orgId,
      `SELECT ${ROW_COLUMNS} FROM order_payments
        WHERE organization_id = $1 AND (idempotency_key = $2 OR (order_number = $3 AND status = ANY($4::text[])))
        ORDER BY created_at DESC LIMIT 1`,
      [orgId, idempotencyKey, orderNumber, OPEN_PAYMENT_STATUSES],
    );
    if (!rows[0]) return { ok: false, error: 'Another payment request for this order is being created — try again in a moment.' };
    return { ok: true, payment: toView(rows[0], config), existing: true };
  }

  const id = Number(claimed.id);
  try {
    if (args.method === 'square_link') {
      const res = await squareFetch<{ payment_link?: { id?: string; url?: string; long_url?: string; order_id?: string } }>(
        '/online-checkout/payment-links',
        {
          method: 'POST',
          config,
          body: buildPaymentLinkBody({
            idempotencyKey,
            order: buildSquareOrder({ locationId: config.locationId, orderNumber, orgId, paymentId: id, currency: c.currency, lines: c.lines }),
            orderNumber,
            customer,
            redirectUrl: redirectUrl(orderNumber),
          }),
        },
      );
      const link = res.data.payment_link;
      if (!res.ok || !link?.id || !link.url) {
        const error = squareError('payment link', res);
        await failRow(orgId, id, error);
        return { ok: false, error };
      }
      const { rows } = await tenantQuery<OrderPaymentRow>(
        orgId,
        `UPDATE order_payments
            SET square_payment_link_id = $3, square_order_id = $4, url = $5, updated_at = now()
          WHERE organization_id = $1 AND id = $2
          RETURNING ${ROW_COLUMNS}`,
        [orgId, id, link.id, link.order_id ?? null, link.url],
      );
      return { ok: true, payment: toView(rows[0], config), existing: false };
    }

    // Invoice: Square customer → Square order → draft invoice → publish (share manually).
    // `customer` is non-null here: an invoice without one was refused above.
    const customerRes = await ensureSquareCustomer(config, orgId, c.customerId as number, customer as PaymentCustomer);
    if (!customerRes.ok) {
      await failRow(orgId, id, customerRes.error);
      return customerRes;
    }
    const orderRes = await squareFetch<{ order?: { id?: string } }>('/orders', {
      method: 'POST',
      config,
      body: {
        idempotency_key: `${idempotencyKey}-order`,
        order: buildSquareOrder({
          locationId: config.locationId, orderNumber, orgId, paymentId: id, currency: c.currency, lines: c.lines,
          squareCustomerId: customerRes.squareCustomerId,
        }),
      },
    });
    const squareOrderId = orderRes.data.order?.id;
    if (!orderRes.ok || !squareOrderId) {
      const error = squareError('order', orderRes);
      await failRow(orgId, id, error);
      return { ok: false, error };
    }
    await tenantQuery(
      orgId,
      `UPDATE order_payments SET square_order_id = $3, square_customer_id = $4, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id, squareOrderId, customerRes.squareCustomerId],
    );

    // Invoice numbers are unique per Square location: a re-request after a cancel gets a suffix.
    const prior = await tenantQuery<{ n: string }>(
      orgId,
      `SELECT COUNT(*)::text AS n FROM order_payments
        WHERE organization_id = $1 AND order_number = $2 AND method = 'square_invoice' AND id <> $3 AND square_invoice_id IS NOT NULL`,
      [orgId, orderNumber, id],
    );
    const priorCount = Number(prior.rows[0]?.n ?? 0);
    const location = await squareFetch<{ location?: { timezone?: string } }>(`/locations/${encodeURIComponent(config.locationId)}`, { config });
    const draft = await squareFetch<{ invoice?: { id?: string; version?: number } }>('/invoices', {
      method: 'POST',
      config,
      body: buildInvoiceBody({
        idempotencyKey: `${idempotencyKey}-inv`,
        locationId: config.locationId,
        squareOrderId,
        squareCustomerId: customerRes.squareCustomerId,
        invoiceNumber: priorCount > 0 ? `${orderNumber}-${priorCount + 1}` : orderNumber,
        orderNumber,
        dueDate: localDate(new Date(), location.data.location?.timezone),
      }),
    });
    const invoiceId = draft.data.invoice?.id;
    if (!draft.ok || !invoiceId) {
      const error = squareError('invoice', draft);
      await cancelSquareOrder(config, squareOrderId).catch(() => undefined);
      await failRow(orgId, id, error);
      return { ok: false, error };
    }
    await tenantQuery(
      orgId,
      `UPDATE order_payments SET square_invoice_id = $3, square_invoice_version = $4, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id, invoiceId, draft.data.invoice?.version ?? 0],
    );
    const published = await squareFetch<{ invoice?: { version?: number; public_url?: string; status?: string } }>(
      `/invoices/${encodeURIComponent(invoiceId)}/publish`,
      { method: 'POST', config, body: { idempotency_key: `${idempotencyKey}-pub`, version: draft.data.invoice?.version ?? 0 } },
    );
    if (!published.ok) {
      const error = squareError('invoice publish', published);
      await tenantQuery(orgId, `UPDATE order_payments SET last_error = $3, updated_at = now() WHERE organization_id = $1 AND id = $2`, [orgId, id, error]);
      // The draft stays in Square; the row stays pending so staff can cancel it from the rail.
      const row = await rowById(orgId, id);
      return { ok: true, payment: toView(row as OrderPaymentRow, config), existing: false };
    }
    await tenantQuery(
      orgId,
      `UPDATE order_payments
          SET url = $3, square_invoice_version = $4, status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id, published.data.invoice?.public_url ?? null, published.data.invoice?.version ?? null],
    );
    const row = await rowById(orgId, id);
    return { ok: true, payment: toView(row as OrderPaymentRow, config), existing: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await failRow(orgId, id, error).catch(() => undefined);
    return { ok: false, error };
  }
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

export async function cancelOrderPayment(orgId: OrgId, id: number): Promise<Result<{ payment: OrderPaymentView }>> {
  const row = await rowById(orgId, id);
  if (!row) return { ok: false, error: 'That payment request does not exist.' };
  const config = await resolveSquareConfig(orgId);
  if (row.status === 'paid' || row.status === 'refunded') {
    return { ok: false, error: 'This order is already paid — refunds are made in Square.' };
  }
  if (row.status === 'cancelled') return { ok: true, payment: toView(row, config) };

  if (row.square_payment_link_id) {
    const res = await squareFetch(`/online-checkout/payment-links/${encodeURIComponent(row.square_payment_link_id)}`, { method: 'DELETE', config });
    if (!res.ok && res.status !== 404) return { ok: false, error: squareError('payment link delete', res) };
  }
  if (row.square_invoice_id) {
    const got = await squareFetch<{ invoice?: { version?: number; status?: string } }>(
      `/invoices/${encodeURIComponent(row.square_invoice_id)}`,
      { config },
    );
    const invoice = got.data.invoice;
    if (got.ok && invoice) {
      const status = String(invoice.status ?? '').toUpperCase();
      if (status === 'PAID') {
        await transition(orgId, id, 'paid');
        return { ok: false, error: 'The invoice was already paid — refunds are made in Square.' };
      }
      const res =
        status === 'DRAFT'
          ? await squareFetch(`/invoices/${encodeURIComponent(row.square_invoice_id)}?version=${invoice.version ?? 0}`, { method: 'DELETE', config })
          : status === 'CANCELED'
            ? { ok: true, status: 200 }
            : await squareFetch(`/invoices/${encodeURIComponent(row.square_invoice_id)}/cancel`, {
                method: 'POST',
                config,
                body: { version: invoice.version ?? 0 },
              });
      if (!res.ok) return { ok: false, error: squareError('invoice cancel', res as { status: number; errors?: SquareError[] }) };
    } else if (got.status !== 404) {
      return { ok: false, error: squareError('invoice read', got) };
    }
  }
  if (row.square_order_id && row.method === 'square_invoice') {
    await cancelSquareOrder(config, row.square_order_id).catch(() => undefined);
  }
  const updated = await transition(orgId, id, 'cancelled');
  return { ok: true, payment: toView(updated ?? (await rowById(orgId, id)) ?? row, config) };
}

// ─── Poll fallback ──────────────────────────────────────────────────────────

/**
 * Ask Square where an open request stands — the fallback when a webhook was
 * missed. Throttled per row (at most one Square round trip per 8 s).
 */
export async function refreshOrderPayment(orgId: OrgId, id: number): Promise<OrderPaymentView | null> {
  const claimed = await tenantQuery<{ id: string }>(
    orgId,
    `UPDATE order_payments SET last_checked_at = now()
      WHERE organization_id = $1 AND id = $2 AND status = ANY($3::text[])
        AND (last_checked_at IS NULL OR last_checked_at < now() - interval '8 seconds')
      RETURNING id`,
    [orgId, id, OPEN_PAYMENT_STATUSES],
  );
  const config = await resolveSquareConfig(orgId);
  const row = await rowById(orgId, id);
  if (!row) return null;
  if (claimed.rows.length === 0) return toView(row, config);

  if (row.square_invoice_id) {
    const got = await squareFetch<{ invoice?: { status?: string } }>(`/invoices/${encodeURIComponent(row.square_invoice_id)}`, { config });
    const next = got.ok ? statusForInvoice(got.data.invoice?.status) : null;
    if (next && next !== row.status) await transition(orgId, id, next);
  } else if (row.square_order_id) {
    const got = await squareFetch<{ order?: Parameters<typeof statusForSquareOrder>[0] }>(`/orders/${encodeURIComponent(row.square_order_id)}`, { config });
    const next = got.ok ? statusForSquareOrder(got.data.order, row.amount_cents) : { status: null, paymentId: null };
    if (next.status && next.status !== row.status) await transition(orgId, id, next.status, { squarePaymentId: next.paymentId });
  }
  const after = await rowById(orgId, id);
  return after ? toView(after, config) : null;
}

// ─── Webhook ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Apply one Square webhook event to its order payment, if it is ours.
 *
 * The org comes from `merchantOrg` (the existing merchant → org resolution)
 * or, failing that, from the `cf_org` metadata we stamped on the Square order
 * when we created it — and the row must then exist IN that org with that
 * Square id, or nothing is written.
 */
export async function applySquarePaymentWebhook(
  event: unknown,
  merchantOrg: OrgId | null,
  deps: { fetchSquareOrderMeta?: (squareOrderId: string) => Promise<Record<string, string> | null> } = {},
): Promise<{ handled: false; reason: string } | { handled: true; paymentId: number; status: OrderPaymentStatus }> {
  const effect = squarePaymentEventEffect(event);
  if (!effect) return { handled: false, reason: 'not a payment outcome' };

  let orgId = merchantOrg;
  if (!orgId && effect.squareOrderId) {
    const meta = await (deps.fetchSquareOrderMeta ?? fetchSquareOrderMeta)(effect.squareOrderId);
    const org = meta?.[SQUARE_ORDER_META.org];
    if (org && UUID_RE.test(org)) orgId = org as OrgId;
  }
  if (!orgId) return { handled: false, reason: 'no org for this event' };

  const { rows } = await tenantQuery<{ id: string }>(
    orgId,
    `SELECT id FROM order_payments
      WHERE organization_id = $1
        AND (($2::text IS NOT NULL AND square_invoice_id = $2)
          OR ($3::text IS NOT NULL AND square_order_id = $3)
          OR ($4::text IS NOT NULL AND square_payment_id = $4))
      ORDER BY created_at DESC LIMIT 1`,
    [orgId, effect.squareInvoiceId, effect.squareOrderId, effect.status === 'refunded' ? effect.squarePaymentId : null],
  );
  const id = rows[0] ? Number(rows[0].id) : null;
  if (id === null) return { handled: false, reason: 'no matching order payment' };
  const moved = await transition(orgId, id, effect.status, { squarePaymentId: effect.status === 'paid' ? effect.squarePaymentId : null });
  if (!moved) return { handled: false, reason: 'status already settled' };
  return { handled: true, paymentId: id, status: moved.status };
}

async function fetchSquareOrderMeta(squareOrderId: string): Promise<Record<string, string> | null> {
  // Session-less: the deployment's Square credentials (the same the webhook route uses).
  const res = await squareFetch<{ order?: { metadata?: Record<string, string> } }>(
    `/orders/${encodeURIComponent(squareOrderId)}`,
    { config: getSquareConfig() },
  );
  return res.ok ? res.data.order?.metadata ?? null : null;
}
