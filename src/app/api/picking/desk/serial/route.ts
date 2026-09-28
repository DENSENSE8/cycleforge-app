import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishTechLogChanged } from '@/lib/realtime/publish';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import {
  getTechSerialsBySalId,
  insertTechSerialForSalContext,
  normalizeTechSerial,
  resolveTechSerialSalContext,
} from '@/lib/tech/insertTechSerialForSalContext';
import { normalizeTrackingKey18, normalizeTrackingLast8 } from '@/lib/tracking-format';
import { buildOrderPayload, findOrderByShipment } from '@/lib/tech/order-card';
import { sqlDeskSessionAnchor } from '@/lib/station-activity';
import { pickDeskSerialUnit, type DeskSerialPickResult } from '@/lib/picking/desk-serial-pick';
import { revertDeskSerialPick, UnpickError, type RevertedUnitPick } from '@/lib/picking/unpick';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * POST /api/picking/desk/serial — the Picker desk's one serial endpoint.
 *
 * Body `{ action, salId?, … }`. `salId` names the desk session anchor; when it
 * is omitted the anchor is resolved server-side:
 * - `add`         `{ serial }` — `salId`, else the staffer's latest desk anchor.
 * - `add-to-last` `{ serial }` — always the staffer's latest desk anchor; the
 *                 answer also carries the active-order card (`order`, `isComplete`).
 * - `undo`        — drop the newest serial; `salId`, else the latest desk anchor.
 * - `update`      `{ serials | serialNumbers }` — replace the set; `salId`, else
 *                 resolved from `fnskuLogId` or `tracking`.
 * - `remove`      `{ salId, tsnId }` — drop one serial row.
 * `add` / `add-to-last` also pick the serial's unit when it holds an open
 * allocation on the desk order (`pickDeskSerialUnit`, same transaction); a
 * unit that can't be picked for this order comes back as `pickWarning`.
 * `undo` / `remove` / `update` reverse that pick for every serial they drop
 * (`revertDeskSerialPick`: unit + allocation back to ALLOCATED, inventory
 * event recorded) and answer `unpicked` (`unpickedUnits` for `update`).
 * Actor is server-derived from the verified session; body.techId is ignored.
 */

const ACTIONS = ['add', 'add-to-last', 'remove', 'update', 'undo'] as const;
type Action = (typeof ACTIONS)[number];

/** Idempotency route key and realtime source — data, not the URL. */
const ROUTE = 'tech.serial';

interface DeskAnchor {
  id: number;
  shipment_id: number | null;
  scan_ref: string | null;
}

class HandlerError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}

