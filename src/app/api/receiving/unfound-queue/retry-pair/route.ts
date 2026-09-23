import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { reconcileUnmatchedReceiving } from '@/lib/receiving/reconcile-unmatched';

/**
 * POST /api/receiving/unfound-queue/retry-pair — on-demand pairing retry
 * (docs/receiving-triage-redesign-plan.md §7 Q4, resolved: on-demand button
 * over a background poll — `reconcileUnmatchedReceiving` already existed as a
 * pure re-run of lookup-po's Zoho tracking search, but had no live trigger
 * anywhere in the app until this route). The Unfound strip's "Retry pair"
 * action calls this to re-check Zoho right now instead of waiting for the
 * carton's next cron tick.
 *
 * Body: { receiving_id }
 *
 * The reconciliation helper scopes both the carton and Zoho credentials to
 * the authenticated organization.
 */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => null);
  const receivingId = Number((body as { receiving_id?: unknown })?.receiving_id);
  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return NextResponse.json(
      { success: false, error: 'receiving_id is required' },
      { status: 400 },
    );
  }

  const result = await reconcileUnmatchedReceiving(receivingId, ctx.organizationId);

  if (result.code === 'ZOHO_RATE_LIMITED') {
    return NextResponse.json(
      {
        success: false,
        promoted: false,
        receiving_id: result.receivingId,
        reason: result.reason ?? null,
        code: result.code,
        error:
          result.error ||
          'Zoho rate limit reached — try again after the daily cap resets',
        zoho_purchaseorder_id: null,
        lines_imported: 0,
      },
      { status: 429 },
    );
  }

  return NextResponse.json({
    success: true,
    receiving_id: result.receivingId,
    promoted: result.promoted,
    reason: result.reason ?? null,
    code: result.code ?? null,
    error: result.error ?? null,
    zoho_purchaseorder_id: result.zohoPurchaseorderId ?? null,
    lines_imported: result.linesImported ?? 0,
  });
}, {
  permission: 'receiving.scan_po',
  audit: {
    source: 'receiving.retry_pair',
    action: AUDIT_ACTION.RECEIVING_RETRY_PAIR,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: ({ response }) => {
      const r = response as { receiving_id?: number } | null;
      return r?.receiving_id ?? null;
    },
    extra: ({ response }) => {
      const r = response as {
        promoted?: boolean;
        reason?: string | null;
        code?: string | null;
      } | null;
      return {
        promoted: r?.promoted ?? false,
        reason: r?.reason ?? null,
        code: r?.code ?? null,
      };
    },
  },
});
