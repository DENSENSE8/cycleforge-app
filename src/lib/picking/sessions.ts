/** Picking sessions — domain module for the mobile picker workflow. */

import pool from '@/lib/db';
import { transition } from '@/lib/inventory/state-machine';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import type { Queryable } from '@/lib/neon/serial-units-queries';
import { parseToteScan, toteBindRefusal } from '@/lib/picking/tote-scan';
import { linkPickedSerialToOrder } from '@/lib/picking/pick-serial-link';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PickTaskPlatform {
  platform: string;
  platformSku: string | null;
  platformItemId: string | null;
}

export interface PickTaskRow {
  allocationId: number;
  serialUnitId: number;
  /** Human-scannable serial barcode on the physical unit. Used by the
   *  picker's scan-gate to validate the right unit was scanned before
   *  confirming the pick. May be null for legacy units without a serial. */
  serialNumber: string | null;
  /** Minted unit id the QC / pre-box label encodes (`{SKU}-{YYWW}-{SEQ6}`). */
  unitUid: string | null;
  lineId: number;
  sku: string;
  productTitle: string | null;
  bin: string | null;
  conditionGrade: string | null;
  plannedQty: number;
  currentState: string;
  /** Marketplace mappings for this canonical SKU. Used by SkuIdentity to
   *  show e.g. "Ecwid 01279-B · Amazon ZB-AFHB-Y58D" beside the internal SKU. */
  platforms: PickTaskPlatform[];
}

export interface PickOrderTasks {
  orderId: number;
  orderLabel: string;
  customerInitials: string;
  shipByDate: string | null;
  tasks: PickTaskRow[];
}

type StartSessionInput = {
  orderId: number;
  pickerStaffId: number;
  deviceId?: string | null;
};

type StartSessionResult =
  | { ok: true; sessionId: number; reopen: boolean }
  | { ok: false; status: 404 | 409; error: string };

type ConfirmPickInput = {
  sessionId: number;
  allocationId: number;
  actorStaffId: number;
  clientEventId?: string | null;
  /**
   * Raw tote scan — `H-{id}`, numeric id, or an external tote barcode. When
   * present the pick binds the unit into that handling unit and stamps the
   * tote↔order pairing (one tote carries one order; pick → pack loop).
   */
  toteScan?: string | null;
};

export type ConfirmPickResult =
  | { ok: true; serialUnitId: number; pickedAt: string; toteCode?: string | null }
  | { ok: false; status: 404 | 409; error: string };

export type ShortPickReason =
  | 'NOT_FOUND_IN_BIN'
  | 'DAMAGED'
  | 'WRONG_CONDITION'
  | 'MISLABELED'
  | 'INSUFFICIENT_STOCK'
  | 'OTHER';

type RecordShortPickInput = {
  sessionId: number;
  allocationId: number;
  pickedQty: number;
  plannedQty: number;
  reason: ShortPickReason;
  note: string;
  actorStaffId: number;
  clientEventId?: string | null;
};

export type RecordShortPickResult =
  | { ok: true; releasedUnitId: number | null }
  | { ok: false; status: 404 | 409; error: string };

// ─── Read: pick-task list ───────────────────────────────────────────────────

/**
 * Fetch all open allocations for an order, joined with bin + product metadata.
 * The caller (mobile picker) renders one task per row.
 */