type HandlerOutcome =
  | {
      kind: 'add';
      serialNumbers: string[];
      tsnId: number;
      /** Non-null when the scan matched no order — serial held on an exception. */
      ordersExceptionId: number | null;
      attachedToOrder: boolean;
      /** The serial's allocated unit, picked for the desk order in the same transaction. */
      pick: DeskSerialPickResult;
    }
  /** `remove` / `update`: the units whose desk pick the dropped serials reverted. */
  | { kind: 'ok'; serialNumbers: string[]; orderId: number | null; unpicked: RevertedUnitPick[] }
  | {
      kind: 'undo';
      serialNumbers: string[];
      removedSerial: string;
      orderId: number | null;
      unpicked: RevertedUnitPick | null;
    };

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });

  const action = String(body.action || '').toLowerCase() as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ success: false, error: `action must be ${ACTIONS.join('|')}` }, { status: 400 });
  }

  const staffId = ctx.staffId;
  const orgId = ctx.organizationId;
  const isAdd = action === 'add' || action === 'add-to-last';
  const serial = normalizeTechSerial(body.serial || body.serialNumber);
  if (isAdd && !serial) {
    return NextResponse.json({ success: false, error: 'serial is required' }, { status: 400 });
  }

  // ── Resolve the desk session anchor ─────────────────────────────────────
  const bodySalId = Number(body.salId);
  let salId: number | null =
    action !== 'add-to-last' && Number.isFinite(bodySalId) && bodySalId > 0 ? bodySalId : null;
  let anchor: DeskAnchor | undefined;

  if (!salId && action === 'remove') {
    return NextResponse.json({ success: false, error: 'salId is required' }, { status: 400 });
  }

  if (!salId && action === 'update') {
    const fnskuLogId = body.fnskuLogId ? Number(body.fnskuLogId) : null;
    const tracking = String(body.tracking || '').trim();
    if (fnskuLogId) {
      const r = await tenantQuery(
        orgId,
        `SELECT station_activity_log_id FROM fba_fnsku_logs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [fnskuLogId, orgId],
      );
      salId = r.rows[0]?.station_activity_log_id ?? null;
    }
    if (!salId && tracking) {
      // Most recent desk session anchor (pick / FNSKU scan) for this tracking.
      const r = await tenantQuery(
        orgId,
        `SELECT sal.id FROM station_activity_logs sal
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id
         WHERE ${sqlDeskSessionAnchor('sal')}
           AND sal.organization_id = $2
           AND (
             sal.scan_ref = $1
             OR sal.fnsku = $1
             OR stn.tracking_number_raw = $1
             OR UPPER(TRIM(stn.tracking_number_normalized)) = UPPER(TRIM($1))
           )
         ORDER BY sal.created_at DESC LIMIT 1`,
        [tracking, orgId],
      );
      salId = r.rows[0]?.id ?? null;
    }
    if (!salId) {
      return NextResponse.json({ success: false, error: 'Could not resolve scan session for tracking' }, { status: 404 });
    }
  }

  if (!salId) {
    // add / add-to-last / undo: the signed-in staffer's latest desk anchor.
    const r = await tenantQuery(
      orgId,
      `SELECT id, shipment_id, scan_ref FROM station_activity_logs
       WHERE ${sqlDeskSessionAnchor()}
         AND staff_id = $1
         AND organization_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [staffId, orgId],
    );
    anchor = r.rows[0] as DeskAnchor | undefined;
    salId = anchor?.id ?? null;
    if (!salId) {
      return NextResponse.json({ success: false, error: 'No active scan session found' }, { status: 404 });
    }
  }
  const resolvedSalId = salId;

  // ── Apply the serial action (idempotent on body key / header) ──────────
  const serialResult = await (async (): Promise<{ status: number; body: Record<string, unknown> }> => {
    const idemKey = readIdempotencyKey(req, body.idempotencyKey ?? body.clientEventId ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(pool, orgId, idemKey, ROUTE);
      if (hit) return { status: hit.status_code, body: hit.response_body };
    }

    let logAction: 'insert' | 'update' = 'update';
    let outcome: HandlerOutcome;
    try {
      outcome = await withTenantTransaction<HandlerOutcome>(orgId, async (client) => {
        const salCtxResult = await resolveTechSerialSalContext(client, resolvedSalId, orgId);
        if (!salCtxResult.ok) {
          throw new HandlerError(salCtxResult.status, salCtxResult.error);
        }
        const salCtx = salCtxResult.ctx;
        // Serials (tech_serial_numbers.order_id) and unit picks move the order's pick facts.
        const factsTarget = { orderIds: [salCtx.orderId], shipmentIds: [salCtx.shipmentId] };
        // A dropped serial takes its desk pick with it (unit + allocation back
        // to ALLOCATED); a unit the phone picked, or one the serial only
        // re-scanned, stays picked.
        const revertSerialPick = (droppedSerial: string, source: string) =>
          revertDeskSerialPick(client, orgId, {
            serial: droppedSerial,
            orderId: salCtx.orderId,
            shipmentId: salCtx.shipmentId,
            actorStaffId: staffId,
            source,
          });

        if (isAdd) {
          const ins = await insertTechSerialForSalContext(client, {
            organizationId: orgId,
            salContext: salCtx,
            staffId,
            serial,
            source: 'tech.serial',
            sourceMethod: 'SCAN',
          });
          if (!ins.ok) {
            throw new HandlerError(ins.status, ins.error);
          }

          // The serial's unit, when allocated to this desk order, is picked in
          // the same transaction — never blocking the serial add itself.
          const pick = await pickDeskSerialUnit(client, {
            orgId,
            serial: ins.serial,
            orderId: salCtx.orderId,
            shipmentId: salCtx.shipmentId,
            ordersExceptionId: salCtx.ordersExceptionId,
            actorStaffId: staffId,
          });

          await refreshOrderStageFacts(orgId, factsTarget, client);
          const serialNumbers = await getTechSerialsBySalId(client, resolvedSalId);
          logAction = 'insert';
          // Tell the caller WHERE the serial landed.
          return {
            kind: 'add',
            serialNumbers,
            tsnId: ins.techSerialId,
            ordersExceptionId: salCtx.ordersExceptionId,
            attachedToOrder: salCtx.ordersExceptionId == null,
            pick,
          };
        }

        if (action === 'remove') {
          const tsnId = Number(body.tsnId);
          if (!Number.isFinite(tsnId) || tsnId <= 0) {
            throw new HandlerError(400, 'tsnId is required for remove');
          }

          const tsnQ = await client.query<{ serial_number: string | null }>(
            `SELECT serial_number FROM tech_serial_numbers
              WHERE id = $1 AND context_station_activity_log_id = $2 AND organization_id = $3`,
            [tsnId, resolvedSalId, orgId],
          );
          const removed = tsnQ.rows[0]
            ? await revertSerialPick(String(tsnQ.rows[0].serial_number ?? ''), 'pick.desk.remove')
            : null;

          await client.query(
            `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
            [tsnId, orgId],
          );
          await client.query(
            `DELETE FROM tech_serial_numbers WHERE id = $1 AND context_station_activity_log_id = $2 AND organization_id = $3`,
            [tsnId, resolvedSalId, orgId],
          );

          await refreshOrderStageFacts(orgId, factsTarget, client);
          const serialNumbers = await getTechSerialsBySalId(client, resolvedSalId);
          return { kind: 'ok', serialNumbers, orderId: salCtx.orderId, unpicked: removed ? [removed] : [] };
        }

        if (action === 'update') {
          const desiredRaw: unknown[] = Array.isArray(body.serials)
            ? body.serials
            : Array.isArray(body.serialNumbers) ? body.serialNumbers : [];
          const desired = Array.from(new Set(desiredRaw.map(normalizeTechSerial).filter(Boolean)));

          const existing = await client.query(
            `SELECT id, UPPER(TRIM(serial_number)) AS serial FROM tech_serial_numbers
               WHERE context_station_activity_log_id = $1 AND organization_id = $2 ORDER BY id`,
            [resolvedSalId, orgId],
          );
          const existingMap = new Map<string, number>();
          for (const row of existing.rows) existingMap.set(row.serial, row.id);

          const desiredSet = new Set(desired);

          const unpicked: RevertedUnitPick[] = [];
          for (const [existingSerial, id] of existingMap) {
            if (!desiredSet.has(existingSerial)) {
              const reverted = await revertSerialPick(existingSerial, 'pick.desk.update');
              if (reverted) unpicked.push(reverted);
              await client.query(
                `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
                [id, orgId],
              );
              await client.query(
                `DELETE FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2`,
                [id, orgId],
              );
            }
          }

          for (const desiredSerial of desired) {
            if (existingMap.has(desiredSerial)) continue;
            const ins = await insertTechSerialForSalContext(client, {
              organizationId: orgId,
              salContext: salCtx,
              staffId,
              serial: desiredSerial,
              source: 'tech.serial.update',
              sourceMethod: 'SCAN',
            });
            if (!ins.ok) {
              throw new HandlerError(ins.status, ins.error);
            }
          }

          await refreshOrderStageFacts(orgId, factsTarget, client);
          const serialNumbers = await getTechSerialsBySalId(client, resolvedSalId);
          return { kind: 'ok', serialNumbers, orderId: salCtx.orderId, unpicked };
        }

        // undo
        const last = await client.query(
          `SELECT id, serial_number FROM tech_serial_numbers
             WHERE context_station_activity_log_id = $1 AND organization_id = $2 ORDER BY id DESC LIMIT 1`,
          [resolvedSalId, orgId],
        );
        if (last.rows.length === 0) {
          throw new HandlerError(400, 'No serials to undo');
        }
        const lastRow = last.rows[0];
        const unpicked = await revertSerialPick(String(lastRow.serial_number ?? ''), 'pick.desk.undo');
        await client.query(
          `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
          [lastRow.id, orgId],
        );
        await client.query(
          `DELETE FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2`,
          [lastRow.id, orgId],
        );

        await refreshOrderStageFacts(orgId, factsTarget, client);
        const serialNumbers = await getTechSerialsBySalId(client, resolvedSalId);
        return {
          kind: 'undo',
          serialNumbers,
          removedSerial: lastRow.serial_number,
          orderId: salCtx.orderId,
          unpicked,
        };
      });
    } catch (err) {
      if (err instanceof HandlerError || err instanceof UnpickError) {
        const failBody = { success: false, error: err.message };
        if (idemKey && err.status < 500) {
          await saveApiIdempotencyResponse(pool, {
            orgId,
            idempotencyKey: idemKey,
            route: ROUTE,
            staffId,
            statusCode: err.status,
            responseBody: failBody,
          });
        }
        return { status: err.status, body: failBody };
      }
      throw err;
    }

    await invalidateCacheTags(['desk-pick-logs', 'orders-next', 'orders']);
    await publishTechLogChanged({ organizationId: orgId, techId: staffId, action: logAction, source: 'tech.serial' });
    if (outcome.kind === 'add' && outcome.pick.kind === 'picked') {
      // A committed pick repaints the To-ship Pick column — same event as the unit scan.
      const pickedOrderId = outcome.pick.orderId;
      after(() => publishOrderPickFacts(orgId, [pickedOrderId], 'pick.desk.serial'));
    } else if (outcome.kind !== 'add') {
      // A dropped serial can move the order's pick fact (a serial is a pick
      // signal; its unit may have been un-picked) — re-state it.
      const units = outcome.kind === 'undo' ? (outcome.unpicked ? [outcome.unpicked] : []) : outcome.unpicked;
      const orderIds = [outcome.orderId, ...units.map((u) => u.orderId)];
      const source = outcome.kind === 'undo' ? 'pick.desk.undo' : `pick.desk.${action}`;
      after(() => publishOrderPickFacts(orgId, orderIds, source));
    }

    let okBody: Record<string, unknown>;
    if (outcome.kind === 'add') {
      okBody = {
        success: true,
        serialNumbers: outcome.serialNumbers,
        tsnId: outcome.tsnId,
        attachedToOrder: outcome.attachedToOrder,
        ordersExceptionId: outcome.ordersExceptionId,
        ...(outcome.attachedToOrder
          ? {}
          : {
              warning:
                'Serial recorded against an open exception — the scanned tracking number matched no order.',
            }),
        ...(outcome.pick.kind === 'warning' ? { pickWarning: outcome.pick.warning } : {}),
      };
    } else if (outcome.kind === 'undo') {
      okBody = {
        success: true,
        serialNumbers: outcome.serialNumbers,
        removedSerial: outcome.removedSerial,
        unpicked: outcome.unpicked,
      };
    } else if (action === 'remove') {
      okBody = { success: true, serialNumbers: outcome.serialNumbers, unpicked: outcome.unpicked[0] ?? null };
    } else {
      okBody = { success: true, serialNumbers: outcome.serialNumbers, unpickedUnits: outcome.unpicked };
    }

    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId,
        idempotencyKey: idemKey,
        route: ROUTE,
        staffId,
        statusCode: 200,
        responseBody: okBody,
      });
    }
    return { status: 200, body: okBody };
  })();

  const data = serialResult.body;
  if (action !== 'add-to-last' || serialResult.status !== 200 || !data?.success) {
    return NextResponse.json(data, { status: serialResult.status });
  }

  // add-to-last success — resolve the active-order card so the client can
  // restore it. Degrade-not-block: if resolution fails, still report success
  // (the serial was written) and let the client fall back gracefully.
  const serialNumbers: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const tracking = String(anchor?.scan_ref || '').trim();
  const attachedToOrder = data.attachedToOrder !== false;
  let order = null;
  try {
    const orderRow = await withTenantConnection(orgId, (client) =>
      findOrderByShipment(
        client,
        anchor?.shipment_id ?? null,
        tracking ? normalizeTrackingKey18(tracking) : null,
        tracking ? normalizeTrackingLast8(tracking) : null,
        orgId,
      ),
    );
    order = buildOrderPayload(orderRow, {
      tracking: orderRow?.shipping_tracking_number || tracking,
      serialNumbers,
      orderFound: Boolean(orderRow) && attachedToOrder,
    });
  } catch (err) {
    console.error('desk serial add-to-last order resolve failed:', err);
  }

  const quantity = Number(order?.quantity) || 1;
  const orderFound = Boolean(order) && attachedToOrder;
  return NextResponse.json({
    success: true,
    serialNumbers,
    order,
    attachedToOrder,
    ordersExceptionId: data.ordersExceptionId ?? null,
    warning: data.warning,
    pickWarning: data.pickWarning,
    // Never celebrate "complete" for an exception hold session.
    isComplete: orderFound && serialNumbers.length >= quantity,
  });
}, { permission: 'picking.scan' });
