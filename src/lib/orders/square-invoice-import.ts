/**
 * Square invoice import — the I/O half. Lists the org's Square invoices as
 * sales-order prefills (`/orders/new` → "Import from Square invoice"), and
 * links a saved order to the invoice it came from by recording one
 * `order_payments` row, so the order's payment rail tracks that invoice.
 * Money is always re-read from Square here; the client never sends any.
 */

import 'server-only';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { formatSquareErrors, squareFetch, type SquareConfig, type SquareError } from '@/lib/square/client';
import { resolveSquareConfig } from '@/lib/square/server';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { OPEN_PAYMENT_STATUSES, type OrderPaymentMethod, type OrderPaymentStatus } from '@/lib/order-payments/model';
import {
  catalogObjectIds,
  isImportableInvoice,
  mapSquareInvoice,
  mapSquareInvoices,
  proposedOrderNumber,
  skuByVariationId,
  paymentLinesForImport,
  paymentStatusForImport,
  squarePaymentFacts,
  squareTenderFacts,
  type ImportedIndex,
  type SquareCatalogObject,
  type SquareInvoice,
  type SquareInvoiceImport,
  type SquareOrder,
  type SquarePayment,
  type SquarePaymentFacts,
} from './square-invoice-import-core';

export type { SquareInvoiceImport } from './square-invoice-import-core';

const LIST_LIMIT = 50;
/** Square's search page size; drafts / cancelled are skipped, so read ahead a little. */
const SEARCH_PAGE = 100;
const SEARCH_MAX_PAGES = 3;

type Failure = { ok: false; status: number; error: string };

function squareError(what: string, res: { status: number; errors?: SquareError[] }): Failure {
  return { ok: false, status: 502, error: `Square ${what} failed (${res.status}): ${formatSquareErrors(res.errors)}` };
}

/** The org's Square config, or null when it has none usable (same rule as the payment rail's availability). */
async function usableSquareConfig(orgId: OrgId): Promise<SquareConfig | null> {
  const config = await resolveSquareConfig(orgId).catch(() => null);
  return config?.accessToken && config.locationId ? config : null;
}

/** The invoices' Square orders (one batch call) and the catalog variations they reference (one batch call). */
async function loadInvoiceDetails(
  config: SquareConfig,
  invoices: ReadonlyArray<SquareInvoice>,
): Promise<{ ok: true; orders: SquareOrder[]; catalog: SquareCatalogObject[] } | Failure> {
  const orderIds = [...new Set(invoices.map((i) => i.order_id).filter((id): id is string => Boolean(id)))];
  if (orderIds.length === 0) return { ok: true, orders: [], catalog: [] };
  const ordersRes = await squareFetch<{ orders?: SquareOrder[] }>('/orders/batch-retrieve', {
    method: 'POST',
    config,
    body: { location_id: config.locationId, order_ids: orderIds },
  });
  if (!ordersRes.ok) return squareError('order lookup', ordersRes);
  const orders = ordersRes.data.orders ?? [];
  const objectIds = catalogObjectIds(orders);
  if (objectIds.length === 0) return { ok: true, orders, catalog: [] };
  const catalogRes = await squareFetch<{ objects?: SquareCatalogObject[] }>('/catalog/batch-retrieve', {
    method: 'POST',
    config,
    body: { object_ids: objectIds, include_related_objects: false },
  });
  if (!catalogRes.ok) return squareError('catalog lookup', catalogRes);
  return { ok: true, orders, catalog: catalogRes.data.objects ?? [] };
}

/** Which of these invoices already live in CycleForge — one query per signal. */
async function loadImportedIndex(orgId: OrgId, invoices: ReadonlyArray<SquareInvoice>): Promise<ImportedIndex> {
  const invoiceIds = invoices.map((i) => String(i.id ?? '')).filter(Boolean);
  const orderNumbers = invoices.map(proposedOrderNumber);
  const [linked, orders] = await Promise.all([
    tenantQuery<{ square_invoice_id: string; order_number: string }>(
      orgId,
      `SELECT DISTINCT ON (square_invoice_id) square_invoice_id, order_number
         FROM order_payments
        WHERE organization_id = $1 AND square_invoice_id = ANY($2::text[])
        ORDER BY square_invoice_id, created_at DESC`,
      [orgId, invoiceIds],
    ),
    tenantQuery<{ order_id: string }>(
      orgId,
      'SELECT DISTINCT order_id FROM orders WHERE organization_id = $1 AND order_id = ANY($2::text[])',
      [orgId, orderNumbers],
    ),
  ]);
  return {
    byInvoiceId: new Map(linked.rows.map((r) => [r.square_invoice_id, r.order_number])),
    byOrderNumber: new Set(orders.rows.map((r) => r.order_id)),
  };
}

