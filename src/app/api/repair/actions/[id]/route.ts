import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged, publishStockLedgerEvent } from '@/lib/realtime/publish';
import { tenantQuery } from '@/lib/tenancy/db';
import { REPAIR_DONOR_SOURCES } from '@/lib/repair/repair-actions';
import {
  loadRepairActionForMutation,
  REPAIR_LEDGER_REASON,
  softDeleteRepairAction,
  type RepairActionOwnerRow,
} from '@/lib/repair/repair-action-queries';
import { REPAIR_ACTION_TYPES } from '@/lib/schemas/repair-actions';

function normString(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function normInt(v: unknown): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function canMutate(action: RepairActionOwnerRow, ctxStaffId: number, ctxRole: string | null | undefined): boolean {
  if (ctxRole === 'admin') return true;
  return action.staff_id === ctxStaffId;
}

/** Fields that decide what came off the shelf — frozen once the ledger was written. */
const STOCK_BOUND_FIELDS = ['actionType', 'newSku', 'donorSource'] as const;

/** PATCH /api/repair/actions/[id] */
export const PATCH = withAuth(
  async (req, ctx) => {
    const orgId = ctx.organizationId;
    // withAuth doesn't forward Next's route ctx; parse the id from the URL.
    const idRaw = req.nextUrl.pathname.split('/').pop() ?? '';
    const id = Number(decodeURIComponent(idRaw));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
    }

    const existing = await loadRepairActionForMutation(orgId, id);
    if (!existing) return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    if (!canMutate(existing, ctx.staffId, ctx.role)) {
      return NextResponse.json({ error: 'Not allowed to edit this action' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (existing.stock_ledger_id != null && STOCK_BOUND_FIELDS.some((f) => body[f] !== undefined)) {
      return NextResponse.json(
        { error: 'This part was taken from stock — delete the entry and log it again to change it.' },
        { status: 409 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.actionType !== undefined) {
      const at = String(body.actionType).trim().toLowerCase();
      if (!(REPAIR_ACTION_TYPES as readonly string[]).includes(at)) {
        return NextResponse.json({ error: `Invalid actionType` }, { status: 400 });
      }
      updates.action_type = at;
    }
    if (body.donorSource !== undefined) {
      const ds = normString(body.donorSource);
      if (ds !== null && !(REPAIR_DONOR_SOURCES as readonly string[]).includes(ds)) {
        return NextResponse.json({ error: 'Invalid donorSource' }, { status: 400 });
      }
      updates.donor_source = ds;
    }

    const stringFields: Record<string, string> = {
      partName: 'part_name',
      oldSku: 'old_sku',
      newSku: 'new_sku',
      oldSerial: 'old_serial',
      newSerial: 'new_serial',
      notes: 'notes',
      donorRef: 'donor_ref',
      componentRef: 'component_ref',
      componentValue: 'component_value',
    };
    for (const [bodyKey, dbKey] of Object.entries(stringFields)) {
      if (body[bodyKey] !== undefined) updates[dbKey] = normString(body[bodyKey]);
    }
    if (body.durationMin !== undefined) updates.duration_min = normInt(body.durationMin);
    if (body.componentQty !== undefined) {
      const qty = normInt(body.componentQty);
      updates.component_qty = qty && qty > 0 ? qty : null;
    }

    const entries = Object.entries(updates);
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const setSql = entries.map(([col], i) => `${col} = $${i + 3}`).join(', ');
    const values = entries.map(([, v]) => v);

    await tenantQuery(
      orgId,
      `UPDATE repair_actions SET ${setSql} WHERE id = $1 AND organization_id = $2`,
      [id, orgId, ...values],
    );
    await invalidateCacheTags(['repair-service']);
    await publishRepairChanged({
      organizationId: ctx.organizationId,
      repairIds: [existing.repair_id],
      source: 'repair.action-edited',
    });
    return NextResponse.json({ success: true });
  },
  { permission: 'repair.mark_repaired' },
);

/**
 * DELETE /api/repair/actions/[id]
 *
 * Soft delete — sets deleted_at. Author or admin only. If the action took its
 * part from stock, the same transaction puts it back in its bin and on the ledger.
 */
export const DELETE = withAuth(
  async (req, ctx) => {
    const orgId = ctx.organizationId;
    const idRaw = req.nextUrl.pathname.split('/').pop() ?? '';
    const id = Number(decodeURIComponent(idRaw));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
    }

    const existing = await loadRepairActionForMutation(orgId, id);
    if (!existing) return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    if (!canMutate(existing, ctx.staffId, ctx.role)) {
      return NextResponse.json({ error: 'Not allowed to delete this action' }, { status: 403 });
    }

    const result = await softDeleteRepairAction(orgId, ctx.staffId, id);
    await invalidateCacheTags(['repair-service']);
    await publishRepairChanged({
      organizationId: ctx.organizationId,
      repairIds: [existing.repair_id],
      source: 'repair.action-deleted',
    });
    if (result.returnedLedger) {
      await publishStockLedgerEvent({
        organizationId: ctx.organizationId,
        ledgerId: result.returnedLedger.id,
        sku: result.returnedLedger.sku,
        delta: result.returnedLedger.delta,
        reason: REPAIR_LEDGER_REASON.reversed,
        dimension: 'WAREHOUSE',
        staffId: ctx.staffId,
        source: 'repair.action-deleted',
      });
    }
    return NextResponse.json({ success: true, stockReturned: result.returnedLedger != null });
  },
  { permission: 'repair.mark_repaired' },
);
