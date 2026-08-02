/**
 * POST /api/receiving/[id]/contents-confirm
 *
 * Stamp that a human confirmed this carton's contents against its line list
 * (`receiving_unbox.contents_confirmed_at`) — the gate for the Unbox procedure's
 * `contents` step. `{ confirmed: false }` retracts it (reopen to edit).
 *
 * PERMISSION. The plan for this route named `receiving.edit`, which does not
 * exist in `permission-registry.ts`. Rather than mint one nobody's role grants —
 * the `integrations.zendesk` failure, where an ADMIN_ONLY permission 403'd the
 * floor operator the surface was built for — it reuses the gate of its sibling
 * carton-acknowledgement route (`acknowledge-unbox`): anyone who can finish a
 * carton can say they read its line list.
 *
 * AUDIT. The stamp is clearable, so a reopen leaves no trace in the column.
 * `audit_logs` is therefore the only place the original claim survives, and
 * confirm/reopen are two distinct actions so a rollup cannot count a retraction
 * as a confirmation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { confirmContents } from '@/lib/receiving/confirm-contents';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid receiving id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirmed?: unknown };
    if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') {
      return NextResponse.json({ success: false, error: 'confirmed must be a boolean' }, { status: 400 });
    }
    const confirmed = body.confirmed !== false;

    await withTenantTransaction(ctx.organizationId, (client) =>
      confirmContents(client, {
        orgId: ctx.organizationId,
        receivingId,
        staffId: ctx.staffId ?? null,
        confirmed,
      }),
    );

    await recordAudit(pool, ctx, request, {
      source: 'receiving.contents-confirm',
      action: confirmed
        ? AUDIT_ACTION.RECEIVING_CONTENTS_CONFIRMED
        : AUDIT_ACTION.RECEIVING_CONTENTS_REOPENED,
      entityType: AUDIT_ENTITY.RECEIVING,
      entityId: receivingId,
      after: { contents_confirmed: confirmed },
      method: 'manual',
    });

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.contents-confirm',
        });
      } catch (err) {
        console.warn('contents-confirm: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true, confirmed });
  },
  { permission: 'receiving.mark_received' },
);
