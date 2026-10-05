/**
 * `GET /api/support/items/[id]` — the Support record bundle (local only).
 * `PATCH /api/support/items/[id]` — purpose acknowledgement | next step | snooze / reopen.
 */

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { logger } from '@/lib/observability/logger';
import { parseBody } from '@/lib/schemas/parse';
import { SupportItemPatchSchema } from '@/lib/schemas/support-items';
import { readSupportItemBundle, supportItemNeedsMirrorBackfill } from '@/lib/support/conversation/bundle';
import {
  setSupportLifecycle,
  setSupportNextStep,
  setSupportPurpose,
  supportItemActionDeps,
} from '@/lib/support/conversation/item-actions';
import { syncSupportThreadFromMirror } from '@/lib/support/conversation/mirror-bridge';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function itemIdOf(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.view');
    if (gate.denied) return gate.denied;
    const id = itemIdOf((await params).id);
    if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const orgId = gate.ctx.organizationId;

    // A Zendesk item mirrored before the loop existed: fold its LOCAL comments
    // into the thread once (backfill — no alerts, drafts, tasks or reopen).
    if (await supportItemNeedsMirrorBackfill(orgId, id)) {
      await syncSupportThreadFromMirror(orgId, id, { mode: 'backfill' }).catch((error: unknown) =>
        logger.warn({ supportItemId: id, error: String(error) }, 'support mirror backfill failed'),
      );
    }
    const bundle = await readSupportItemBundle(orgId, id);
    if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(bundle);
  } catch (error) {
    return errorResponse(error, 'GET /api/support/items/[id]');
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;
    const id = itemIdOf((await params).id);
    if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const parsed = parseBody(SupportItemPatchSchema, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const { organizationId: orgId, staffId } = gate.ctx;
    const deps = { ...supportItemActionDeps, runAfterCommit: (work: () => Promise<void>) => after(work) };

    let action: string;
    let auditAfter: Record<string, unknown>;
    let auditBefore: Record<string, unknown> | null = null;
    if ('purpose' in parsed) {
      const r = await setSupportPurpose({ orgId, supportItemId: id, staffId, purpose: parsed.purpose }, deps);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      if (r.idempotent) return NextResponse.json({ ok: true, idempotent: true, item: (await readSupportItemBundle(orgId, id))?.item ?? null });
      action = AUDIT_ACTION.SUPPORT_ITEM_PURPOSE;
      auditBefore = { purpose: r.before };
      auditAfter = { purpose: r.after, staledDrafts: r.staledDrafts, draftId: r.draftId };
    } else if ('nextStep' in parsed) {
      const step = { kind: parsed.nextStep, nextFollowUpAt: parsed.nextFollowUpAt ?? null };
      const r = await setSupportNextStep({ orgId, supportItemId: id, staffId, step }, deps);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      action = AUDIT_ACTION.SUPPORT_ITEM_NEXT_STEP;
      auditAfter = step;
    } else {
      const snoozedUntil = parsed.lifecycle === 'snoozed' ? parsed.snoozedUntil : null;
      const r = await setSupportLifecycle({ orgId, supportItemId: id, staffId, lifecycle: parsed.lifecycle, snoozedUntil }, deps);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      action = AUDIT_ACTION.SUPPORT_ITEM_LIFECYCLE;
      auditAfter = { lifecycle: parsed.lifecycle, snoozedUntil };
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'support-api',
      action,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET,
      entityId: id,
      before: auditBefore,
      after: auditAfter,
    });
    const bundle = await readSupportItemBundle(orgId, id);
    return NextResponse.json({ ok: true, item: bundle?.item ?? null });
  } catch (error) {
    return errorResponse(error, 'PATCH /api/support/items/[id]');
  }
}
