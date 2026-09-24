import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { scheduleAfterResponse } from '@/lib/next/schedule-after-response';
import { publishRepairChanged, publishStockLedgerEvent } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';
import { RepairActionCreateBody } from '@/lib/schemas/repair-actions';
import {
  createRepairAction,
  listRepairActions,
  REPAIR_LEDGER_REASON,
} from '@/lib/repair/repair-action-queries';
import { postRepairActionToTicket } from '@/lib/repair/repair-action-ticket-post';
import { readRepairTicketLink } from '@/lib/repair/ticket-link';

/**
 * GET /api/repair/actions?repairId={id}
 *
 * Newest-first bench log for a repair (soft-deleted rows excluded), with the
 * author's name, session link, and donor/component facts.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const repairId = Number(req.nextUrl.searchParams.get('repairId'));
    if (!Number.isFinite(repairId) || repairId <= 0) {
      return NextResponse.json({ error: 'repairId is required' }, { status: 400 });
    }

    try {
      const actions = await listRepairActions(ctx.organizationId, repairId);
      return NextResponse.json({ actions });
    } catch (error: unknown) {
      console.error('GET /api/repair/actions error:', error);
      return NextResponse.json(
        { error: 'Failed to load repair actions', details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  },
  { permission: 'repair.view' },
);

/**
 * POST /api/repair/actions
 *
 * Body (`RepairActionCreateBody`): { repairId, actionType, partName?, oldSku?,
 * newSku?, oldSerial?, newSerial?, durationMin?, notes?, sessionId?,
 * donorSource?, donorRef?, componentRef?, componentValue?, componentQty?,
 * consumeStock?, stockLocationId? }
 *
 * staff_id, organization_id and created_at come from the session / server —
 * never the body. Taking the part from stock needs the bin (`stockLocationId`)
 * and is refused with 409 when that bin holds less than the take.
 *
 * On a repair whose helpdesk link is `linked`, the entry is queued
 * (`ticket_post_status = 'pending'`) and posted to the ticket as a note after
 * the response — a helpdesk failure is recorded on the entry, never on the save.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(RepairActionCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    try {
      const link = await readRepairTicketLink(ctx.organizationId, parsed.repairId);
      const ticketId = link?.state === 'linked' ? link.zendeskTicketId : null;
      const result = await createRepairAction(ctx.organizationId, ctx.staffId, parsed, ticketId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      if (result.action.ticket_post_status === 'pending') {
        const actionId = result.action.id;
        const orgId = ctx.organizationId;
        scheduleAfterResponse(async () => {
          await postRepairActionToTicket(orgId, actionId);
        });
      }

      await invalidateCacheTags(['repair-service']);
      await publishRepairChanged({
        organizationId: ctx.organizationId,
        repairIds: [parsed.repairId],
        source: 'repair.action-logged',
      });
      const { stock_ledger_id: ledgerId, new_sku: sku, stock_qty: takenQty } = result.action;
      if (ledgerId != null && sku) {
        await publishStockLedgerEvent({
          organizationId: ctx.organizationId,
          ledgerId,
          sku,
          delta: -(takenQty ?? 1),
          reason: REPAIR_LEDGER_REASON.installed,
          dimension: 'WAREHOUSE',
          staffId: ctx.staffId,
          source: 'repair.action-logged',
        });
      }

      return NextResponse.json({ success: true, action: result.action });
    } catch (error: unknown) {
      console.error('POST /api/repair/actions error:', error);
      return NextResponse.json(
        { error: 'Failed to log repair action', details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  },
  { permission: 'repair.mark_repaired' },
);