/** Newest-first Square invoices for the org's location, as intake prefills (drafts / cancelled skipped). */
export async function listSquareInvoiceImports(
  orgId: OrgId,
): Promise<{ ok: true; connected: boolean; invoices: SquareInvoiceImport[] } | Failure> {
  const config = await usableSquareConfig(orgId);
  if (!config) return { ok: true, connected: false, invoices: [] };

  const invoices: SquareInvoice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < SEARCH_MAX_PAGES; page += 1) {
    const res = await squareFetch<{ invoices?: SquareInvoice[]; cursor?: string }>('/invoices/search', {
      method: 'POST',
      config,
      body: {
        query: {
          filter: { location_ids: [config.locationId] },
          sort: { field: 'INVOICE_SORT_DATE', order: 'DESC' },
        },
        limit: SEARCH_PAGE,
        ...(cursor ? { cursor } : {}),
      },
    });
    if (!res.ok) return squareError('invoice search', res);
    invoices.push(...(res.data.invoices ?? []).filter(isImportableInvoice));
    cursor = res.data.cursor;
    if (!cursor || invoices.length >= LIST_LIMIT) break;
  }
  const page = invoices.slice(0, LIST_LIMIT);

  const [details, imported] = await Promise.all([loadInvoiceDetails(config, page), loadImportedIndex(orgId, page)]);
  if (!details.ok) return details;
  return {
    ok: true,
    connected: true,
    invoices: mapSquareInvoices({
      invoices: page,
      orders: details.orders,
      catalog: details.catalog,
      imported,
      defaultCurrency: config.currency,
      limit: LIST_LIMIT,
    }),
  };
}

// ─── How it was paid ─────────────────────────────────────────────────────────

/**
 * The Square order's last live tender, completed from the Payments API
 * (receipt, authorization code) when Square answers. Card FACTS only — the
 * mapper drops every other card field Square returns (expiry, BIN, fingerprint).
 */
async function readPaymentFacts(config: SquareConfig, order: SquareOrder | null): Promise<SquarePaymentFacts | null> {
  const fromTender = squareTenderFacts(order);
  if (!fromTender?.paymentId) return fromTender;
  const res = await squareFetch<{ payment?: SquarePayment }>(`/payments/${encodeURIComponent(fromTender.paymentId)}`, { config });
  return (res.ok && squarePaymentFacts(res.data.payment)) || fromTender;
}

/** How a Square invoice was paid, for the intake's payment step. `null` = unpaid / not readable. */
export async function getSquareInvoicePaymentFacts(
  orgId: OrgId,
  invoiceId: string,
): Promise<{ ok: true; payment: SquarePaymentFacts | null } | Failure> {
  const config = await usableSquareConfig(orgId);
  if (!config) return { ok: false, status: 422, error: 'Square is not connected for this workspace.' };
  const invRes = await squareFetch<{ invoice?: SquareInvoice }>(`/invoices/${encodeURIComponent(invoiceId)}`, { config });
  if (invRes.status === 404) return { ok: false, status: 404, error: 'That Square invoice was not found.' };
  if (!invRes.ok) return squareError('invoice lookup', invRes);
  const orderId = invRes.data.invoice?.order_id;
  if (!orderId) return { ok: true, payment: null };
  const orderRes = await squareFetch<{ order?: SquareOrder }>(`/orders/${encodeURIComponent(orderId)}`, { config });
  if (!orderRes.ok) return squareError('order lookup', orderRes);
  return { ok: true, payment: await readPaymentFacts(config, orderRes.data.order ?? null) };
}

// ─── Link ────────────────────────────────────────────────────────────────────

export interface LinkedInvoicePayment {
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  amountCents: number;
  currency: string;
  url: string | null;
}

interface LinkRow {
  order_number: string;
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  amount_cents: number | string;
  currency: string;
  url: string | null;
}

const LINK_COLUMNS = 'order_number, method, status, amount_cents, currency, url';

function toPayment(row: LinkRow): LinkedInvoicePayment {
  return { method: row.method, status: row.status, amountCents: Number(row.amount_cents), currency: row.currency, url: row.url };
}

/**
 * Record that CycleForge order `orderNumber` is paid through Square invoice
 * `invoiceId`: one `order_payments` row (method square_invoice), its amount
 * and status re-read from Square. Idempotent per invoice.
 */
