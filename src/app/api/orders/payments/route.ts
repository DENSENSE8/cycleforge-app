import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrderPaymentPanel, recordInPersonPayment, refreshOrderPayment, requestOrderPayment } from '@/lib/order-payments/service';
import { PAN_REFUSAL, looksLikePan, parseInPersonTender } from '@/lib/order-payments/tender';

export const dynamic = 'force-dynamic';

const orderNumber = z.string().trim().min(1).max(120);

/**
 * GET /api/orders/payments?orderNumber=PH-000123[&refresh=1]
 * The payment rail's payload: the order's live charge (from its rows) and its
 * latest payment request. `refresh=1` first asks the provider (Square / Stripe)
 * where an open request stands (throttled) — the fallback for a missed webhook.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = orderNumber.safeParse(req.nextUrl.searchParams.get('orderNumber') ?? '');
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber is required' }, { status: 400 });
  const orgId = ctx.organizationId as OrgId;
  if (req.nextUrl.searchParams.get('refresh') === '1') {
    const current = await getOrderPaymentPanel(orgId, parsed.data);
    if (current.payment && (current.payment.status === 'pending' || current.payment.status === 'sent')) {
      await refreshOrderPayment(orgId, current.payment.id).catch((err) =>
        console.error('[order-payments] refresh failed', err instanceof Error ? err.message : err),
      );
    }
  }
  return NextResponse.json({ ok: true, ...(await getOrderPaymentPanel(orgId, parsed.data)) });
}, { permission: 'orders.view' });

const idempotencyKey = z.string().trim().min(8).max(100).optional();

const RequestBody = z.object({
  orderNumber,
  method: z.enum(['square_link', 'square_invoice', 'stripe_link']),
  idempotencyKey,
});

/** Tender facts only. Brand / entry method are closed vocabularies; last4 + reference are PAN-screened in `parseInPersonTender`. */
const InPersonBody = z.object({
  orderNumber,
  method: z.literal('in_person'),
  tender: z.enum(['card', 'cash', 'other']),
  cardBrand: z.string().max(24).nullish(),
  cardLast4: z.string().max(8).nullish(),
  entryMethod: z.string().max(16).nullish(),
  reference: z.string().max(200).nullish(),
  idempotencyKey,
});

/** Identifiers, not payment text: an Amazon order number is 17 digits and must still pass. */
const NOT_PAYMENT_TEXT: Record<string, true> = { orderNumber: true, idempotencyKey: true };

/** Any payment string in the body shaped like a card number — refused before anything else reads it. */
function carriesPan(body: unknown): boolean {
  if (typeof body === 'string') return looksLikePan(body);
  if (Array.isArray(body)) return body.some(carriesPan);
  if (body && typeof body === 'object') {
    return Object.entries(body).some(([key, v]) => !NOT_PAYMENT_TEXT[key] && carriesPan(v));
  }
  return false;
}

/**
 * POST /api/orders/payments { orderNumber, method, idempotencyKey? }
 * Create a Square payment link, a Square invoice, or a Stripe Checkout link
 * (the org's own Stripe account) for the order. The amount is computed here
 * from the order's rows; the body carries no money.
 *
 * `method: 'in_person'` records a counter payment already taken — tender
 * (card on the reader / cash / other) plus card FACTS only: brand, last 4,
 * entry method, the reader's authorization code. A body carrying anything
 * shaped like a card number is refused (400) and never echoed or logged.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => null);
  if (carriesPan(raw)) return NextResponse.json({ ok: false, error: PAN_REFUSAL }, { status: 400 });
  const orgId = ctx.organizationId as OrgId;

  if (raw && typeof raw === 'object' && 'method' in raw && raw.method === 'in_person') {
    const parsed = InPersonBody.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber and tender are required' }, { status: 400 });
    const tender = parseInPersonTender(parsed.data);
    if (!tender.ok) return NextResponse.json({ ok: false, error: tender.error }, { status: 400 });
    const result = await recordInPersonPayment(orgId, {
      orderNumber: parsed.data.orderNumber,
      tender: tender.tender,
      staffId: ctx.staffId ?? null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (!result.ok) return NextResponse.json(result, { status: 422 });
    return NextResponse.json({ ok: true, payment: result.payment, existing: result.existing });
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'orderNumber and method are required' }, { status: 400 });
  const result = await requestOrderPayment(orgId, {
    orderNumber: parsed.data.orderNumber,
    method: parsed.data.method,
    staffId: ctx.staffId ?? null,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ ok: true, payment: result.payment, existing: result.existing });
}, { permission: 'orders.create' });
