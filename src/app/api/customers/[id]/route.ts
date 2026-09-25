import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { updateCustomerContact } from '@/lib/neon/customer-queries';
import { CustomerContactPatchBody } from '@/lib/schemas/customers';
import { CUSTOMER_DISPLAY_COLUMNS } from '@/lib/customers/customer-display';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customers/[id]
 * Single customer (buyer contact + shipping address) for the current org.
 * Used by the order details Customer tab (e.g. Amazon MFN shipping contact).
 */
export const GET = withAuth(async (req, ctx) => {
  const id = Number(req.nextUrl.pathname.split('/').filter(Boolean).pop());
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid customer id' }, { status: 400 });
  }

  const { rows } = await tenantQuery(
    ctx.organizationId,
    `SELECT ${CUSTOMER_DISPLAY_COLUMNS.join(', ')}, channel_refs
       FROM customers
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [id, ctx.organizationId],
  );

  if (!rows[0]) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, customer: rows[0] });
}, { permission: 'orders.view' });

/**
 * PATCH /api/customers/[id] — correct a customer's contact (name, phone,
 * email) from the phone repair workbench. Body: `CustomerContactPatchBody`.
 * Writes only the columns that change; an unchanged body writes nothing and
 * returns `changed: []`.
 *
 * Every repair joined to this row shows its name · phone (`getRepairById`), so
 * a real change publishes `repair.changed` for those repairs. Permission:
 * `repair.intake` — the tier that already creates repair customers; the
 * `orders.view` reads above are read-only strings and must not gate a write.
 */
export const PATCH = withAuth(async (req, ctx) => {
  const id = Number(req.nextUrl.pathname.split('/').filter(Boolean).pop());
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid customer id' }, { status: 400 });
  }

  const parsed = CustomerContactPatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const orgId = ctx.organizationId as OrgId;
  const result = await updateCustomerContact(id, parsed.data, orgId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const changed = Object.keys(result.columns);
  if (changed.length > 0) {
    if (result.repairIds.length > 0) {
      await invalidateCacheTags(['repair-service']);
      await publishRepairChanged({ organizationId: orgId, repairIds: result.repairIds, source: 'customers.patch' });
    }
    await recordAudit(pool, ctx, req, {
      source: 'customers-api',
      action: AUDIT_ACTION.CUSTOMER_CONTACT_UPDATE,
      entityType: AUDIT_ENTITY.CUSTOMER,
      entityId: id,
      before: Object.fromEntries(changed.map((col) => [col, result.before[col as keyof typeof result.before]])),
      after: { ...result.columns },
    });
  }

  return NextResponse.json({ ok: true, id, changed, repairIds: result.repairIds });
}, { permission: 'repair.intake' });
