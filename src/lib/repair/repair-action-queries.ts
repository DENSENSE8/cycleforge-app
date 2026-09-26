import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { writeLedgerDelta } from '@/lib/inventory/write-ledger-delta';
import { canConsumeStock, type RepairActionRecord } from '@/lib/repair/repair-actions';
import { planBinReturn, planBinTake, REPAIR_STOCK_TAKE_QTY, stockBinLabel } from '@/lib/repair/repair-stock-take';
import type { RepairActionCreateInput } from '@/lib/schemas/repair-actions';

/** Bench log queries (`repair_actions`) behind `/api/repair/actions`. */

/** Ledger `reason` literals for a part installed into a customer repair (and its undo). */
export const REPAIR_LEDGER_REASON = {
  installed: 'REPAIR_INSTALLED',
  reversed: 'REPAIR_INSTALLED_REVERSED',
} as const;

/** One row shape for every read: the action, its author, and the bin its part came from. */
const ACTION_SELECT = `
  SELECT a.id, a.repair_id, a.action_type, a.part_name,
         a.old_sku, a.new_sku, a.old_serial, a.new_serial,
         a.duration_min, a.notes, a.staff_id,
         s.name AS staff_name,
         a.created_at,
         a.session_id::int AS session_id,
         a.donor_source, a.donor_ref,
         a.component_ref, a.component_value, a.component_qty,
         a.stock_ledger_id, a.stock_location_id, a.stock_qty,
         COALESCE(NULLIF(TRIM(sl.name), ''), NULLIF(TRIM(sl.barcode), '')) AS stock_bin_label,
         a.ticket_post_status,
         a.ticket_post_ticket_id::float8 AS ticket_post_ticket_id,
         a.ticket_comment_id::float8 AS ticket_comment_id,
         a.ticket_post_error, a.ticket_post_attempted_at
    FROM repair_actions a
    LEFT JOIN staff s ON s.id = a.staff_id
    LEFT JOIN locations sl ON sl.id = a.stock_location_id AND sl.organization_id = a.organization_id`;

export async function listRepairActions(orgId: OrgId, repairId: number): Promise<RepairActionRecord[]> {
  const res = await withTenantTransaction(orgId, (client) =>
    client.query<RepairActionRecord>(
      `${ACTION_SELECT}
        WHERE a.organization_id = $1
          AND a.repair_id = $2
          AND a.deleted_at IS NULL
        ORDER BY a.created_at DESC, a.id DESC`,
      [orgId, repairId],
    ),
  );
  return res.rows;
}

/** One live (not deleted) action in the read shape, org-scoped. */
export async function loadRepairAction(orgId: OrgId, id: number): Promise<RepairActionRecord | null> {
  const res = await withTenantTransaction(orgId, (client) =>
    client.query<RepairActionRecord>(
      `${ACTION_SELECT} WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL`,
      [id, orgId],
    ),
  );
  return res.rows[0] ?? null;
}

type CreateRepairActionResult =
  | { ok: true; action: RepairActionRecord }
  | { ok: false; status: 400 | 404 | 409; error: string };