export async function linkSquareInvoiceToOrder(
  orgId: OrgId,
  args: { orderNumber: string; invoiceId: string; staffId: number | null },
): Promise<{ ok: true; payment: LinkedInvoicePayment } | Failure> {
  const orderNumber = args.orderNumber.trim();
  const invoiceId = args.invoiceId.trim();
  const idempotencyKey = `square-invoice-import:${invoiceId}`;

  const orderRows = await tenantQuery<{ id: number; customer_id: number | null }>(
    orgId,
    'SELECT id, customer_id FROM orders WHERE organization_id = $1 AND order_id = $2 ORDER BY id LIMIT 100',
    [orgId, orderNumber],
  );
  if (orderRows.rows.length === 0) return { ok: false, status: 404, error: `Order ${orderNumber} was not found.` };

  // Already linked (a retry, or the payment rail created this invoice): hand back that row.
  const prior = await tenantQuery<LinkRow>(
    orgId,
    `SELECT ${LINK_COLUMNS} FROM order_payments
      WHERE organization_id = $1 AND (idempotency_key = $2 OR square_invoice_id = $3)
      ORDER BY created_at DESC LIMIT 1`,
    [orgId, idempotencyKey, invoiceId],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].order_number !== orderNumber) {
      return { ok: false, status: 409, error: `This Square invoice is already linked to order ${prior.rows[0].order_number}.` };
    }
    return { ok: true, payment: toPayment(prior.rows[0]) };
  }

  const config = await usableSquareConfig(orgId);
  if (!config) return { ok: false, status: 422, error: 'Square is not connected for this workspace.' };
  const invRes = await squareFetch<{ invoice?: SquareInvoice }>(`/invoices/${encodeURIComponent(invoiceId)}`, { config });
  const invoice = invRes.data.invoice;
  if (invRes.status === 404) return { ok: false, status: 404, error: 'That Square invoice was not found.' };
  if (!invRes.ok || !invoice?.id) return squareError('invoice lookup', invRes);
  if (!isImportableInvoice(invoice)) {
    return { ok: false, status: 422, error: `Square invoice ${invoice.invoice_number ?? invoiceId} is ${String(invoice.status).toLowerCase()} and cannot be linked.` };
  }
  const details = await loadInvoiceDetails(config, [invoice]);
  if (!details.ok) return details;
  const squareOrder = details.orders.find((o) => o.id === invoice.order_id) ?? null;
  const imp = mapSquareInvoice({
    invoice,
    order: squareOrder,
    skus: skuByVariationId(details.catalog),
    imported: { byInvoiceId: new Map(), byOrderNumber: new Set() },
    defaultCurrency: config.currency,
  });
  if (imp.totalCents <= 0) return { ok: false, status: 422, error: 'That Square invoice has no amount to collect.' };

  const open = await tenantQuery<{ n: string }>(
    orgId,
    `SELECT COUNT(*)::text AS n FROM order_payments
      WHERE organization_id = $1 AND order_number = $2 AND status = ANY($3::text[])`,
    [orgId, orderNumber, OPEN_PAYMENT_STATUSES],
  );
  if (Number(open.rows[0]?.n ?? 0) > 0) {
    return { ok: false, status: 409, error: `Order ${orderNumber} already has an open payment request. Cancel it before linking this invoice.` };
  }

  const status = paymentStatusForImport(imp.status);
  // How it was paid: card facts read back from Square, stored beside the row (never a card number).
  const facts = status === 'paid' ? await readPaymentFacts(config, squareOrder) : null;
  const orderIds = orderRows.rows.map((r) => Number(r.id));
  const customerId = orderRows.rows.find((r) => r.customer_id !== null)?.customer_id ?? null;
  let inserted;
  try {
    inserted = await tenantQuery<LinkRow>(
      orgId,
      `INSERT INTO order_payments
         (organization_id, order_number, order_ids, customer_id, method, status, amount_cents, currency, lines,
          square_invoice_id, square_invoice_version, square_order_id, square_customer_id, url, paid_at,
          idempotency_key, created_by,
          square_payment_id, tender, card_brand, card_last4, card_entry_method, payment_reference, receipt_url)
       VALUES ($1, $2, $3::int[], $4, 'square_invoice', $5, $6, $7, $8::jsonb,
               $9, $10, $11, $12, $13, CASE WHEN $5 = 'paid' THEN now() ELSE NULL END,
               $14, $15, $16, $17, $18, $19, $20, $21, $22)
       ON CONFLICT (organization_id, idempotency_key) DO NOTHING
       RETURNING ${LINK_COLUMNS}`,
      [
        orgId, orderNumber, orderIds, customerId, status, imp.totalCents, imp.currency, JSON.stringify(paymentLinesForImport(imp)),
        invoice.id, invoice.version ?? null, invoice.order_id ?? null, invoice.primary_recipient?.customer_id ?? null,
        invoice.public_url ?? null, idempotencyKey, args.staffId,
        facts?.paymentId ?? null, facts?.tender ?? null, facts?.cardBrand ?? null, facts?.cardLast4 ?? null,
        facts?.entryMethod ?? null, facts?.authCode ?? null, facts?.receiptUrl ?? null,
      ],
    );
  } catch (err) {
    // Lost a race with another open request for this order (order_payments_one_open_per_order).
    if ((err as { code?: string }).code === '23505') {
      return { ok: false, status: 409, error: `Order ${orderNumber} already has an open payment request. Cancel it before linking this invoice.` };
    }
    throw err;
  }

  const row = inserted.rows[0];
  if (!row) {
    const { rows } = await tenantQuery<LinkRow>(
      orgId,
      `SELECT ${LINK_COLUMNS} FROM order_payments WHERE organization_id = $1 AND idempotency_key = $2`,
      [orgId, idempotencyKey],
    );
    if (!rows[0]) return { ok: false, status: 409, error: 'This invoice is being linked by another request — try again in a moment.' };
    return { ok: true, payment: toPayment(rows[0]) };
  }

  await publishOrderChanged({ organizationId: orgId, orderIds, source: 'order-payment.square-invoice-import' }).catch((err) =>
    console.error('[square-invoice-import] order.changed publish failed', err),
  );
  return { ok: true, payment: toPayment(row) };
}
