/**
 * Shared Ecwid REST client — vault-first credentials + dogfood env fallback.
 * Document adapters and sync jobs should call through here instead of
 * forking storeId/token resolution or raw `app.ecwid.com` fetches.
 */

import 'server-only';

import {
  getIntegrationCredentials,
  type EcwidCredentials,
} from '@/lib/integrations/credentials';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';

export type { EcwidCredentials };

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';

function envValue(primary: string, aliases: string[] = []): string | null {
  for (const key of [primary, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** Dogfood-only env bridge (USAV). Other orgs must have a vault row. */
function dogfoodEnvCreds(): EcwidCredentials | null {
  const storeId = envValue('ECWID_STORE_ID', [
    'ECWID_STOREID',
    'ECWID_STORE',
    'NEXT_PUBLIC_ECWID_STORE_ID',
  ]);
  const apiToken = envValue('ECWID_API_TOKEN', [
    'ECWID_TOKEN',
    'ECWID_ACCESS_TOKEN',
    'NEXT_PUBLIC_ECWID_API_TOKEN',
  ]);
  if (!storeId || !apiToken) return null;
  return { storeId, apiToken };
}

/**
 * Resolve Ecwid store + token for an org.
 * Vault first; dogfood org may fall back to ECWID_* env vars.
 */
export async function resolveEcwidCreds(orgId: OrgId): Promise<EcwidCredentials | null> {
  const vault = await getIntegrationCredentials<EcwidCredentials>(orgId, 'ecwid');
  if (vault?.storeId && vault?.apiToken) return vault;
  if (orgId === DOGFOOD_ORG_ID) return dogfoodEnvCreds();
  return null;
}

export class EcwidApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'EcwidApiError';
  }
}

/** Trailing N digits of a phone, formatting-insensitive. */
function lastDigits(value: string | null | undefined, n = 10): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

/**
 * Confirm that an order number belongs to a phone, and return its public order
 * number.
 *
 * The counter's prior-order reveal is deliberately a TWO-KEY check (order # +
 * phone). An order number alone is a guessable, sequential key, and the kiosk
 * device principal is unattended-capable — anything one key can reveal, a
 * stranger can reveal. So this answers exactly one question ("do these two
 * agree?") and returns nothing else.
 *
 * That narrowness is why it does NOT reuse /api/ecwid/order-search: that route
 * exists to hand an authenticated operator a rich list of order CANDIDATES to
 * pick from. Returning candidates to an unattended tablet is the fishing
 * surface this check is designed to avoid.
 *
 * Returns null when the creds are missing, the lookup fails, no order matches,
 * or the phone does not agree — the caller cannot distinguish, by design.
 */
export async function confirmOrderNumberForPhone(args: {
  orgId: OrgId;
  orderNumber: string;
  phone: string;
}): Promise<string | null> {
  const orderNumber = args.orderNumber.trim();
  const phoneKey = lastDigits(args.phone);
  // A short phone tail would match far too many orders to be an identity check.
  if (!orderNumber || phoneKey.length < 7) return null;

  const creds = await resolveEcwidCreds(args.orgId);
  if (!creds) return null;

  try {
    const url =
      `${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}/orders` +
      `?keywords=${encodeURIComponent(orderNumber)}&limit=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { items?: unknown[] };
    for (const raw of body.items ?? []) {
      const order = raw as Record<string, unknown>;
      const publicNumber = String(
        order.orderNumber ?? order.vendorOrderNumber ?? order.id ?? '',
      ).trim();
      // Exact order-number agreement only — a keyword hit is not a match.
      if (!publicNumber) continue;
      const normalizedPublic = publicNumber.replace(/^#/, '');
      if (
        normalizedPublic !== orderNumber.replace(/^#/, '') &&
        String(order.id ?? '').trim() !== orderNumber
      ) {
        continue;
      }

      const billing = (order.billingPerson ?? {}) as Record<string, unknown>;
      const shipping = (order.shippingPerson ?? {}) as Record<string, unknown>;
      const candidatePhones = [order.phone, billing.phone, shipping.phone];
      if (candidatePhones.some((p) => lastDigits(p as string | null) === phoneKey)) {
        return normalizedPublic;
      }
    }
    return null;
  } catch {
    // A prior-order reveal is a convenience. A vendor outage must never fail the
    // counter transaction it decorates.
    return null;
  }
}

/**
 * Fetch the Ecwid order invoice PDF (packing-slip / receipt stand-in).
 * `orderRef` is the public order number (e.g. `4787`) or Ecwid internal id.
 */
export async function fetchInvoicePdf(
  storeId: string,
  apiToken: string,
  orderRef: string,
): Promise<Buffer> {
  const ref = orderRef.trim();
  if (!ref) throw new EcwidApiError('Missing Ecwid order reference', 400);

  const url = `${ECWID_BASE_URL}/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(ref)}/invoice-pdf`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/pdf',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EcwidApiError(
      `Ecwid invoice-pdf failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
      res.status,
    );
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ── Channel order (CX0) ──────────────────────────────────────────────────────
//
// The READ half of an in-store channel exchange
// (docs/todo/counter-channel-exchange-PLAN.md). `confirmOrderNumberForPhone`
// above answers "do these two keys agree?" and deliberately returns nothing
// else; this is what the desk fetches AFTERWARDS, once that check has passed,
// to hydrate the buyer and the returnable lines.
//
// The ordering is the security property, not a convenience: `getEcwidOrder`
// takes ONE key and hands back the buyer's name, email, phone and address. On
// its own that is exactly the fishing surface the two-key check exists to
// prevent, so it is never reachable by the device principal directly — see
// the plan's §8 device-principal row.

/**
 * Why a channel return was refused, as a closed vocabulary.
 *
 * These are *typed* because the counter has to say different true things for
 * each: `ALREADY_REFUNDED` means walk away, `PARTIAL_ONLY` means the amount
 * has to come down, `NOT_REFUNDABLE` means this order can never be the
 * subject of a return. Collapsing them into one boolean is how a staff member
 * ends up retrying a refund that can never succeed.
 */
export type ChannelReturnRefusal =
  | 'NOT_FOUND'
  | 'NOT_CONNECTED'
  | 'LOOKUP_FAILED'
  | 'NOT_REFUNDABLE'
  | 'ALREADY_REFUNDED'
  | 'PARTIAL_ONLY';

export class ChannelOrderError extends Error {
  constructor(
    public readonly refusal: ChannelReturnRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'ChannelOrderError';
  }
}

/** A person on the order — billing or shipping. Never rendered with a vendor noun (plan X10). */
export interface ChannelOrderPerson {
  name: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  stateOrProvince: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

/** One returnable line on the channel order. `id` is what a return write cites. */
export interface ChannelOrderItem {
  id: string;
  sku: string | null;
  title: string;
  quantity: number;
  /** Minor units. */
  unitAmountCents: number;
  /** quantity × unit, as the channel reports it — never re-derived here. */
  extendedAmountCents: number;
}

export interface ChannelOrderRefund {
  id: string | null;
  amountCents: number;
  reason: string | null;
  source: string | null;
  date: string | null;
}

/**
 * A channel order, normalized.
 *
 * `provider` is a discriminator so a later Shopify adapter maps INTO this
 * shape rather than beside it — the counter, the receipt and the
 * `channel_return` record all speak this vocabulary and none of them import
 * an Ecwid type.
 */
export interface ChannelOrder {
  provider: 'ecwid';
  /** Ecwid internal id — the stable key, kept so the desk never depends on ingest lag (plan X7). */
  id: string;
  /** What the customer reads off their emailed receipt. */
  publicOrderNumber: string;
  createdAt: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string | null;
  totalCents: number;
  /** Already refunded before we touched it. Sum of `refunds`, or the channel's own figure. */
  refundedCents: number;
  refunds: ChannelOrderRefund[];
  email: string | null;
  phone: string | null;
  billing: ChannelOrderPerson | null;
  shipping: ChannelOrderPerson | null;
  items: ChannelOrderItem[];
}

/**
 * Ecwid reports money as a decimal in the store's currency (`14.99`), not
 * minor units. Everything downstream of here is integer cents, so the
 * conversion happens exactly once, at the boundary.
 */
function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function str(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
}

function toPerson(raw: unknown): ChannelOrderPerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const person: ChannelOrderPerson = {
    name: str(p.name),
    email: str(p.email),
    phone: str(p.phone),
    street: str(p.street),
    city: str(p.city),
    stateOrProvince: str(p.stateOrProvinceName ?? p.stateOrProvinceCode),
    postalCode: str(p.postalCode),
    countryCode: str(p.countryCode),
  };
  // An all-null person is absence, not an empty card on the desk.
  return Object.values(person).some((v) => v !== null) ? person : null;
}

function toItem(raw: unknown, index: number): ChannelOrderItem {
  const it = (raw ?? {}) as Record<string, unknown>;
  const quantity = Number.isFinite(Number(it.quantity)) ? Math.trunc(Number(it.quantity)) : 0;
  const unitAmountCents = toCents(it.price);
  return {
    // `id` is what a return write cites, so it must never be empty. Ecwid line
    // ids have been observed absent on legacy orders; fall back to the cart
    // position, which is stable for a given order snapshot.
    id: str(it.id) ?? `line-${index}`,
    sku: str(it.sku),
    title: str(it.name) ?? str(it.sku) ?? 'Item',
    quantity,
    unitAmountCents,
    // The channel's own extended figure wins when present — a per-line
    // discount lives there and nowhere in `price × quantity`.
    extendedAmountCents:
      it.total == null ? quantity * unitAmountCents : toCents(it.total),
  };
}

function toRefund(raw: unknown): ChannelOrderRefund {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    amountCents: toCents(r.amount),
    reason: str(r.reason),
    source: str(r.source),
    date: str(r.date),
  };
}