export async function loadPickTasks(orderId: number, orgId?: OrgId): Promise<PickOrderTasks | null> {
  // Org-scoped reads add explicit organization_id predicates + align the
  // string-key joins (sku, current_location); raw-pool path stays byte-identical.
  const orderQ = orgId
    ? await tenantQuery<{
        id: number;
        order_label: string | null;
        first_name: string | null;
        last_name: string | null;
        deadline_at: string | null;
      }>(
        orgId,
        `SELECT o.id,
                o.order_id                       AS order_label,
                c.first_name,
                c.last_name,
                wa.deadline_at::text             AS deadline_at
           FROM orders o
      LEFT JOIN customers        c  ON c.id = o.customer_id
      LEFT JOIN work_assignments wa ON wa.entity_type = 'ORDER'
                                  AND wa.entity_id   = o.id
                                  AND wa.deadline_at IS NOT NULL
          WHERE o.id = $1
            AND o.organization_id = $2
          ORDER BY wa.deadline_at ASC NULLS LAST
          LIMIT 1`,
        [orderId, orgId],
      )
    : await pool.query<{
        id: number;
        order_label: string | null;
        first_name: string | null;
        last_name: string | null;
        deadline_at: string | null;
      }>(
        `SELECT o.id,
                o.order_id                       AS order_label,
                c.first_name,
                c.last_name,
                wa.deadline_at::text             AS deadline_at
           FROM orders o
      LEFT JOIN customers        c  ON c.id = o.customer_id
      LEFT JOIN work_assignments wa ON wa.entity_type = 'ORDER'
                                  AND wa.entity_id   = o.id
                                  AND wa.deadline_at IS NOT NULL
          WHERE o.id = $1
          ORDER BY wa.deadline_at ASC NULLS LAST
          LIMIT 1`,
        [orderId],
      );
  const order = orderQ.rows[0];
  if (!order) return null;

  const tasksQ = orgId
    ? await tenantQuery<{
        allocation_id: number;
        serial_unit_id: number;
        serial_number: string | null;
        unit_uid: string | null;
        sku: string;
        product_title: string | null;
        zoho_item_title?: string | null;
        bin: string | null;
        condition_grade: string | null;
        current_status: string;
        platforms: PickTaskPlatform[] | null;
      }>(
        orgId,
        `SELECT oua.id            AS allocation_id,
                oua.serial_unit_id,
                su.serial_number,
                su.unit_uid,
                su.sku,
                sc.product_title,
                (SELECT i.name FROM items i
                  WHERE i.sku = su.sku AND i.organization_id = su.organization_id AND i.status = 'active'
                  ORDER BY i.id LIMIT 1) AS zoho_item_title,
                -- Prefer the human-readable barcode (e.g. 'UNSORTED', 'A-12');
                -- fall back to the raw current_location string when no
                -- locations row matches (orphan / legacy data).
                COALESCE(l.barcode, l.name, su.current_location) AS bin,
                su.condition_grade::text AS condition_grade,
                su.current_status::text  AS current_status,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                     'platform',         spi.platform,
                     'platformSku',      spi.platform_sku,
                     'platformItemId',   spi.platform_item_id
                   ) ORDER BY spi.platform)
                     FROM sku_platform_ids spi
                    WHERE spi.sku_catalog_id = sc.id
                      AND spi.organization_id = sc.organization_id
                      AND spi.is_active = true
                      AND (spi.platform_sku IS NOT NULL OR spi.platform_item_id IS NOT NULL)
                  ),
                  '[]'::json
                )                  AS platforms
           FROM order_unit_allocations oua
           JOIN serial_units su  ON su.id = oua.serial_unit_id
      LEFT JOIN sku_catalog  sc  ON sc.sku = su.sku
                                AND sc.organization_id = su.organization_id
      LEFT JOIN locations    l   ON l.id::text = su.current_location
                                AND l.organization_id = su.organization_id
          WHERE oua.order_id = $1
            AND oua.organization_id = $2
            AND oua.state IN ('ALLOCATED', 'PICKING')
          -- Walk order: bin sequence, then bin face, then SKU — not allocation id.
          ORDER BY l.sort_order ASC NULLS LAST,
                   COALESCE(l.barcode, l.name, su.current_location) ASC NULLS LAST,
                   su.sku ASC,
                   oua.id ASC`,
        [orderId, orgId],
      )
    : await pool.query<{
        allocation_id: number;
        serial_unit_id: number;
        serial_number: string | null;
        unit_uid: string | null;
        sku: string;
        product_title: string | null;
        zoho_item_title?: string | null;
        bin: string | null;
        condition_grade: string | null;
        current_status: string;
        platforms: PickTaskPlatform[] | null;
      }>(
        `SELECT oua.id            AS allocation_id,
                oua.serial_unit_id,
                su.serial_number,
                su.unit_uid,
                su.sku,
                sc.product_title,
                -- Prefer the human-readable barcode (e.g. 'UNSORTED', 'A-12');
                -- fall back to the raw current_location string when no
                -- locations row matches (orphan / legacy data).
                COALESCE(l.barcode, l.name, su.current_location) AS bin,
                su.condition_grade::text AS condition_grade,
                su.current_status::text  AS current_status,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                     'platform',         spi.platform,
                     'platformSku',      spi.platform_sku,
                     'platformItemId',   spi.platform_item_id
                   ) ORDER BY spi.platform)
                     FROM sku_platform_ids spi
                    WHERE spi.sku_catalog_id = sc.id
                      AND spi.is_active = true
                      AND (spi.platform_sku IS NOT NULL OR spi.platform_item_id IS NOT NULL)
                  ),
                  '[]'::json
                )                  AS platforms
           FROM order_unit_allocations oua
           JOIN serial_units su  ON su.id = oua.serial_unit_id
      LEFT JOIN sku_catalog  sc  ON sc.sku = su.sku
                                AND sc.organization_id = su.organization_id
      LEFT JOIN locations    l   ON l.id::text = su.current_location
          WHERE oua.order_id = $1
            AND oua.state IN ('ALLOCATED', 'PICKING')
          ORDER BY oua.id ASC`,
        [orderId],
      );

  const initials = `${(order.first_name || '?')[0] || '?'}${(order.last_name || '')[0] || ''}`.toUpperCase();

  return {
    orderId: order.id,
    orderLabel: order.order_label ? `#${order.order_label}` : `#${order.id}`,
    customerInitials: initials,
    shipByDate: order.deadline_at,
    tasks: tasksQ.rows.map((r, i) => ({
      allocationId: r.allocation_id,
      serialUnitId: r.serial_unit_id,
      serialNumber: r.serial_number,
      unitUid: r.unit_uid,
      lineId: i + 1,
      sku: r.sku,
      productTitle:
        resolveSkuIdentityTitle({ zoho_item_title: r.zoho_item_title, catalog_product_title: r.product_title }) || null,
      bin: r.bin,
      conditionGrade: r.condition_grade,
      plannedQty: 1, // one allocation row = one unit; aggregate elsewhere if needed
      currentState: r.current_status,
      platforms: r.platforms ?? [],
    })),
  };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/**
 * Open (or reuse) the (order, picker) session on a caller's transaction —
 * the directed feed claims an order and opens its session under one lock.
 */
export async function openPickingSessionOn(
  client: Queryable,
  input: StartSessionInput,
  orgId: OrgId,
): Promise<StartSessionResult> {
  const orderQ = await client.query<{ id: number }>(
    `SELECT id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [input.orderId, orgId],
  );
  if (orderQ.rowCount === 0) {
    return { ok: false, status: 404, error: `order ${input.orderId} not found` };
  }

  // Reuse an existing open session for this (order, picker) so a worker who
  // navigates away and back doesn't fragment the audit trail.
  const reuseQ = await client.query<{ id: number }>(
    `SELECT ps.id FROM picking_sessions ps
       JOIN orders o ON o.id = ps.order_id
      WHERE ps.order_id = $1
        AND ps.picker_staff_id = $2
        AND ps.ended_at IS NULL
        AND o.organization_id = $3
      ORDER BY ps.started_at DESC
      LIMIT 1`,
    [input.orderId, input.pickerStaffId, orgId],
  );
  if ((reuseQ.rowCount ?? 0) > 0) {
    return { ok: true, sessionId: Number(reuseQ.rows[0].id), reopen: true };
  }

  const insertQ = await client.query<{ id: number }>(
    `INSERT INTO picking_sessions (order_id, picker_staff_id, device_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.orderId, input.pickerStaffId, input.deviceId ?? null],
  );
  await refreshOrderStageFacts(orgId, { orderIds: [input.orderId] }, client);
  return { ok: true, sessionId: Number(insertQ.rows[0].id), reopen: false };
}

/**
 * End THIS picker's open session(s) on an order without staging its totes —
 * Skip and Pass hand the order back (or on) mid-pick, so it must stop being
 * held by them. Picked units stay picked; the order's tote stays paired.
 */
export async function releaseOrderSessions(
  input: { orderId: number; pickerStaffId: number },
  orgId: OrgId,
): Promise<number> {
  return withTenantTransaction(orgId, async (client) => {
    const q = await client.query(
      `UPDATE picking_sessions ps
          SET ended_at = NOW()
         FROM orders o
        WHERE ps.order_id = o.id
          AND o.organization_id = $1
          AND ps.order_id = $2
          AND ps.picker_staff_id = $3
          AND ps.ended_at IS NULL`,
      [orgId, input.orderId, input.pickerStaffId],
    );
    await refreshOrderStageFacts(orgId, { orderIds: [input.orderId] }, client);
    return q.rowCount ?? 0;
  });
}

export async function startSession(input: StartSessionInput, orgId?: OrgId): Promise<StartSessionResult> {
  // ── Org-scoped path:
  if (orgId) {
    return withTenantTransaction<StartSessionResult>(orgId, (client) => openPickingSessionOn(client, input, orgId));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderQ = await client.query<{ id: number }>(
      `SELECT id FROM orders WHERE id = $1 LIMIT 1`,
      [input.orderId],
    );
    if (orderQ.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: `order ${input.orderId} not found` };
    }

    // Reuse an existing open session for this (order, picker) so a worker who
    // navigates away and back doesn't fragment the audit trail.
    const reuseQ = await client.query<{ id: number }>(
      `SELECT id FROM picking_sessions
        WHERE order_id = $1
          AND picker_staff_id = $2
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      [input.orderId, input.pickerStaffId],
    );
    if ((reuseQ.rowCount ?? 0) > 0) {
      await client.query('COMMIT');
      return { ok: true, sessionId: reuseQ.rows[0].id, reopen: true };
    }

    const insertQ = await client.query<{ id: number }>(
      `INSERT INTO picking_sessions (order_id, picker_staff_id, device_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.orderId, input.pickerStaffId, input.deviceId ?? null],
    );
    await client.query('COMMIT');
    return { ok: true, sessionId: insertQ.rows[0].id, reopen: false };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

// ─── Tote pairing (pick → pack loop) ────────────────────────────────────────

interface ToteRow {
  id: number;
  code: string;
  status: string;
  pairedOrderId: number | null;
}

type ToteRead =
  | { ok: true; tote: ToteRow }
  | { ok: false; status: 404 | 409; error: string };

/** Resolve the tote a picker scanned — `H-{id}`, the `/m/h/{id}` QR, a numeric id, or an external barcode (`handling_units.code`) — lock it… */
async function readToteForOrder(
  client: Queryable,
  orgId: OrgId,
  rawScan: string,
  orderId: number,
): Promise<ToteRead> {
  const raw = rawScan.trim();
  const parsed = parseToteScan(raw);
  if (!parsed) return { ok: false, status: 404, error: 'empty tote scan' };
  // A bare positive integer is a plate id on the pick side (the picker only
  // ever scans totes here); the pack side keeps it a barcode candidate.
  const numeric = Number(raw);
  const ref = Number.isInteger(numeric) && numeric > 0 ? { id: numeric } : parsed;
  const toteQ =
    'id' in ref
      ? await client.query<ToteRow>(
          `SELECT id, code, status, paired_order_id AS "pairedOrderId"
             FROM handling_units
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE`,
          [ref.id, orgId],
        )
      : await client.query<ToteRow>(
          `SELECT id, code, status, paired_order_id AS "pairedOrderId"
             FROM handling_units
            WHERE code = $1 AND organization_id = $2
            FOR UPDATE`,
          [ref.code, orgId],
        );
  const tote = toteQ.rows[0];
  if (!tote) return { ok: false, status: 404, error: `tote ${raw} not found` };
  const refusal = toteBindRefusal(tote, orderId);
  if (refusal) return { ok: false, ...refusal };
  return { ok: true, tote };
}

/**
 * Reserve the scanned tote for the picker's open order before the first unit
 * leaves its bin. Confirming a unit still rechecks the same locked tote and
 * attaches the unit in its own transaction; a rejected scan cannot arm the UI.
 */
export async function pairPickingTote(
  orgId: OrgId,
  input: { sessionId: number; orderId: number; toteScan: string; staffId: number },
): Promise<
  | { ok: true; toteId: number; toteCode: string; alreadyPaired: boolean }
  | { ok: false; status: 404 | 409; error: string }
> {
  return withTenantTransaction(orgId, async (client) => {
    const session = await client.query(
      `SELECT ps.id
         FROM picking_sessions ps
         JOIN orders o ON o.id = ps.order_id AND o.organization_id = $4
        WHERE ps.id = $1 AND ps.order_id = $2 AND ps.picker_staff_id = $3
          AND ps.ended_at IS NULL
          AND EXISTS (
            SELECT 1 FROM order_unit_allocations oua
             WHERE oua.order_id = o.id AND oua.organization_id = $4
               AND oua.state IN ('ALLOCATED', 'PICKING')
          )
        FOR UPDATE OF ps`,
      [input.sessionId, input.orderId, input.staffId, orgId],
    );
    if (!session.rows.length) {
      return { ok: false as const, status: 409 as const, error: 'This pick session is no longer active' };
    }
    const read = await readToteForOrder(client, orgId, input.toteScan, input.orderId);
    if (!read.ok) return read;
    const alreadyPaired = read.tote.pairedOrderId === input.orderId;
    const result = await client.query(
      `UPDATE handling_units
          SET paired_order_id = $1,
              paired_at = COALESCE(paired_at, NOW()),
              paired_by_staff_id = COALESCE(paired_by_staff_id, $2)
        WHERE id = $3 AND organization_id = $4
          AND (paired_order_id IS NULL OR paired_order_id = $1)
          AND status IN ('OPEN', 'STAGED')`,
      [input.orderId, input.staffId, read.tote.id, orgId],
    );
    if (result.rowCount !== 1) throw new Error('Tote pairing changed under lock');
    return { ok: true as const, toteId: read.tote.id, toteCode: read.tote.code, alreadyPaired };
  });
}

/** Stamp the tote↔order pairing and move the unit into the tote. */
async function bindToteForPick(
  client: Queryable,
  orgId: OrgId,
  tote: ToteRow,
  orderId: number,
  serialUnitId: number,
  actorStaffId: number,
): Promise<void> {
  const pairQ = await client.query(
    `UPDATE handling_units
        SET paired_order_id = $1,
            paired_at = COALESCE(paired_at, NOW()),
            paired_by_staff_id = $2
      WHERE id = $3
        AND organization_id = $4
        AND (paired_order_id IS NULL OR paired_order_id = $1)
        AND status IN ('OPEN', 'STAGED')`,
    [orderId, actorStaffId, tote.id, orgId],
  );
  if (pairQ.rowCount === 0) {
    throw new Error(`tote ${tote.code} pairing changed under lock — pick rolled back`);
  }
  await client.query(
    `UPDATE serial_units
        SET handling_unit_id = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3`,
    [tote.id, serialUnitId, orgId],
  );
}

export async function confirmPick(input: ConfirmPickInput, orgId: OrgId): Promise<ConfirmPickResult> {
  // ── Org-scoped path: GUC-wrapped transaction; org-ownership predicates on
  // the allocation read/write (404 on a foreign-org allocation) + orgId
  // threaded into the shared transition() helper running on the same client.
  if (orgId) {
    return withTenantTransaction<ConfirmPickResult>(orgId, async (client) => {
      if (input.clientEventId) {
        const replayQ = await client.query<{
          serial_unit_id: number | null;
          occurred_at: string;
          tote_code: string | null;
        }>(
          `SELECT serial_unit_id,
                  occurred_at::text,
                  NULLIF(payload->>'toteCode', '') AS tote_code
             FROM inventory_events
            WHERE organization_id = $1
              AND client_event_id = $2
            LIMIT 1`,
          [orgId, input.clientEventId],
        );
        const replay = replayQ.rows[0];
        if (replay?.serial_unit_id) {
          return {
            ok: true,
            serialUnitId: replay.serial_unit_id,
            pickedAt: replay.occurred_at,
            toteCode: replay.tote_code,
          };
        }
      }
      const allocQ = await client.query<{
        id: number;
        serial_unit_id: number;
        state: string;
        order_id: number;
      }>(
        `SELECT id, serial_unit_id, state, order_id
           FROM order_unit_allocations
          WHERE id = $1
            AND organization_id = $2
          FOR UPDATE`,
        [input.allocationId, orgId],
      );
      const alloc = allocQ.rows[0];
      if (!alloc) {
        return { ok: false, status: 404, error: `allocation ${input.allocationId} not found` };
      }
      if (alloc.state === 'PICKED' || alloc.state === 'PACKED' || alloc.state === 'SHIPPED') {
        return { ok: false, status: 409, error: `allocation already ${alloc.state}` };
      }
      // Tote gate — resolve + lock + guard BEFORE any write, so a bad tote
      // fails fast with nothing committed.
      let tote: ToteRow | null = null;
      if (input.toteScan) {
        const toteRead = await readToteForOrder(client, orgId, input.toteScan, alloc.order_id);
        if (!toteRead.ok) {
          return { ok: false, status: toteRead.status, error: toteRead.error };
        }
        tote = toteRead.tote;
      }

      const unitResult = await transition(
        {
          unitId: alloc.serial_unit_id,
          to: 'PICKED',
          eventType: 'PICKED',
          actorStaffId: input.actorStaffId,
          station: 'MOBILE',
          clientEventId: input.clientEventId ?? null,
          payload: {
            source: 'picking.confirm',
            sessionId: input.sessionId,
            allocationId: alloc.id,
            toteCode: tote?.code ?? null,
          },
        },
        client,
        orgId,
      );
      if (!unitResult.ok) {
        // Throw to roll back the GUC-wrapped transaction, then map to the result.
        return { ok: false, status: unitResult.status, error: unitResult.error };
      }

      await client.query(
        `UPDATE order_unit_allocations
            SET state = 'PICKED'
          WHERE id = $1
            AND organization_id = $2`,
        [alloc.id, orgId],
      );

      if (tote) {
        await bindToteForPick(client, orgId, tote, alloc.order_id, alloc.serial_unit_id, input.actorStaffId);
      }

      // The order learns the serial its QC label named (outbound ← pick).
      await linkPickedSerialToOrder(client, orgId, {
        serialUnitId: alloc.serial_unit_id,
        orderId: alloc.order_id,
      });

      // The first picker of a SKU owns it from now on: its future picks route
      // to them, with auto-selected backups (`pick-ownership.ts`). An existing
      // owner is never replaced by a pick — a Pass is the override.
      if (input.actorStaffId) {
        await client.query(
          `INSERT INTO sku_staff_pairings (organization_id, sku, staff_id, note, created_by_staff_id)
           SELECT $1, su.sku, $3, 'Auto: first confirmed pick', $3
             FROM serial_units su
            WHERE su.id = $2
              AND su.organization_id = $1
              AND btrim(COALESCE(su.sku, '')) <> ''
           ON CONFLICT (organization_id, sku) DO NOTHING`,
          [orgId, alloc.serial_unit_id, input.actorStaffId],
        );
      }
      await refreshOrderStageFacts(orgId, { orderIds: [alloc.order_id] }, client);

      // Pick time = state-transition timestamp on the inventory_event we just wrote.
      return {
        ok: true,
        serialUnitId: alloc.serial_unit_id,
        pickedAt: new Date().toISOString(),
        toteCode: tote?.code ?? null,
      };
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allocQ = await client.query<{
      id: number;
      serial_unit_id: number;
      state: string;
      order_id: number;
    }>(
      `SELECT id, serial_unit_id, state, order_id
         FROM order_unit_allocations
        WHERE id = $1
        FOR UPDATE`,
      [input.allocationId],
    );
    const alloc = allocQ.rows[0];
    if (!alloc) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: `allocation ${input.allocationId} not found` };
    }
    if (alloc.state === 'PICKED' || alloc.state === 'PACKED' || alloc.state === 'SHIPPED') {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, error: `allocation already ${alloc.state}` };
    }
    // Tote gate — same fail-fast ordering as the org-scoped branch.
    let tote: ToteRow | null = null;
    if (input.toteScan) {
      const toteRead = await readToteForOrder(client, orgId, input.toteScan, alloc.order_id);
      if (!toteRead.ok) {
        await client.query('ROLLBACK');
        return { ok: false, status: toteRead.status, error: toteRead.error };
      }
      tote = toteRead.tote;
    }

    // ALLOCATED → PICKED (skip the transient PICKING; the picker is at the bin and the scan confirms the pick in a single tap.
    const unitResult = await transition(
      {
        unitId: alloc.serial_unit_id,
        to: 'PICKED',
        eventType: 'PICKED',
        actorStaffId: input.actorStaffId,
        station: 'MOBILE',
        clientEventId: input.clientEventId ?? null,
        payload: {
          source: 'picking.confirm',
          sessionId: input.sessionId,
          allocationId: alloc.id,
          toteCode: tote?.code ?? null,
        },
      },
      client,
      orgId,
    );
    if (!unitResult.ok) {
      await client.query('ROLLBACK');
      return { ok: false, status: unitResult.status, error: unitResult.error };
    }

    await client.query(
      `UPDATE order_unit_allocations
          SET state = 'PICKED'
        WHERE id = $1`,
      [alloc.id],
    );

    if (tote) {
      await bindToteForPick(client, orgId, tote, alloc.order_id, alloc.serial_unit_id, input.actorStaffId);
    }

    await client.query('COMMIT');
    // Pick time = state-transition timestamp on the inventory_event we just wrote.
    return {
      ok: true,
      serialUnitId: alloc.serial_unit_id,
      pickedAt: new Date().toISOString(),
      toteCode: tote?.code ?? null,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function recordShortPick(input: RecordShortPickInput, orgId: OrgId): Promise<RecordShortPickResult> {
  // ── Org-scoped path: GUC-wrapped transaction; org-ownership predicates on
  // the allocation read/write (404 on a foreign-org allocation) + orgId
  // threaded into the shared transition() helper running on the same client.
  if (orgId) {
    return withTenantTransaction<RecordShortPickResult>(orgId, async (client) => {
      if (input.clientEventId) {
        const replayQ = await client.query<{ serial_unit_id: number | null }>(
          `SELECT serial_unit_id
             FROM inventory_events
            WHERE organization_id = $1
              AND client_event_id = $2
            LIMIT 1`,
          [orgId, input.clientEventId],
        );
        if (replayQ.rows[0]) {
          return { ok: true, releasedUnitId: replayQ.rows[0].serial_unit_id };
        }
      }
      const allocQ = await client.query<{
        id: number;
        serial_unit_id: number;
        state: string;
      }>(
        `SELECT id, serial_unit_id, state
           FROM order_unit_allocations
          WHERE id = $1
            AND organization_id = $2
          FOR UPDATE`,
        [input.allocationId, orgId],
      );
      const alloc = allocQ.rows[0];
      if (!alloc) {
        return { ok: false, status: 404, error: `allocation ${input.allocationId} not found` };
      }

      // Short means the worker picked fewer than planned.
      const statusQ = await client.query<{ current_status: string }>(
        `SELECT current_status::text AS current_status
           FROM serial_units
          WHERE id = $1 AND organization_id = $2`,
        [alloc.serial_unit_id, orgId],
      );
      const shortNotes = `short-pick: ${input.reason}${input.note ? ` — ${input.note}` : ''}`;
      const shortPayload = {
        source: 'picking.short_pick',
        sessionId: input.sessionId,
        allocationId: alloc.id,
        reason: input.reason,
        pickedQty: input.pickedQty,
        plannedQty: input.plannedQty,
      };
      if (statusQ.rows[0]?.current_status === 'STOCKED') {
        await recordInventoryEvent(
          {
            event_type: 'NOTE',
            actor_staff_id: input.actorStaffId,
            station: 'MOBILE',
            serial_unit_id: alloc.serial_unit_id,
            client_event_id: input.clientEventId ?? null,
            notes: shortNotes,
            payload: shortPayload,
          },
          client,
          orgId,
        );
      } else {
        const unitResult = await transition(
          {
            unitId: alloc.serial_unit_id,
            to: 'STOCKED',
            eventType: 'NOTE',
            actorStaffId: input.actorStaffId,
            station: 'MOBILE',
            clientEventId: input.clientEventId ?? null,
            notes: shortNotes,
            payload: shortPayload,
          },
          client,
          orgId,
        );
        if (!unitResult.ok) {
          return { ok: false, status: unitResult.status, error: unitResult.error };
        }
      }

      await client.query(
        `UPDATE order_unit_allocations
            SET state = 'RELEASED',
                released_at = NOW(),
                released_reason = $2
          WHERE id = $1
            AND organization_id = $3`,
        [alloc.id, `SHORT_PICK_${input.reason}`, orgId],
      );
      await refreshOrderStageFacts(orgId, { serialUnitIds: [alloc.serial_unit_id] }, client);

      return { ok: true, releasedUnitId: alloc.serial_unit_id };
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allocQ = await client.query<{
      id: number;
      serial_unit_id: number;
      state: string;
    }>(
      `SELECT id, serial_unit_id, state
         FROM order_unit_allocations
        WHERE id = $1
        FOR UPDATE`,
      [input.allocationId],
    );
    const alloc = allocQ.rows[0];
    if (!alloc) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: `allocation ${input.allocationId} not found` };
    }

    // Short means the worker picked fewer than planned. Release this allocation
    // back to STOCKED so re-allocation can hand it to another order.
    const unitResult = await transition(
      {
        unitId: alloc.serial_unit_id,
        to: 'STOCKED',
        eventType: 'NOTE',
        actorStaffId: input.actorStaffId,
        station: 'MOBILE',
        clientEventId: input.clientEventId ?? null,
        notes: `short-pick: ${input.reason}${input.note ? ` — ${input.note}` : ''}`,
        payload: {
          source: 'picking.short_pick',
          sessionId: input.sessionId,
          allocationId: alloc.id,
          reason: input.reason,
          pickedQty: input.pickedQty,
          plannedQty: input.plannedQty,
        },
      },
      client,
      orgId,
    );
    if (!unitResult.ok) {
      await client.query('ROLLBACK');
      return { ok: false, status: unitResult.status, error: unitResult.error };
    }

    await client.query(
      `UPDATE order_unit_allocations
          SET state = 'RELEASED',
              released_at = NOW(),
              released_reason = $2
        WHERE id = $1`,
      [alloc.id, `SHORT_PICK_${input.reason}`],
    );

    await client.query('COMMIT');
    return { ok: true, releasedUnitId: alloc.serial_unit_id };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

/** A picker's free-text note on a line (the directed screen's Notes verb). */
export async function recordPickNote(
  input: { sessionId: number; allocationIds: number[]; text: string; actorStaffId: number },
  orgId: OrgId,
): Promise<{ ok: true; recorded: number } | { ok: false; status: 400 | 404; error: string }> {
  const text = input.text.trim();
  if (!text) return { ok: false, status: 400, error: 'note is empty' };
  const ids = [...new Set(input.allocationIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return { ok: false, status: 400, error: 'no allocations' };

  return withTenantTransaction(orgId, async (client) => {
    const units = await client.query<{ allocation_id: number; serial_unit_id: number; sku: string | null }>(
      `SELECT oua.id AS allocation_id, oua.serial_unit_id, su.sku
         FROM picking_sessions ps
         JOIN orders o ON o.id = ps.order_id AND o.organization_id = $1
         JOIN order_unit_allocations oua ON oua.order_id = ps.order_id AND oua.organization_id = $1
         JOIN serial_units su ON su.id = oua.serial_unit_id AND su.organization_id = $1
        WHERE ps.id = $2 AND oua.id = ANY($3::int[])`,
      [orgId, input.sessionId, ids],
    );
    if (units.rows.length !== ids.length) {
      return { ok: false as const, status: 404 as const, error: 'allocation not on this session' };
    }
    for (const unit of units.rows) {
      await recordInventoryEvent(
        {
          event_type: 'NOTE',
          actor_staff_id: input.actorStaffId,
          station: 'MOBILE',
          serial_unit_id: unit.serial_unit_id,
          sku: unit.sku,
          notes: text,
          payload: { source: 'picking.note', sessionId: input.sessionId, allocationId: unit.allocation_id },
        },
        client,
        orgId,
      );
    }
    return { ok: true as const, recorded: units.rows.length };
  });
}

export async function completeSession(
  input: { sessionId: number; actorStaffId: number },
  orgId: OrgId,
): Promise<
  { ok: true; stagedTotes: string[] } | { ok: false; status: 404; error: string }
> {
  // ── Org-scoped path:
  if (orgId) {
    return withTenantTransaction<
      { ok: true; stagedTotes: string[] } | { ok: false; status: 404; error: string }
    >(orgId, async (client) => {
      const result = await client.query<{ id: number; order_id: number }>(
        `UPDATE picking_sessions ps
            SET ended_at = NOW()
           FROM orders o
          WHERE ps.id = $1
            AND ps.ended_at IS NULL
            AND o.id = ps.order_id
            AND o.organization_id = $2
        RETURNING ps.id, ps.order_id`,
        [input.sessionId, orgId],
      );
      if (result.rowCount === 0) {
        // A reconnect may replay the command after the original response was
        // lost. A closed, tenant-owned session is success; return its current
        // staged tote projection instead of inventing a second close event.
        const replayQ = await client.query<{ order_id: number }>(
          `SELECT ps.order_id
             FROM picking_sessions ps
             JOIN orders o ON o.id = ps.order_id
            WHERE ps.id = $1
              AND ps.ended_at IS NOT NULL
              AND o.organization_id = $2
            LIMIT 1`,
          [input.sessionId, orgId],
        );
        const replay = replayQ.rows[0];
        if (!replay) {
          return { ok: false, status: 404, error: `session ${input.sessionId} not found` };
        }
        const totesQ = await client.query<{ code: string }>(
          `SELECT code
             FROM handling_units
            WHERE organization_id = $1
              AND paired_order_id = $2
              AND status = 'STAGED'
            ORDER BY id`,
          [orgId, replay.order_id],
        );
        return { ok: true, stagedTotes: totesQ.rows.map((row) => row.code) };
      }
      const orderId = result.rows[0].order_id;

      // Close the pick → pack loop:
      const stagedQ = await client.query<{ code: string }>(
        `UPDATE handling_units
            SET status = 'STAGED'
          WHERE organization_id = $1
            AND paired_order_id = $2
            AND status = 'OPEN'
          RETURNING code`,
        [orgId, orderId],
      );

      // Log the close as a session-level note so audit timelines reflect it.
      await recordInventoryEvent(
        {
          event_type: 'NOTE',
          actor_staff_id: input.actorStaffId,
          station: 'MOBILE',
          payload: {
            source: 'picking.complete',
            sessionId: input.sessionId,
            stagedTotes: stagedQ.rows.map((r) => r.code),
          },
        },
        client,
        orgId,
      );
      await refreshOrderStageFacts(orgId, { orderIds: [orderId] }, client);
      return { ok: true, stagedTotes: stagedQ.rows.map((r) => r.code) };
    });
  }

  // orgId is required; the GUC-scoped path above always returns. The old
  // un-scoped pool.query() fallback was removed — its inventory_events NOTE
  // insert stamped a NULL organization_id and is unreachable now.
  throw new Error('completeSession: orgId is required');
}
