/**
 * Item-number ownership from pick history, on the database: derive and persist
 * owners (`sku_staff_pairings`), resolve an item's picker today (owner, or a
 * backup when the owner is out — {@link resolvePickOwnership}), and put that
 * picker on open orders nobody has assigned.
 */

import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { listStaffOutOnDate } from '@/lib/staff/staff-out-today';
import type { AssignWorkAction, ResolvedAssignee } from '@/lib/automations/listing-match';
import { sqlOrderAwaitingPick, sqlOrderInWarehouseToShip, sqlOrderPickAssigneeId } from '@/lib/orders/desk-view-sql';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderAssignmentsUpdated, publishOrderChanged } from '@/lib/realtime/publish';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { upsertOrderAssignment } from '@/lib/work-assignments/upsert-order-assignment';
import {
  getOrderAssignmentSnapshotsByOrderIds,
  getStaffNameMap,
} from '@/lib/work-assignments/order-assignment-snapshot';
import {
  PICK_HISTORY_SQL,
  pickBackupCandidates,
  planSkuPickOwners,
  skuPickOwnerNote,
  type PickHistoryRow,
  type SkuPickOwner,
} from './pick-history-owners';
import { resolvePickOwnership } from './pick-ownership';

type Queryable = Pick<PoolClient, 'query'>;

/** Staff among `staffIds` out today. Test seam, same shape as the listing automation's. */
export type ListStaffOut = (staffIds: number[]) => Promise<ReadonlySet<number>>;

/** Active staff on the picker roster, stable order — the last backups. `$1` org. */
const PICKER_ROSTER_SQL = `
  SELECT s.id
    FROM staff s
    JOIN staff_functional_roles r ON r.staff_id = s.id AND r.organization_id = s.organization_id
   WHERE s.organization_id = $1
     AND s.active IS TRUE
     AND r.role_key = 'picker'
   ORDER BY s.id ASC`;

export async function loadPickHistory(
  client: Queryable,
  orgId: OrgId,
  skus: readonly string[] | null,
): Promise<PickHistoryRow[]> {
  const { rows } = await client.query<{ sku: string; staff_id: number; picks: number; recent_picks: number; last_at: string | Date }>(
    PICK_HISTORY_SQL,
    [orgId, skus],
  );
  return rows.map((row) => ({
    sku: row.sku,
    staffId: Number(row.staff_id),
    picks: Number(row.picks),
    recentPicks: Number(row.recent_picks),
    lastAt: new Date(row.last_at).getTime() || 0,
  }));
}

/** The picker a paired item gets today, and the action that puts them on an order. */
export interface SkuPickerDefault {
  /** Owner as primary; the stand-in (if one is needed) as backup — replays to the same assignee. */
  action: AssignWorkAction & { source: 'history' };
  assignee: ResolvedAssignee;
}

/**
 * For each item with an owner (`owners`, else its `sku_staff_pairings` row):
 * the owner, or — when they are out today — the first in of the backups
 * (runner-up by pick history, then the picker roster), exactly as the pick
 * feed resolves it. Items nobody owns, or whose owner and backups are all out,
 * are absent.
 */
export async function loadSkuPickerDefaults(
  client: Queryable,
  orgId: OrgId,
  skus: readonly string[],
  listStaffOut: ListStaffOut,
  owners?: ReadonlyMap<string, number>,
): Promise<Map<string, SkuPickerDefault>> {
  const wanted = [...new Set(skus)];
  const out = new Map<string, SkuPickerDefault>();
  if (wanted.length === 0) return out;

  const paired =
    owners ??
    new Map(
      (
        await client.query<{ sku: string; staff_id: number }>(
          `SELECT sku, staff_id FROM sku_staff_pairings WHERE organization_id = $1 AND sku = ANY($2::text[])`,
          [orgId, wanted],
        )
      ).rows.map((row) => [row.sku, Number(row.staff_id)] as const),
    );
  const pairedSkus = wanted.filter((sku) => paired.has(sku));
  if (pairedSkus.length === 0) return out;

  const [history, rosterQ] = await Promise.all([
    loadPickHistory(client, orgId, pairedSkus),
    client.query<{ id: number }>(PICKER_ROSTER_SQL, [orgId]),
  ]);
  const roster = rosterQ.rows.map((row) => Number(row.id));
  const inputs = pairedSkus.map((sku) => ({
    sku,
    assignedStaffId: null,
    pairedStaffId: paired.get(sku)!,
    backupCandidates: [...pickBackupCandidates(history.filter((row) => row.sku === sku)), ...roster],
  }));
  const outToday = await listStaffOut(inputs.flatMap((input) => [input.pairedStaffId, ...input.backupCandidates]));

  for (const input of inputs) {
    const { owner } = resolvePickOwnership(input, outToday);
    if (!owner) continue;
    const standIn = owner.via === 'backup';
    out.set(input.sku, {
      action: {
        type: 'assign_work',
        work_type: 'PICK',
        staff_id: input.pairedStaffId,
        ...(standIn ? { backup_staff_id: owner.staffId } : {}),
        source: 'history',
      },
      assignee: { staffId: owner.staffId, via: standIn ? 'backup' : 'primary' },
    });
  }
  return out;
}

