import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { customerInvoiceEmail } from '@/lib/customers/customer-invoice-email';
import { listCustomerOrderHistory } from '@/lib/customers/customer-throughput-query';
import { sendEmail } from '@/lib/email/send';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

const Body = z.object({ primaryOrderId: z.number().int().positive() }).strict();

/** POST — explicitly email one recorded purchase invoice to this customer. */
export const POST = withAuth(async (req, ctx) => {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const customerId = Number(parts.at(-2));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid customer' }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Choose an order' }, { status: 400 });

  const orgId = ctx.organizationId as OrgId;
  const customerResult = await tenantQuery<{ name: string | null; email: string | null }>(
    orgId,
    `SELECT COALESCE(NULLIF(BTRIM(display_name), ''), NULLIF(BTRIM(customer_name), ''), NULLIF(BTRIM(CONCAT_WS(' ', first_name, last_name)), '')) AS name,
            NULLIF(BTRIM(email), '') AS email
       FROM customers
      WHERE organization_id = $1 AND id = $2
      LIMIT 1`,
    [orgId, customerId],
  );
  const customer = customerResult.rows[0];
  if (!customer) return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 });
  if (!customer.email) return NextResponse.json({ ok: false, error: 'Add an email address before sending an invoice' }, { status: 422 });

  const orders = await listCustomerOrderHistory(orgId, customerId);
  const order = orders.find((entry) => entry.primaryOrderId === parsed.data.primaryOrderId);
  if (!order) return NextResponse.json({ ok: false, error: 'That order is not linked to this customer' }, { status: 404 });

  const message = customerInvoiceEmail({ customerName: customer.name || 'there', order });
  const sent = await sendEmail({ to: customer.email, ...message });
  if (!sent.ok) return NextResponse.json({ ok: false, error: sent.error || 'Could not send the invoice' }, { status: 502 });

  const delivery = sent.id === 'stub' ? 'preview' : 'sent';
  await recordAudit(pool, ctx, req, {
    source: 'customers-api',
    action: AUDIT_ACTION.CUSTOMER_INVOICE_EMAIL_SENT,
    entityType: AUDIT_ENTITY.CUSTOMER,
    entityId: customerId,
    before: null,
    after: { orderRef: order.orderRef, delivery },
  });
  return NextResponse.json({ ok: true, delivery });
}, { permission: 'orders.create' });
