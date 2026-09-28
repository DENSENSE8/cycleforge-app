/**
 * Square invoice import — the pure half: which Square invoices can seed a new
 * CycleForge sales order, and how an invoice + its Square order + the catalog
 * variations it references become the intake form's prefill. Integer cents
 * end to end. The I/O half lives in ./square-invoice-import.
 */

import { statusForInvoice, type OrderPaymentStatus, type PaymentLine } from '@/lib/order-payments/model';
import { isCardLast4, looksLikePan, type CardBrand, type CardEntryMethod, type TenderType } from '@/lib/order-payments/tender';

// ─── Square wire shapes (only the fields we read) ────────────────────────────

export interface SquareMoney {
  amount?: number | string | null;
  currency?: string | null;
}

export interface SquareAddress {
  address_line_1?: string | null;
  address_line_2?: string | null;
  locality?: string | null;
  administrative_district_level_1?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface SquareInvoice {
  id?: string;
  version?: number;
  invoice_number?: string | null;
  status?: string | null;
  title?: string | null;
  created_at?: string | null;
  order_id?: string | null;
  location_id?: string | null;
  public_url?: string | null;
  primary_recipient?: {
    customer_id?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    company_name?: string | null;
    email_address?: string | null;
    phone_number?: string | null;
    address?: SquareAddress | null;
  } | null;
  payment_requests?: Array<{
    computed_amount_money?: SquareMoney | null;
    total_completed_amount_money?: SquareMoney | null;
  }> | null;
}

export interface SquareOrderLineItem {
  name?: string | null;
  variation_name?: string | null;
  quantity?: string | number | null;
  base_price_money?: SquareMoney | null;
  catalog_object_id?: string | null;
  note?: string | null;
}

/** Square's card facts on a tender / payment. Only brand, last 4 and entry method are ever read. */
export interface SquareCardDetails {
  status?: string | null;
  card?: { card_brand?: string | null; last_4?: string | null } | null;
  entry_method?: string | null;
  auth_result_code?: string | null;
}

export interface SquareTender {
  id?: string | null;
  type?: string | null;
  payment_id?: string | null;
  created_at?: string | null;
  card_details?: SquareCardDetails | null;
}

export interface SquareOrder {
  id?: string;
  line_items?: SquareOrderLineItem[] | null;
  total_money?: SquareMoney | null;
  tenders?: SquareTender[] | null;
  fulfillments?: Array<{
    type?: string | null;
    shipment_details?: {
      recipient?: {
        display_name?: string | null;
        email_address?: string | null;
        phone_number?: string | null;
        address?: SquareAddress | null;
      } | null;
    } | null;
  }> | null;
}

/** `GET /v2/payments/{id}` — the fields we read (never exp_month / exp_year / bin / fingerprint). */
export interface SquarePayment {
  id?: string | null;
  status?: string | null;
  source_type?: string | null;
  receipt_url?: string | null;
  card_details?: SquareCardDetails | null;
}

export interface SquareCatalogObject {
  id?: string;
  type?: string;
  item_variation_data?: { sku?: string | null } | null;
}

// ─── The contract the intake form consumes ───────────────────────────────────

export interface SquareInvoiceImportAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface SquareInvoiceImportLine {
  title: string;
  quantity: number;
  unitCents: number | null;
  sku: string | null;
  note: string | null;
}

/**
 * How a Square invoice was paid — card FACTS read back from Square (the
 * order's tender, then the Payments API for the receipt). Never a card number.
 */
export interface SquarePaymentFacts {
  paymentId: string | null;
  tender: TenderType;
  cardBrand: CardBrand | null;
  cardLast4: string | null;
  entryMethod: CardEntryMethod | null;
  /** The processor's authorization code (Payments API only). */
  authCode: string | null;
  /** Square's hosted receipt (Payments API only). */
  receiptUrl: string | null;
}

export interface SquareInvoiceImport {
  invoiceId: string;
  invoiceNumber: string;
  /** Square status verbatim (UNPAID, PAID, SCHEDULED, PARTIALLY_PAID, …). */
  status: string;
  title: string | null;
  createdAt: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  customer: { name: string; email: string; phone: string; shipTo: SquareInvoiceImportAddress };
  /** The invoice carried a complete ship-to — without one it is a walk-in / pickup. */
  hasShipTo: boolean;
  /** How it was paid, from the Square order's tender; null while unpaid. */
  payment: SquarePaymentFacts | null;
  lines: SquareInvoiceImportLine[];
  /** Proposed CycleForge order number: `SQ-INV-${invoice_number}`. */
  orderNumber: string;
  /** CycleForge order number already holding this invoice, else null. */
  importedAs: string | null;
}

/** Where each invoice already lives in CycleForge (order_payments link first, then order number). */
export interface ImportedIndex {
  byInvoiceId: ReadonlyMap<string, string>;
  byOrderNumber: ReadonlySet<string>;
}

// ─── Pure mapping ────────────────────────────────────────────────────────────

const SKIPPED_STATUSES: Record<string, true> = { DRAFT: true, CANCELED: true };

/** Drafts were never sent and cancelled invoices are void — neither seeds an order. */
export function isImportableInvoice(invoice: SquareInvoice): boolean {
  return Boolean(invoice.id) && !SKIPPED_STATUSES[String(invoice.status ?? '').toUpperCase()];
}

export function proposedOrderNumber(invoice: Pick<SquareInvoice, 'invoice_number' | 'id'>): string {
  return `SQ-INV-${String(invoice.invoice_number ?? '').trim() || String(invoice.id ?? '')}`;
}

function cents(money: SquareMoney | null | undefined): number | null {
  if (money?.amount === undefined || money.amount === null) return null;
  const n = Number(money.amount);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Square invoice amount: sum of the payment requests' computed / completed amounts. */
export function invoiceMoney(invoice: SquareInvoice): { totalCents: number; paidCents: number; currency: string | null } {
  let totalCents = 0;
  let paidCents = 0;
  let currency: string | null = null;
  for (const req of invoice.payment_requests ?? []) {
    totalCents += cents(req.computed_amount_money) ?? 0;
    paidCents += cents(req.total_completed_amount_money) ?? 0;
    currency ??= str(req.computed_amount_money?.currency) || str(req.total_completed_amount_money?.currency) || null;
  }
  return { totalCents, paidCents, currency };
}

/** catalog_object_id → variation SKU, from a catalog batch-retrieve. */
export function skuByVariationId(objects: ReadonlyArray<SquareCatalogObject> | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const obj of objects ?? []) {
    const sku = str(obj.item_variation_data?.sku);
    if (obj.id && sku) out.set(obj.id, sku);
  }
  return out;
}

/** Every catalog variation id the orders reference, deduped. */
export function catalogObjectIds(orders: ReadonlyArray<SquareOrder>): string[] {
  const ids = new Set<string>();
  for (const order of orders) {
    for (const li of order.line_items ?? []) if (li.catalog_object_id) ids.add(li.catalog_object_id);
  }
  return [...ids];
}

function address(a: SquareAddress | null | undefined): SquareInvoiceImportAddress {
  return {
    address1: str(a?.address_line_1),
    address2: str(a?.address_line_2),
    city: str(a?.locality),
    state: str(a?.administrative_district_level_1),
    postalCode: str(a?.postal_code),
    country: str(a?.country),
  };
}

export function mapLineItem(li: SquareOrderLineItem, skus: ReadonlyMap<string, string>): SquareInvoiceImportLine {
  const name = str(li.name) || 'Item';
  const variation = str(li.variation_name);
  const qty = Math.round(Number(li.quantity ?? 1));
  return {
    title: variation && variation.toLowerCase() !== 'regular' ? `${name} — ${variation}` : name,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unitCents: cents(li.base_price_money),
    sku: (li.catalog_object_id && skus.get(li.catalog_object_id)) || null,
    note: str(li.note) || null,
  };
}

/** One invoice (+ its Square order, when retrieved) → the intake form's prefill. */
export function mapSquareInvoice(args: {
  invoice: SquareInvoice;
  order: SquareOrder | null;
  skus: ReadonlyMap<string, string>;
  imported: ImportedIndex;
  defaultCurrency: string;
}): SquareInvoiceImport {
  const { invoice, order, skus, imported } = args;
  const invoiceId = String(invoice.id ?? '');
  const orderNumber = proposedOrderNumber(invoice);
  const money = invoiceMoney(invoice);
  const recipient = invoice.primary_recipient ?? null;
  const shipment = (order?.fulfillments ?? []).find((f) => String(f.type ?? '').toUpperCase() === 'SHIPMENT');
  const shipRecipient = shipment?.shipment_details?.recipient ?? null;
  const fullName = [str(recipient?.given_name), str(recipient?.family_name)].filter(Boolean).join(' ');
  const shipTo = address(
    shipRecipient?.address && (str(shipRecipient.address.address_line_1) || str(shipRecipient.address.postal_code))
      ? shipRecipient.address
      : recipient?.address,
  );
  return {
    invoiceId,
    invoiceNumber: str(invoice.invoice_number),
    status: String(invoice.status ?? ''),
    title: str(invoice.title) || null,
    createdAt: String(invoice.created_at ?? ''),
    totalCents: money.totalCents,
    paidCents: money.paidCents,
    currency: (money.currency || str(order?.total_money?.currency) || args.defaultCurrency).toUpperCase(),
    customer: {
      name: fullName || str(shipRecipient?.display_name) || str(recipient?.company_name),
      email: str(recipient?.email_address) || str(shipRecipient?.email_address),
      phone: str(recipient?.phone_number) || str(shipRecipient?.phone_number),
      shipTo,
    },
    hasShipTo: Boolean(shipTo.address1 && shipTo.city && shipTo.state && shipTo.postalCode),
    payment: money.paidCents > 0 ? squareTenderFacts(order) : null,
    lines: (order?.line_items ?? []).map((li) => mapLineItem(li, skus)),
    orderNumber,
    importedAs: imported.byInvoiceId.get(invoiceId) ?? (imported.byOrderNumber.has(orderNumber) ? orderNumber : null),
  };
}

// ─── Card facts read back from Square ────────────────────────────────────────

const SQUARE_CARD_BRAND: Record<string, CardBrand> = {
  VISA: 'visa',
  MASTERCARD: 'mastercard',
  AMERICAN_EXPRESS: 'amex',
  DISCOVER: 'discover',
  DISCOVER_DINERS: 'diners',
  JCB: 'jcb',
  CHINA_UNIONPAY: 'unionpay',
  INTERAC: 'interac',
  SQUARE_GIFT_CARD: 'gift_card',
};

const SQUARE_ENTRY_METHOD: Record<string, CardEntryMethod> = {
  CONTACTLESS: 'tap',
  EMV: 'chip',
  SWIPED: 'swipe',
  KEYED: 'keyed',
  ON_FILE: 'on_file',
};

/** Square card statuses that did not move money. */
const DEAD_CARD_STATUSES: Record<string, true> = { FAILED: true, VOIDED: true };

function tenderOf(type: string): TenderType {
  if (type === 'CASH') return 'cash';
  return type === 'CARD' || type === 'SQUARE_GIFT_CARD' || type === 'WALLET' ? 'card' : 'other';
}

/** Brand / last 4 / entry method off Square's card details — every other card field is dropped. */
function cardFacts(details: SquareCardDetails | null | undefined, tender: TenderType) {
  if (tender !== 'card' || !details) return { cardBrand: null, cardLast4: null, entryMethod: null };
  const brandRaw = str(details.card?.card_brand).toUpperCase();
  const last4 = str(details.card?.last_4);
  return {
    cardBrand: brandRaw ? (SQUARE_CARD_BRAND[brandRaw] ?? 'other') : null,
    cardLast4: isCardLast4(last4) ? last4 : null,
    entryMethod: SQUARE_ENTRY_METHOD[str(details.entry_method).toUpperCase()] ?? null,
  };
}

/** The Square order's last live tender → its facts (no receipt / auth code — those are Payments API only). */
export function squareTenderFacts(order: SquareOrder | null | undefined): SquarePaymentFacts | null {
  const live = (order?.tenders ?? []).filter((t) => !DEAD_CARD_STATUSES[str(t.card_details?.status).toUpperCase()]);
  const last = live[live.length - 1];
  if (!last) return null;
  const tender = tenderOf(str(last.type).toUpperCase());
  return {
    paymentId: str(last.payment_id) || str(last.id) || null,
    tender,
    ...cardFacts(last.card_details, tender),
    authCode: null,
    receiptUrl: null,
  };
}

/** `GET /v2/payments/{id}` → its facts, receipt and authorization code included. */
export function squarePaymentFacts(payment: SquarePayment | null | undefined): SquarePaymentFacts | null {
  if (!payment?.id) return null;
  const tender = tenderOf(str(payment.source_type).toUpperCase());
  const auth = str(payment.card_details?.auth_result_code);
  const receipt = str(payment.receipt_url);
  return {
    paymentId: payment.id,
    tender,
    ...cardFacts(payment.card_details, tender),
    authCode: auth && auth.length <= 40 && !looksLikePan(auth) ? auth : null,
    receiptUrl: /^https:\/\//.test(receipt) ? receipt : null,
  };
}

/** Invoices → importable prefills, in the order given (Square returns newest first), capped. */
export function mapSquareInvoices(args: {
  invoices: ReadonlyArray<SquareInvoice>;
  orders: ReadonlyArray<SquareOrder>;
  catalog: ReadonlyArray<SquareCatalogObject>;
  imported: ImportedIndex;
  defaultCurrency: string;
  limit?: number;
}): SquareInvoiceImport[] {
  const ordersById = new Map(args.orders.filter((o) => o.id).map((o) => [o.id as string, o]));
  const skus = skuByVariationId(args.catalog);
  return args.invoices
    .filter(isImportableInvoice)
    .slice(0, args.limit ?? 50)
    .map((invoice) =>
      mapSquareInvoice({
        invoice,
        order: (invoice.order_id && ordersById.get(invoice.order_id)) || null,
        skus,
        imported: args.imported,
        defaultCurrency: args.defaultCurrency,
      }),
    );
}

/** The `order_payments.lines` snapshot for a linked invoice: [{sku,title,qty,unitPriceCents,lineCents}]. */
export function paymentLinesForImport(imp: Pick<SquareInvoiceImport, 'lines'>): PaymentLine[] {
  return imp.lines.map((l) => {
    const unitPriceCents = l.unitCents ?? 0;
    return { sku: l.sku, title: l.title, qty: l.quantity, unitPriceCents, lineCents: unitPriceCents * l.quantity };
  });
}

/** The order_payments status a linked invoice starts in (Square's status, else 'sent'). */
export function paymentStatusForImport(status: string): OrderPaymentStatus {
  return statusForInvoice(status) ?? 'sent';
}