/**
 * The item number pick history is keyed by, per listing fact: the catalog SKU,
 * else the line's own SKU (trimmed). One round trip for the batch.
 */
export async function resolveItemSkuKeys(
  client: Queryable,
  orgId: OrgId,
  lines: ReadonlyArray<{ sku_catalog_id?: number | null; sku?: string | null }>,
): Promise<(string | null)[]> {
  if (lines.length === 0) return [];
  const { rows } = await client.query<{ ord: string; sku: string | null }>(
    `SELECT l.ord, COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(l.sku), '')) AS sku
       FROM unnest($2::int[], $3::text[]) WITH ORDINALITY AS l(catalog_id, sku, ord)
       LEFT JOIN sku_catalog sc ON sc.id = l.catalog_id AND sc.organization_id = $1`,
    [orgId, lines.map((l) => l.sku_catalog_id ?? null), lines.map((l) => l.sku ?? null)],
  );
  const keys: (string | null)[] = lines.map(() => null);
  for (const row of rows) keys[Number(row.ord) - 1] = row.sku;
  return keys;
}

export interface DeriveSkuPickOwnersResult {
  planned: SkuPickOwner[];
  /** Planned owners for items that already have one — never replaced. */
  alreadyOwned: Array<SkuPickOwner & { currentStaffId: number }>;
  /** Planned owners for items without one: written unless `dryRun`. */
  toInsert: SkuPickOwner[];
  inserted: number;
}

/**
 * Plan item owners from pick history (plus operator `overrides`, which win) and
 * persist the new ones. An item that already has an owner keeps it — a Pass,
 * a hand pairing, or an earlier derivation is never replaced. Owners who are
 * no longer active staff are not written.
 */
export async function deriveSkuPickOwners(
  orgId: OrgId,
  opts: { dryRun: boolean; overrides?: ReadonlyMap<string, number>; client?: Queryable },
): Promise<DeriveSkuPickOwnersResult> {
  const run = async (client: Queryable): Promise<DeriveSkuPickOwnersResult> => {
    const planned = planSkuPickOwners(await loadPickHistory(client, orgId, null), opts.overrides);
    const [existingQ, activeQ] = await Promise.all([
      client.query<{ sku: string; staff_id: number }>(
        `SELECT sku, staff_id FROM sku_staff_pairings WHERE organization_id = $1`,
        [orgId],
      ),
      client.query<{ id: number }>(`SELECT id FROM staff WHERE organization_id = $1 AND active IS TRUE`, [orgId]),
    ]);
    const existing = new Map(existingQ.rows.map((row) => [row.sku, Number(row.staff_id)] as const));
    const active = new Set(activeQ.rows.map((row) => Number(row.id)));
    const alreadyOwned = planned.flatMap((owner) =>
      existing.has(owner.sku) ? [{ ...owner, currentStaffId: existing.get(owner.sku)! }] : [],
    );
    const toInsert = planned.filter((owner) => !existing.has(owner.sku) && active.has(owner.staffId));
    if (opts.dryRun || toInsert.length === 0) return { planned, alreadyOwned, toInsert, inserted: 0 };

    const { rowCount } = await client.query(
      `INSERT INTO sku_staff_pairings (organization_id, sku, staff_id, note)
       SELECT $1, p.sku, p.staff_id, p.note
         FROM unnest($2::text[], $3::int[], $4::text[]) AS p(sku, staff_id, note)
       ON CONFLICT (organization_id, sku) DO NOTHING`,
      [orgId, toInsert.map((o) => o.sku), toInsert.map((o) => o.staffId), toInsert.map(skuPickOwnerNote)],
    );
    return { planned, alreadyOwned, toInsert, inserted: rowCount ?? 0 };
  };
  return opts.client ? run(opts.client) : withTenantTransaction(orgId, run);
}

export interface OpenOrderPicker {
  orderId: number;
  sku: string;
  staffId: number;
  via: ResolvedAssignee['via'];
}

