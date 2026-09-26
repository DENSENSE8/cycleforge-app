import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { validateAlias } from '@/lib/stations/command-alias-validate';

/** PATCH|DELETE /api/station-commands/aliases/[id] */

interface AliasRow {
  id: number;
  code: string;
  target_code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

function idFrom(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 1]);
}

export const PATCH = withAuth(async (request, ctx) => {
  const id = idFrom(request.nextUrl.pathname);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid alias id' }, { status: 400 });
  }

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
        `UPDATE station_command_aliases
            SET code = $1, target_code = $2, label = $3, sort_order = $4, updated_at = now()
          WHERE id = $5 AND organization_id = $6
          RETURNING id, code, target_code, label, sort_order, is_active`,
        [code, targetCode, label, sortOrder, id, ctx.organizationId],
      );
      return r.rows[0] ?? null;
    });
    if (!row) return NextResponse.json({ ok: false, error: 'alias not found' }, { status: 404 });

    await recordAudit(pool, ctx, request, {
      source: 'station-command-aliases',
      action: AUDIT_ACTION.STATION_COMMAND_ALIAS_UPDATE,
      entityType: AUDIT_ENTITY.STATION_COMMAND_ALIAS,
      entityId: id,
      method: 'manual',
      after: { code, target_code: targetCode, label },
    });
    return NextResponse.json({ ok: true, alias: row });
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { ok: false, error: `${code} already exists for this organization.` },
        { status: 409 },
      );
    }
    console.error('[PATCH /api/station-commands/aliases/[id]] error:', err);
    return NextResponse.json({ ok: false, error: 'could not update alias' }, { status: 500 });
  }
}, { permission: 'sku_stock.manage' });

export const DELETE = withAuth(async (request, ctx) => {
  const id = idFrom(request.nextUrl.pathname);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid alias id' }, { status: 400 });
  }

  const row = await withTenantTransaction(ctx.organizationId as OrgId, async (client) => {
    const r = await client.query<{ id: number; code: string }>(
      `UPDATE station_command_aliases
          SET is_active = false, updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, code`,
      [id, ctx.organizationId],
    );
    return r.rows[0] ?? null;
  });
  if (!row) return NextResponse.json({ ok: false, error: 'alias not found' }, { status: 404 });

  await recordAudit(pool, ctx, request, {
    source: 'station-command-aliases',
    action: AUDIT_ACTION.STATION_COMMAND_ALIAS_RETIRE,
    entityType: AUDIT_ENTITY.STATION_COMMAND_ALIAS,
    entityId: id,
    method: 'manual',
    before: { code: row.code, is_active: true },
    after: { is_active: false },
  });
  return NextResponse.json({ ok: true });
}, { permission: 'sku_stock.manage' });
