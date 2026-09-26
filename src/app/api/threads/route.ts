import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadCreateBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { getOrCreateThread, resolveThreadForEntity } from '@/lib/threads/threads';
import { isSurfaceEntityType, type SurfaceEntityType } from '@/lib/surfaces/registry';
import pool from '@/lib/db';

/**
 * GET /api/threads?entityType&entityId — resolve the entity's thread (or
 * `thread: null` when none exists yet; the panel shows a teaching empty).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entityType') ?? '';
  const entityId = Number(searchParams.get('entityId'));
  if (!isSurfaceEntityType(entityType) || !Number.isFinite(entityId) || entityId <= 0) {
    return NextResponse.json(
      { success: false, error: 'entityType and a positive entityId are required' },
      { status: 400 },
    );
  }

  const thread = await resolveThreadForEntity({
    orgId: ctx.organizationId,
    entityType,
    entityId,
  });

  return NextResponse.json({ success: true, thread });
}, { permission: 'support.thread.view' });

/**
 * POST /api/threads — get-or-create the entity's thread (idempotent on the
 * natural key: one thread per (org, entityType, entityId) in v1).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(ThreadCreateBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const result = await getOrCreateThread({
    orgId: ctx.organizationId,
    entityType: parsed.entityType as SurfaceEntityType,
    entityId: parsed.entityId,
    createdBy: ctx.staffId ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }

  if (result.created) {
    await recordAudit(pool, ctx, req, {
      source: 'threads-api',
      action: AUDIT_ACTION.THREAD_CREATE,
      entityType: AUDIT_ENTITY.ENTITY_THREAD,
      entityId: result.thread.id,
      after: { entityType: result.thread.entityType, entityId: result.thread.entityId },
    });
  }

  return NextResponse.json(
    { success: true, thread: result.thread, created: result.created },
    { status: result.created ? 201 : 200 },
  );
}, { permission: 'support.thread.manage' });
