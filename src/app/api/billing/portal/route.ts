/** POST /api/billing/portal */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization } from '@/lib/tenancy';
import { createBillingPortalSession } from '@/lib/billing/stripe';

export const POST = withAuth(async (_req, ctx) => {
  const org = await getOrganization(ctx.organizationId);
  if (!org) return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });
  if (!org.stripeCustomerId) {
    return NextResponse.json({ error: 'NO_BILLING_CUSTOMER' }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const session = await createBillingPortalSession({
      customerId: org.stripeCustomerId,
      returnUrl: `${origin}/settings/billing`,
      orgId: org.id,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: 'STRIPE_ERROR', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}, { permission: 'admin.view' });
