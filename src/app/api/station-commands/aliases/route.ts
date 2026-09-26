import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { validateAlias } from '@/lib/stations/command-alias-validate';

/** GET|POST /api/station-commands/aliases */

interface AliasRow {
  id: number;
  code: string;
  target_code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export const GET = withAuth(async (_request, ctx) => {
  const { rows } = await tenantQuery<AliasRow>(
    ctx.organizationId as OrgId,
    `SELECT id, code, target_code, label, sort_order, is_active
       FROM station_command_aliases
      WHERE organization_id = $1 AND is_active = true
      ORDER BY sort_order, code`,
    [ctx.organizationId],
  );
  return NextResponse.json({ ok: true, aliases: rows });
}, { permission: 'receiving.view' });

export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));

  const validated = validateAlias({
    code: String(body?.code ?? ''),
    targetCode: String(body?.targetCode ?? ''),
    label: String(body?.label ?? ''),
  });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  const { code, targetCode, label } = validated.value;
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 100;

  try {
    const row = await withTenantTransaction(ctx.organizationId as OrgId, async (client) => {
      const r = await client.query<AliasRow>(
        `INSERT INTO station_command_aliases
           (organization_id, code, target_code, label, sort_order, created_by_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, code, target_code, label, sort_order, is_active`,
        [ctx.organizationId, code, targetCode, label, sortOrder, ctx.staffId ?? null],
      );
      return r.rows[0];
    });

    await recordAudit(pool, ctx, request, {
      source: 'station-command-aliases',
      action: AUDIT_ACTION.STATION_COMMAND_ALIAS_CREATE,
      entityType: AUDIT_ENTITY.STATION_COMMAND_ALIAS,
      entityId: row.id,
      method: 'manual',
      after: { code, target_code: targetCode, label },
    });

    return NextResponse.json({ ok: true, alias: row }, { status: 201 });
  } catch (err) {
    // ux_station_command_aliases_org_code — one meaning per scanned string. A
    // duplicate is a user error with an obvious fix, not a server fault.
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { ok: false, error: `${code} already exists for this organization.` },
        { status: 409 },
      );
    }
    console.error('[POST /api/station-commands/aliases] error:', err);
    return NextResponse.json({ ok: false, error: 'could not create alias' }, { status: 500 });
  }
}, { permission: 'sku_stock.manage' });
