import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { createCustomer } from '@/lib/neon/customer-queries';
import { CustomerCreateBody } from '@/lib/schemas/customers';
import { listCustomerDirectory } from '@/lib/customers/customer-throughput-query';

export const dynamic = 'force-dynamic';

/** GET /api/customers — recent customer book, optionally filtered by contact identity. */
export const GET = withAuth(async (req, ctx) => {
  const query = req.nextUrl.searchParams.get('q') ?? '';
  const limit = Number(req.nextUrl.searchParams.get('limit'));
  const customers = await listCustomerDirectory(ctx.organizationId as OrgId, { query, limit });
  return NextResponse.json({ ok: true, customers });
}, { permission: 'orders.view' });

/** POST /api/customers — create a customer typed on the phone (manual phone order), in the caller's org. */
export const POST = withAuth(async (req, ctx) => {
  const parsed = CustomerCreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createCustomer(ctx.organizationId as OrgId, parsed.data);
  await recordAudit(pool, ctx, req, {
    source: 'customers-api',
    action: AUDIT_ACTION.CUSTOMER_CREATE,
    entityType: AUDIT_ENTITY.CUSTOMER,
    entityId: created.id,
    before: null,
    after: { name: parsed.data.name, hasPhone: Boolean(parsed.data.phone), hasEmail: Boolean(parsed.data.email) },
  });
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}, { permission: 'orders.create' });
