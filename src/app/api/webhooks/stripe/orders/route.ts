/**
 * POST /api/webhooks/stripe/orders — Stripe Checkout outcomes for ORDER
 * payments (`stripe_link`), sent by each tenant's OWN Stripe account.
 *
 * Not the platform billing webhook (/api/billing/webhook, env secret). Here
 * the event names its org in our session metadata; that claim is untrusted
 * until the signature verifies with THAT org's vault webhook secret. Only
 * then is the event applied, and only to a row in that org with that session.
 *
 * Idempotent by row state (a settled row does not move again), so Stripe's
 * at-least-once redelivery is harmless. Handler errors return 500 so Stripe
 * retries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/billing/stripe';
import { stripeEventOrgId } from '@/lib/order-payments/model';
import { applyStripePaymentWebhook } from '@/lib/order-payments/service';
import { resolveOrderStripeCredentials } from '@/lib/order-payments/stripe';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  let event: { id?: string; type?: string };
  try {
    event = JSON.parse(rawBody) as { id?: string; type?: string };
  } catch {
    return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 });
  }

  // Not one of our order checkout sessions (the tenant's account sends other events too): nothing to verify against.
  const claimedOrg = stripeEventOrgId(event);
  if (!claimedOrg) return NextResponse.json({ received: true, ignored: 'not an order payment' });
  const orgId = claimedOrg as OrgId;

  const creds = await resolveOrderStripeCredentials(orgId);
  if (!verifyStripeSignature({ rawBody, signatureHeader: req.headers.get('stripe-signature'), secret: creds?.webhookSecret?.trim() ?? '' })) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  try {
    const result = await applyStripePaymentWebhook(event, orgId);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    console.error('[webhooks/stripe/orders] apply failed', event.id, event.type, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'HANDLER_FAILED' }, { status: 500 });
  }
}