/**
 * Map an Ecwid GET-order body onto {@link ChannelOrder}. PURE — no fetch, no
 * credentials — so the field mapping is asserted in `client.test.ts` against a
 * redacted fixture rather than against a live store.
 */
export function mapEcwidOrderToChannelOrder(raw: Record<string, unknown>): ChannelOrder {
  const refunds = Array.isArray(raw.refunds) ? raw.refunds.map(toRefund) : [];
  const summedRefunds = refunds.reduce((sum, r) => sum + r.amountCents, 0);
  const billing = toPerson(raw.billingPerson);
  const shipping = toPerson(raw.shippingPerson);
  return {
    provider: 'ecwid',
    id: str(raw.id) ?? '',
    publicOrderNumber: (str(raw.orderNumber) ?? str(raw.vendorOrderNumber) ?? str(raw.id) ?? '')
      .replace(/^#/, ''),
    createdAt: str(raw.createDate ?? raw.createTimestamp),
    paymentStatus: str(raw.paymentStatus),
    fulfillmentStatus: str(raw.fulfillmentStatus),
    currency: str(raw.currency),
    totalCents: toCents(raw.total),
    // Prefer the channel's own `refundedAmount` when it reports one: it is the
    // figure a refund WRITE moves, and Slice 0 reads it back to decide whether
    // the write moved money at all. Summing `refunds[]` is the fallback.
    refundedCents: raw.refundedAmount == null ? summedRefunds : toCents(raw.refundedAmount),
    refunds,
    email: str(raw.email) ?? billing?.email ?? shipping?.email ?? null,
    phone: str(raw.phone) ?? billing?.phone ?? shipping?.phone ?? null,
    billing,
    shipping,
    items: Array.isArray(raw.items) ? raw.items.map(toItem) : [],
  };
}

/**
 * Payment statuses that can never be the subject of a return.
 *
 * `AWAITING_PAYMENT` / `CANCELLED` are not "refund failed" — there is no money
 * on this order to give back, so the counter must say so rather than call an
 * API and report a vendor error.
 */
const NON_REFUNDABLE_PAYMENT_STATUSES = new Set([
  'AWAITING_PAYMENT',
  'CANCELLED',
  'INCOMPLETE',
]);

export type ChannelReturnEligibility =
  | { ok: true; refundableCents: number }
  | { ok: false; refusal: ChannelReturnRefusal; message: string; refundableCents: number };

/**
 * Can this order absorb a return of `amountCents`? PURE, and deliberately
 * separate from any write: the desk needs this answer BEFORE a staff member
 * steps up, and the write path needs the identical rule afterwards.
 *
 * `amountCents` omitted asks only "is anything returnable here at all?".
 */
export function assessChannelReturn(
  order: ChannelOrder,
  amountCents?: number,
): ChannelReturnEligibility {
  const refundableCents = Math.max(0, order.totalCents - order.refundedCents);
  const paymentStatus = (order.paymentStatus ?? '').toUpperCase();

  if (NON_REFUNDABLE_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      ok: false,
      refusal: 'NOT_REFUNDABLE',
      message: `This order is ${paymentStatus.toLowerCase().replace(/_/g, ' ')} — there is nothing to return.`,
      refundableCents: 0,
    };
  }
  if (refundableCents <= 0) {
    return {
      ok: false,
      refusal: 'ALREADY_REFUNDED',
      message: 'This order has already been refunded in full.',
      refundableCents: 0,
    };
  }
  if (typeof amountCents === 'number' && amountCents > refundableCents) {
    // Named apart from ALREADY_REFUNDED on purpose: a partial refund already
    // landed, so the staff member's next move is to lower the amount, not to
    // walk away.
    return {
      ok: false,
      refusal: 'PARTIAL_ONLY',
      message: 'Only part of this order is still returnable.',
      refundableCents,
    };
  }
  return { ok: true, refundableCents };
}

