/** `POST /api/support/items/[id]/resolve` — guarded resolve: 409 with blockers unless nothing is outstanding or override + reason. */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportResolveSchema } from '@/lib/schemas/support-items';
import { readSupportItemBundle } from '@/lib/support/conversation/bundle';
import { resolveSupportItem } from '@/lib/support/conversation/resolve';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const parsed = parseBody(SupportResolveSchema, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const { organizationId: orgId, staffId } = gate.ctx;

    const r = await resolveSupportItem({
      orgId,
      supportItemId: id,
      staffId,
      reason: parsed.reason ?? null,
      override: parsed.override === true,
      checkInDisposition: parsed.checkInDisposition ?? null,
    });
    if (!r.ok) {
      return NextResponse.json(
        r.status === 409 ? { error: r.error, blockers: r.blockers } : { error: r.error },
        { status: r.status },
      );
    }
    if (!r.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'support-api',
        action: r.override ? AUDIT_ACTION.SUPPORT_ITEM_RESOLVE_OVERRIDE : AUDIT_ACTION.SUPPORT_ITEM_RESOLVE,
        entityType: AUDIT_ENTITY.SUPPORT_TICKET,
        entityId: id,
        ...(r.override ? { reasonCode: 'SUPPORT_RESOLVE_OVERRIDE' } : {}),
        note: parsed.reason ?? null,
        after: { blockers: r.blockers, override: r.override, checkInDisposition: parsed.checkInDisposition ?? null },
      });
    }
    const bundle = await readSupportItemBundle(orgId, id);
    return NextResponse.json({ ok: true, idempotent: r.idempotent, item: bundle?.item ?? null });
  } catch (error) {
    return errorResponse(error, 'POST /api/support/items/[id]/resolve');
  }
}
