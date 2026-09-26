import { NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseScannedUrl } from '@/lib/scan-resolver';
import { guard, transition, SERIAL_STATES, type SerialState } from '@/lib/inventory/state-machine';

/** POST /api/returns/undo — reverse a returns-intake mistake. */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));
  const scan = String(body?.scan ?? '').trim();
  const serialUnitIdRaw = Number(body?.serial_unit_id);
  const serialUnitId = Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0 ? Math.floor(serialUnitIdRaw) : null;
  let resolvedSerial = String(body?.serial_number || '').trim() || null;
  if (scan && !resolvedSerial) {
    const url = parseScannedUrl(scan);
    resolvedSerial = url && url.type === 'unit' ? url.unitSerial.toUpperCase() : scan.toUpperCase();
  }
  const clientEventId = String(body?.client_event_id || '').trim() || null;
  const reason = String(body?.reason || '').trim() || 'returns intake undo (not a return)';
  const actorStaffId: number | null = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const orgId = ctx.organizationId;

  if (!serialUnitId && !resolvedSerial) {
    return NextResponse.json({ ok: false, error: 'serial_unit_id, serial_number, or scan is required' }, { status: 400 });
  }

  const result = await withTenantTransaction(orgId, async (client) => {
    const uq = serialUnitId
      ? await client.query<{ id: number; sku: string | null; current_status: string }>(
          `SELECT id, sku, current_status::text AS current_status FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
          [serialUnitId, orgId],
        )
      : await client.query<{ id: number; sku: string | null; current_status: string }>(
          `SELECT id, sku, current_status::text AS current_status FROM serial_units WHERE normalized_serial = UPPER(TRIM($1)) AND organization_id = $2 LIMIT 1 FOR UPDATE`,
          [resolvedSerial, orgId],
        );
    const unit = uq.rows[0];
    if (!unit) return { ok: false as const, status: 404, error: 'serial_units row not found' };
    if (unit.current_status !== 'RETURNED') {
      return { ok: false as const, status: 409, error: `unit is ${unit.current_status}, not RETURNED — nothing to undo` };
    }

    // Pre-return status is recorded on the most recent RETURNED event.
    const evQ = await client.query<{ prev_status: string | null }>(
      `SELECT prev_status::text AS prev_status FROM inventory_events
          WHERE serial_unit_id = $1 AND event_type = 'RETURNED' AND organization_id = $2
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [unit.id, orgId],
    );
    const priorStatusRaw = evQ.rows[0]?.prev_status ?? 'SHIPPED';
    if (!(SERIAL_STATES as readonly string[]).includes(priorStatusRaw)) {
      return { ok: false as const, status: 409, error: `recorded pre-return status ${priorStatusRaw} is not a known serial state` };
    }
    const priorStatus = priorStatusRaw as SerialState;
    // Pre-flight the restore edge BEFORE the allocation/ledger writes so a guard rejection returns a clean 409 with nothing committed (the txn…
    const guarded = guard('RETURNED', priorStatus);
    if (!guarded.ok) {
      return { ok: false as const, status: 409, error: guarded.reason };
    }

    // Reopen the allocation the intake flipped to RETURNED.
    const reopen = await client.query(
      `UPDATE order_unit_allocations
            SET state = 'SHIPPED', returned_at = NULL, returned_reason = NULL
          WHERE serial_unit_id = $1 AND state = 'RETURNED' AND organization_id = $2`,
      [unit.id, orgId],
    );
    const allocationReopened = (reopen.rowCount ?? 0) > 0;

    // Compensating -1 ledger to undo the +1 RETURN_CUSTOMER (trigger reprojects).
    let ledgerId: number | null = null;
    if (unit.sku) {
      const lq = await client.query<{ id: number }>(
        `INSERT INTO sku_stock_ledger (sku, delta, reason, dimension, staff_id, ref_serial_unit_id, notes, organization_id)
           VALUES ($1, -1, 'ADJUSTMENT', 'WAREHOUSE', $2, $3, $4, $5) RETURNING id`,
        [unit.sku, actorStaffId, unit.id, reason, orgId],
      );
      ledgerId = lq.rows[0]?.id ?? null;
    }

    // Restore the unit's pre-return status through the guarded state machine.
    const tr = await transition({
      unitId: unit.id,
      to: priorStatus,
      eventType: 'ADJUSTED',
      actorStaffId,
      station: 'RECEIVING',
      clientEventId: clientEventId ? `${clientEventId}:return-undo` : null,
      expectedFrom: 'RETURNED',
      stockLedgerId: ledgerId,
      binId: null, // legacy undo event carried no bin linkage — keep it that way
      notes: reason,
      payload: { source: 'returns.undo', restored_to: priorStatus, allocation_reopened: allocationReopened },
    }, client, orgId);
    if (!tr.ok) {
      // Unreachable in practice (guard pre-flighted + FOR UPDATE lock held in
      // this txn). Throw so the ledger/allocation writes roll back rather than
      // committing half an undo.
      throw new Error(`returns undo transition failed: ${tr.error}`);
    }

    return {
      ok: true as const,
      unitId: unit.id,
      restoredTo: priorStatus,
      allocationReopened,
      ledgerId,
      inventoryEventId: tr.eventId,
    };
  });

  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}, { permission: 'receiving.mark_received' });
