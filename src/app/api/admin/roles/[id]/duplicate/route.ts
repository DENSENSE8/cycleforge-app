/**
 * POST /api/admin/roles/[id]/duplicate
 *
 * Body: { key: string, label?: string }
 *
 * Copies the source role's permissions/color into a fresh non-system role
 * with a new unique key. Common workflow: tweak Packer to suit a specific
 * shift without affecting the canonical Packer role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { audit } from '@/lib/auth/audit';
import { invalidateRoleCache } from '@/lib/auth/role-store';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';

const KEY_RE = /^[a-z][a-z0-9_]{0,40}$/;

function srcIdFromUrl(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'duplicate') - 1;
  if (idx < 0) return null;
  const n = Number(parts[idx]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const srcId = srcIdFromUrl(req);
  if (!srcId) return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const key = String((body as { key?: unknown }).key ?? '').trim().toLowerCase();
  const labelRaw = (body as { label?: unknown }).label;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  // `roles` is org-scoped: the source read carries the org conjunct and the
  // duplicate is stamped with the caller's org. UNIQUE (organization_id, key)
  // makes key collisions per-org (23505 still maps to KEY_TAKEN below).
  const src = await tenantQuery(
    ctx.organizationId,
    `SELECT key, label, color, position, permissions FROM roles
      WHERE id = $1 AND organization_id = $2::uuid`,
    [srcId, ctx.organizationId],
  );
  const srcRow = src.rows[0] as { key: string; label: string; color: string; position: number; permissions: string[] } | undefined;
  if (!srcRow) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : `${srcRow.label} (copy)`;

  try {
    const r = await tenantQuery(
      ctx.organizationId,
      `INSERT INTO roles (organization_id, key, label, color, position, permissions, is_system)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::TEXT[], FALSE)
       RETURNING id, key, label, color, position, permissions, is_system, created_at, updated_at`,
      [ctx.organizationId, key, label, srcRow.color, srcRow.position + 1, srcRow.permissions],
    );
    invalidateRoleCache();
    await audit({
      staffId: ctx.staffId, sid: ctx.session?.sid ?? null,
      event: 'role.duplicated', result: 'ok',
      detail: { sourceRoleId: srcId, newRoleId: r.rows[0].id, key },
    });
    return NextResponse.json({ role: r.rows[0] });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'KEY_TAKEN' }, { status: 409 });
    }
    throw err;
  }
}, { permission: 'admin.manage_roles' });