class CreateRejected extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Insert one bench-log entry. */
export async function createRepairAction(
  orgId: OrgId,
  staffId: number,
  input: RepairActionCreateInput,
  ticketPostTicketId: number | null,
): Promise<CreateRepairActionResult> {
  try {
    const action = await withTenantTransaction(orgId, async (client) => {
      const repair = await client.query(
        `SELECT 1 FROM repair_service WHERE id = $1 AND organization_id = $2`,
        [input.repairId, orgId],
      );
      if (repair.rowCount === 0) throw new CreateRejected(404, 'Repair not found');

      if (input.sessionId != null) {
        const session = await client.query(
          `SELECT 1 FROM repair_bench_sessions
            WHERE id = $1 AND organization_id = $2 AND repair_id = $3
              AND staff_id = $4 AND ended_at IS NULL`,
          [input.sessionId, orgId, input.repairId, staffId],
        );
        if (session.rowCount === 0) {
          throw new CreateRejected(409, 'That bench timer is no longer running — refresh and try again.');
        }
      }

      // Take-from-stock: lock the bin's row for this SKU, refuse a short bin,
      // then move the bin count and the ledger together (below, after the insert).
      let take: { locationId: number; sku: string; label: string; after: number } | null = null;
      if (input.consumeStock) {
        if (!canConsumeStock(input)) {
          throw new CreateRejected(400, 'Only a new-stock replacement with a catalog SKU can be taken from stock.');
        }
        if (input.stockLocationId == null) throw new CreateRejected(400, 'Pick the bin the part is taken from.');
        const sku = input.newSku!.trim();
        const loc = await client.query<{ id: number; name: string | null; barcode: string | null }>(
          `SELECT id, name, barcode FROM locations WHERE id = $1 AND organization_id = $2`,
          [input.stockLocationId, orgId],
        );
        if (!loc.rows[0]) throw new CreateRejected(404, 'That bin no longer exists — pick another.');
        const bin = await client.query<{ qty: number }>(
          `SELECT qty FROM bin_contents
            WHERE location_id = $1 AND sku = $2 AND organization_id = $3
            FOR UPDATE`,
          [input.stockLocationId, sku, orgId],
        );
        const label = stockBinLabel(loc.rows[0]);
        const plan = planBinTake({
          binQty: bin.rows[0] ? Number(bin.rows[0].qty) : null,
          qty: REPAIR_STOCK_TAKE_QTY,
          sku,
          binLabel: label,
        });
        if (!plan.ok) throw new CreateRejected(409, plan.message);
        take = { locationId: input.stockLocationId, sku, label, after: plan.after };
      }

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO repair_actions
            (organization_id, repair_id, action_type, part_name, old_sku, new_sku,
             old_serial, new_serial, duration_min, notes, staff_id,
             session_id, donor_source, donor_ref,
             component_ref, component_value, component_qty,
             ticket_post_status, ticket_post_ticket_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING id`,
        [
          orgId,
          input.repairId,
          input.actionType,
          input.partName,
          input.oldSku,
          input.newSku,
          input.oldSerial,
          input.newSerial,
          input.durationMin,
          input.notes,
          staffId,
          input.sessionId,
          input.donorSource,
          input.donorRef,
          input.componentRef,
          input.componentValue,
          input.componentQty,
          ticketPostTicketId != null ? 'pending' : null,
          ticketPostTicketId,
        ],
      );
      const actionId = inserted.rows[0].id;

      if (take) {
        await client.query(
          `UPDATE bin_contents SET qty = $4, updated_at = NOW()
            WHERE location_id = $1 AND sku = $2 AND organization_id = $3`,
          [take.locationId, take.sku, orgId, take.after],
        );
        const ledger = await writeLedgerDelta(client, {
          orgId,
          sku: take.sku,
          delta: -REPAIR_STOCK_TAKE_QTY,
          reason: REPAIR_LEDGER_REASON.installed,
          staffId,
          notes: `Installed in RS-${input.repairId} (bench action #${actionId}) from bin ${take.label}${input.newSerial ? ` · SN ${input.newSerial}` : ''}`,
        });
        await client.query(
          `UPDATE repair_actions SET stock_ledger_id = $1, stock_location_id = $2, stock_qty = $3
            WHERE id = $4 AND organization_id = $5`,
          [ledger?.id ?? null, take.locationId, REPAIR_STOCK_TAKE_QTY, actionId, orgId],
        );
      }

      const row = await client.query<RepairActionRecord>(
        `${ACTION_SELECT} WHERE a.id = $1 AND a.organization_id = $2`,
        [actionId, orgId],
      );
      return row.rows[0];
    });
    return { ok: true, action };
  } catch (err) {
    if (err instanceof CreateRejected) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

export interface RepairActionOwnerRow {
  id: number;
  repair_id: number;
  staff_id: number | null;
  stock_ledger_id: number | null;
}

/** The live (not deleted) action, org-scoped, for the author/admin check. */
export async function loadRepairActionForMutation(
  orgId: OrgId,
  id: number,
): Promise<RepairActionOwnerRow | null> {
  const r = await withTenantTransaction(orgId, (client) =>
    client.query<RepairActionOwnerRow>(
      `SELECT id, repair_id, staff_id, stock_ledger_id
         FROM repair_actions
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    ),
  );
  return r.rows[0] ?? null;
}

/** Soft-delete an action. */
export async function softDeleteRepairAction(
  orgId: OrgId,
  staffId: number,
  id: number,
): Promise<{ deleted: boolean; returnedLedger: { id: number; sku: string; delta: number } | null }> {
  return withTenantTransaction(orgId, async (client) => {
    const del = await client.query<{
      repair_id: number;
      stock_ledger_id: number | null;
      stock_location_id: number | null;
      stock_qty: number | null;
    }>(
      `UPDATE repair_actions SET deleted_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING repair_id, stock_ledger_id, stock_location_id, stock_qty`,
      [id, orgId],
    );
    const row = del.rows[0];
    if (!row) return { deleted: false, returnedLedger: null };
    if (row.stock_ledger_id == null) return { deleted: true, returnedLedger: null };

    const original = await client.query<{ sku: string; delta: number }>(
      `SELECT sku, delta FROM sku_stock_ledger WHERE id = $1 AND organization_id = $2`,
      [row.stock_ledger_id, orgId],
    );
    const entry = original.rows[0];
    if (!entry) return { deleted: true, returnedLedger: null };

    if (row.stock_location_id != null && row.stock_qty != null) {
      const bin = await client.query<{ qty: number }>(
        `SELECT qty FROM bin_contents
          WHERE location_id = $1 AND sku = $2 AND organization_id = $3
          FOR UPDATE`,
        [row.stock_location_id, entry.sku, orgId],
      );
      const after = planBinReturn({ binQty: bin.rows[0] ? Number(bin.rows[0].qty) : null, qty: row.stock_qty });
      await client.query(
        `INSERT INTO bin_contents (location_id, sku, qty, organization_id)
         VALUES ($1, $2, $4, $3)
         ON CONFLICT (location_id, sku) DO UPDATE SET qty = EXCLUDED.qty, updated_at = NOW()`,
        [row.stock_location_id, entry.sku, orgId, after],
      );
    }

    const returnedLedger = await writeLedgerDelta(client, {
      orgId,
      sku: entry.sku,
      delta: -entry.delta,
      reason: REPAIR_LEDGER_REASON.reversed,
      staffId,
      notes: `Bench action #${id} on RS-${row.repair_id} deleted — part back to stock`,
    });
    return { deleted: true, returnedLedger };
  });
}