/**
 * Fetch one full channel order.
 *
 * `orderRef` is the PUBLIC order number (`4787`) or the Ecwid internal id —
 * the same reference `fetchInvoicePdf` takes, and the value
 * `confirmOrderNumberForPhone` hands back on a successful two-key match.
 *
 * Throws {@link ChannelOrderError} rather than returning null: unlike the
 * two-key check (whose whole point is that a caller cannot tell WHY it said
 * no), the desk is authenticated here and every failure mode is a different
 * thing to put on the screen — "not connected" is a settings link, "not found"
 * is a typo in the order number.
 *
 * ── Slice 0 note (money) ────────────────────────────────────────────────────
 * This is the READ half only. The refund WRITE is deliberately absent: Ecwid's
 * public REST v3 lists no `POST /orders/{id}/refund`, refunds appear as a READ
 * array on this response, and whether `PUT /orders/{id}` actually returns money
 * to the original tender depends on the store's payment module. Guessing a
 * refund URL is forbidden by the plan (§4). Whoever implements CX2 must first
 * run the write against the dogfood vault store and record here which call, if
 * any, moved `refundedAmount` — and if none did, the product owes the customer
 * an honest "status updated, card refund may be manual", never a fake success.
 */
export async function getEcwidOrder(orgId: OrgId, orderRef: string): Promise<ChannelOrder> {
  const ref = orderRef.trim().replace(/^#/, '');
  if (!ref) throw new ChannelOrderError('NOT_FOUND', 'Missing order reference.');

  const creds = await resolveEcwidCreds(orgId);
  if (!creds) {
    throw new ChannelOrderError(
      'NOT_CONNECTED',
      'No online store is connected for this organization.',
    );
  }

  const url = `${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}/orders/${encodeURIComponent(ref)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    throw new ChannelOrderError(
      'LOOKUP_FAILED',
      `Could not reach the online store: ${err instanceof Error ? err.message : 'network error'}`,
    );
  }

  return interpretChannelOrderResponse({
    ref,
    status: res.status,
    ok: res.ok,
    body: res.ok ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null,
    errorText: res.ok ? '' : await res.text().catch(() => ''),
  });
}

/**
 * Turn a GET-order response into a {@link ChannelOrder} or the right typed
 * refusal. Pure — the caller owns the socket — so every status the desk has to
 * put on screen is asserted without a vault token, the same shape
 * `interpretStageOrderResponse` uses for Square.
 */
export function interpretChannelOrderResponse(res: {
  ref: string;
  status: number;
  ok: boolean;
  body: Record<string, unknown> | null;
  errorText?: string;
}): ChannelOrder {
  if (res.status === 404) {
    throw new ChannelOrderError('NOT_FOUND', `No online order ${res.ref}.`);
  }
  if (!res.ok) {
    const detail = res.errorText ? `: ${res.errorText.slice(0, 200)}` : '';
    throw new ChannelOrderError(
      'LOOKUP_FAILED',
      `Online store lookup failed (${res.status})${detail}`,
    );
  }
  // A 200 with no id is not an order. Trusting it would put a return on the
  // desk that cites nothing.
  if (!res.body || typeof res.body !== 'object' || !str(res.body.id)) {
    throw new ChannelOrderError('NOT_FOUND', `No online order ${res.ref}.`);
  }
  return mapEcwidOrderToChannelOrder(res.body);
}
