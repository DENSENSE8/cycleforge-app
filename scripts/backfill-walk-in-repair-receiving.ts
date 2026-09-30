/**
 * Land a receiving record for every existing drop-off repair ticket that has
 * none — the same `receiveWalkInRepairInTx` a new walk-in runs, one ticket per
 * transaction, ledger origin 'backfill'. Idempotent: a linked ticket is skipped
 * and a re-run lands nothing new.
 *
 * Needs migration 2026-09-29h (repair_service.receiving_line_id). Tickets whose
 * intake_channel is still NULL are reported, not landed — the channel backfill
 * stamps them first.
 *
 * Dry-run by default (prints what it would create, writes nothing):
 *   tsx --conditions=react-server scripts/backfill-walk-in-repair-receiving.ts
 *   tsx --conditions=react-server scripts/backfill-walk-in-repair-receiving.ts --apply
 *   … --org=<uuid>   (default: the dogfood org)
 */
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { TxClient } from '@/lib/inbound/purchase-links';
import { receiveWalkInRepairInTx, walkInRepairOrderNumber } from '@/lib/repair/walk-in-receiving';

interface Candidate {
  id: number;
  ticket_number: string | null;
  product_title: string | null;
  status: string | null;
  intake_channel: string | null;
  received_on: string | null;
  /** A repair receiving line already carries this ticket's order # (shipped path). */
  order_line_id: number | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const orgArg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);
  const orgId = (orgArg || DOGFOOD_ORG_ID) as OrgId;

  const column = await tenantQuery<{ n: number }>(
    orgId,
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'repair_service' AND column_name = 'receiving_line_id'`,
  );
  const linkColumn = Number(column.rows[0]?.n ?? 0) > 0;
  if (apply && !linkColumn) {
    throw new Error('repair_service.receiving_line_id is missing — apply migration 2026-09-29h first');
  }

  const candidates = await tenantQuery<Candidate>(
    orgId,
    `SELECT rs.id, rs.ticket_number, rs.product_title, rs.status, rs.intake_channel,
            to_char(COALESCE(rs.received_at, rs.created_at) AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS received_on,
            (SELECT rl.id FROM receiving_line rl
              WHERE rl.organization_id = rs.organization_id
                AND rl.is_repair_service
                AND NULLIF(btrim(rs.source_order_id), '') IS NOT NULL
                AND rl.source_order_id = rs.source_order_id
              ORDER BY rl.id LIMIT 1) AS order_line_id
       FROM repair_service rs
      WHERE rs.organization_id = $1
        AND (rs.intake_channel = 'pickup' OR rs.intake_channel IS NULL)
        ${linkColumn ? 'AND rs.receiving_line_id IS NULL' : ''}
      ORDER BY rs.id`,
    [orgId],
  );

  const ready = candidates.rows.filter((c) => c.intake_channel === 'pickup' && c.order_line_id == null);
  const awaitingChannel = candidates.rows.filter((c) => c.intake_channel == null);
  const onOrderLine = candidates.rows.filter((c) => c.intake_channel === 'pickup' && c.order_line_id != null);

  const landed: Array<{ repairId: number; receivingId: number | null; receivingLineId: number; created: boolean }> = [];
  const failed: Array<{ repairId: number; error: string }> = [];
  if (apply) {
    for (const c of ready) {
      try {
        const receipt = await withTenantTransaction(orgId, (client) =>
          receiveWalkInRepairInTx(
            client as unknown as TxClient,
            orgId,
            { id: Number(c.id), productTitle: c.product_title ?? '', receivedOn: c.received_on },
            { staffId: null, origin: 'backfill' },
          ),
        );
        landed.push({ repairId: Number(c.id), ...receipt });
      } catch (err) {
        failed.push({ repairId: Number(c.id), error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const byStatus: Record<string, number> = {};
  for (const c of ready) byStatus[c.status ?? '(none)'] = (byStatus[c.status ?? '(none)'] ?? 0) + 1;
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        orgId,
        linkColumn: linkColumn ? 'present' : 'missing (migration 2026-09-29h not applied — every drop-off counts as unlinked)',
        wouldLand: ready.length,
        wouldLandByStatus: byStatus,
        awaitingChannelBackfill: awaitingChannel.length,
        skippedAlreadyOnOrderLine: onOrderLine.map((c) => ({ repairId: Number(c.id), receivingLineId: Number(c.order_line_id) })),
        samples: ready.slice(0, 8).map((c) => ({
          repairId: Number(c.id),
          ticket: c.ticket_number,
          inboundOrder: `REPAIR ${walkInRepairOrderNumber(Number(c.id))}`,
          line: c.product_title?.trim() || `Repair ${walkInRepairOrderNumber(Number(c.id))}`,
          arrived: c.received_on,
        })),
        ...(apply ? { landed: landed.length, created: landed.filter((l) => l.created).length, failed } : {}),
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 50).unref());
