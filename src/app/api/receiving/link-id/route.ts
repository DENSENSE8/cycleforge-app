import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import { ReceivingLinkIdBody } from '@/lib/schemas/receiving-link-id';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { linkCartonIdentifier } from '@/lib/receiving/link-carton-identifier';

/**
 * POST /api/receiving/link-id — the Unbox "Link Id" chokepoint.
 *
 * One identifier in, one honest outcome out:
 *   • `linked`  — it resolved to a local purchase order; that order's SKUs and
 *                 items were adopted/imported onto the carton.
 *   • `pending` — nothing matches yet. The id is recorded on the carton, which
 *                 STAYS unmatched, and the import that eventually brings the
 *                 order in claims it (link-pending-identifier.ts).
 *
 * Everything transactional lives in the Deps-injected domain helper. House
 * skeleton: withAuth(permission) → Zod validate → domain helper → map status →
 * recordAudit → after() cache/realtime.
 *
 * Body: { receiving_id: number, line_id?: number, identifier: string }
 */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(ReceivingLinkIdBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const result = await linkCartonIdentifier(ctx.organizationId, {
    receivingId: parsed.receiving_id,
    lineId: parsed.line_id ?? null,
    identifier: parsed.identifier,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error ?? 'Link failed' },
      { status: result.status },
    );
  }

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (err) {
      console.warn('[receiving.link-id.after] cache invalidation failed', err);
    }
    try {
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(result.receivingId),
        source: 'receiving.link-id',
      });
    } catch (err) {
      console.error('[receiving.link-id.after] realtime publish failed', err);
    }
  });

  return NextResponse.json({
    success: true,
    outcome: result.outcome,
    receiving_id: result.receivingId,
    identifier: result.identifier,
    zoho_purchaseorder_id: result.poId ?? null,
    zoho_purchaseorder_number: result.poNumber ?? null,
    lines_imported: result.linesImported,
    ...(result.pairedOnto != null ? { paired_onto: result.pairedOnto } : {}),
  });
}, {
  permission: 'receiving.mark_received',
  audit: {
    source: 'receiving.link-id',
    action: AUDIT_ACTION.RECEIVING_IDENTIFIER_LINKED,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: ({ response }) => {
      const r = response as { receiving_id?: number } | null;
      return r?.receiving_id ?? null;
    },
    extra: ({ response }) => {
      const r = response as {
        outcome?: string;
        identifier?: string;
        zoho_purchaseorder_id?: string | null;
        zoho_purchaseorder_number?: string | null;
        lines_imported?: number;
        paired_onto?: number;
      } | null;
      return {
        outcome: r?.outcome ?? null,
        identifier: r?.identifier ?? null,
        zoho_purchaseorder_id: r?.zoho_purchaseorder_id ?? null,
        zoho_purchaseorder_number: r?.zoho_purchaseorder_number ?? null,
        lines_imported: r?.lines_imported ?? 0,
        paired_onto: r?.paired_onto ?? null,
      };
    },
  },
});