/**
 * In-warehouse To-ship orders still awaiting a pick (`sqlOrderAwaitingPick`) that
 * have never had a picker — not now, and not one someone cleared — keyed by
 * item number. `$1` org.
 */
const UNPICKED_UNASSIGNED_ORDERS_SQL = `
  SELECT o.id AS order_id,
         COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), '')) AS sku
    FROM orders o
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id AND sc.organization_id = o.organization_id
   WHERE o.organization_id = $1
     AND ${sqlOrderInWarehouseToShip('o')}
     AND ${sqlOrderAwaitingPick('o')}
     AND ${sqlOrderPickAssigneeId('o')} IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM work_assignments wa
        WHERE wa.organization_id = o.organization_id
          AND wa.entity_type = 'ORDER'
          AND wa.entity_id = o.id
          AND wa.work_type = 'PICK'
          AND wa.assigned_tech_id IS NOT NULL
     )
   ORDER BY o.id`;

export interface BackfillOpenOrderPickersResult {
  /** Open, unpicked orders with no picker ever. */
  candidates: number;
  /** Of those, the ones whose item has an owner (or stand-in) today. */
  planned: OpenOrderPicker[];
  /** Written (empty on a dry run): planned rows still without any picker at write time. */
  assigned: OpenOrderPicker[];
}

/**
 * Put each open, never-assigned order's item owner on it as picker — through
 * the same writer and invalidation `/api/orders/assign` uses. `owners`
 * replaces the persisted pairings (a dry run over a derivation not yet
 * written). An assignee that appears between the read and the write wins.
 */
export async function backfillOpenOrderPickers(
  orgId: OrgId,
  opts: { dryRun: boolean; owners?: ReadonlyMap<string, number> },
): Promise<BackfillOpenOrderPickersResult> {
  const { candidates, planned } = await withTenantTransaction(orgId, async (client) => {
    const { rows } = await client.query<{ order_id: number; sku: string | null }>(UNPICKED_UNASSIGNED_ORDERS_SQL, [orgId]);
    const defaults = await loadSkuPickerDefaults(
      client,
      orgId,
      rows.flatMap((row) => (row.sku ? [row.sku] : [])),
      (ids) => listStaffOutOnDate(orgId, ids, { client }),
      opts.owners,
    );
    return {
      candidates: rows.length,
      planned: rows.flatMap((row) => {
        const hit = row.sku ? defaults.get(row.sku) : undefined;
        return hit ? [{ orderId: Number(row.order_id), sku: row.sku!, staffId: hit.assignee.staffId, via: hit.assignee.via }] : [];
      }),
    };
  });
  if (opts.dryRun || planned.length === 0) return { candidates, planned, assigned: [] };

  const assigned = await withTenantTransaction(orgId, async (client) => {
    const written: OpenOrderPicker[] = [];
    for (const row of planned) {
      const live = await client.query(
        `SELECT 1 FROM work_assignments
          WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = $2
            AND work_type = 'PICK' AND assigned_tech_id IS NOT NULL
          LIMIT 1`,
        [orgId, row.orderId],
      );
      if (live.rows.length > 0) continue;
      await upsertOrderAssignment(orgId, row.orderId, 'PICK', row.staffId, client);
      written.push(row);
    }
    return written;
  });
  if (assigned.length === 0) return { candidates, planned, assigned };
  const assignedIds = assigned.map((row) => row.orderId);

  // Same fan-out as /api/orders/assign after a picker write.
  await invalidateAllOrdersApiCaches(['shipped', 'orders-next', 'desk-pick-logs', 'packing-logs', 'need-to-order'], orgId);
  await recomputeEnrichmentForOrders(pool, assignedIds);
  await publishOrderChanged({ organizationId: orgId, orderIds: assignedIds, source: 'orders.pick_history' });
  const snaps = await getOrderAssignmentSnapshotsByOrderIds(orgId, assignedIds);
  const names = await getStaffNameMap([...snaps.values()].flatMap((s) => [s.pickerId, s.packerId]));
  for (const orderId of assignedIds) {
    const snap = snaps.get(orderId) ?? { pickerId: null, packerId: null, deadlineAt: null };
    await publishOrderAssignmentsUpdated({
      organizationId: orgId,
      orderId,
      pickerId: snap.pickerId,
      packerId: snap.packerId,
      pickerName: snap.pickerId != null ? names.get(snap.pickerId) ?? null : null,
      packerName: snap.packerId != null ? names.get(snap.packerId) ?? null : null,
      deadlineAt: snap.deadlineAt,
      source: 'orders.pick_history',
    });
  }
  return { candidates, planned, assigned };
}
