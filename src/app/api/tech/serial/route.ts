import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
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
import { withAuth } from '@/lib/auth/withAuth';

type Action = 'add' | 'remove' | 'update' | 'undo';

const ROUTE = 'tech.serial';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });

  const action = String(body.action || '').toLowerCase() as Action;
  const salId = Number(body.salId);
  // Server-trusted actor — body.techId is ignored.
  const techId = ctx.staffId;

  if (!['add', 'remove', 'update', 'undo'].includes(action)) {
    return NextResponse.json({ success: false, error: 'action must be add|remove|update|undo' }, { status: 400 });
  }
  if (!Number.isFinite(salId) || salId <= 0) {
    return NextResponse.json({ success: false, error: 'salId is required' }, { status: 400 });
  }

  const idemKey = readIdempotencyKey(req, body.idempotencyKey ?? body.clientEventId ?? null);
  if (idemKey) {
    const hit = await getApiIdempotencyResponse(pool, ctx.organizationId, idemKey, ROUTE);
    if (hit) {
      return NextResponse.json(hit.response_body, { status: hit.status_code });
    }
  }

  try {
    const staffId = techId;

    // Tenant-scoped transaction:
    type HandlerOutcome =
      | {
          kind: 'add';
          serialNumbers: string[];
          tsnId: number;
          /** Non-null when the scan matched no order — serial held on an exception. */
          ordersExceptionId: number | null;
          attachedToOrder: boolean;
        }
      | { kind: 'ok'; serialNumbers: string[] }
      | { kind: 'undo'; serialNumbers: string[]; removedSerial: string };

    class HandlerError extends Error {
      constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'HandlerError';
      }
    }

    let logAction: 'insert' | 'update' = 'update';

    let outcome: HandlerOutcome;
    try {
      outcome = await withTenantTransaction<HandlerOutcome>(ctx.organizationId, async (client) => {
        const salCtxResult = await resolveTechSerialSalContext(client, salId, ctx.organizationId);
        if (!salCtxResult.ok) {
          throw new HandlerError(salCtxResult.status, salCtxResult.error);
        }
        const salCtx = salCtxResult.ctx;

      if (action === 'add') {
        const serial = normalizeTechSerial(body.serial);
        const ins = await insertTechSerialForSalContext(client, {
          organizationId: ctx.organizationId,
          salContext: salCtx,
          staffId,
          serial,
          source: 'tech.serial',
          sourceMethod: 'SCAN',
        });
        if (!ins.ok) {
          throw new HandlerError(ins.status, ins.error);
        }

        const serialNumbers = await getTechSerialsBySalId(client, salId);
        logAction = 'insert';
        // Tell the caller WHERE the serial landed.
        return {
          kind: 'add',
          serialNumbers,
          tsnId: ins.techSerialId,
          ordersExceptionId: salCtx.ordersExceptionId,
          attachedToOrder: salCtx.ordersExceptionId == null,
        };
      }

      if (action === 'remove') {
        const tsnId = Number(body.tsnId);
        if (!Number.isFinite(tsnId) || tsnId <= 0) {
          throw new HandlerError(400, 'tsnId is required for remove');
        }

        await client.query(
          `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
          [tsnId, ctx.organizationId],
        );
        await client.query(
          `DELETE FROM tech_serial_numbers WHERE id = $1 AND context_station_activity_log_id = $2 AND organization_id = $3`,
          [tsnId, salId, ctx.organizationId],
        );

        const serialNumbers = await getTechSerialsBySalId(client, salId);
        return { kind: 'ok', serialNumbers };
      }

      if (action === 'update') {
        const desiredRaw: unknown[] = Array.isArray(body.serials) ? body.serials : [];
        const desired = Array.from(new Set(desiredRaw.map(normalizeTechSerial).filter(Boolean)));

        const existing = await client.query(
          `SELECT id, UPPER(TRIM(serial_number)) AS serial FROM tech_serial_numbers
           WHERE context_station_activity_log_id = $1 AND organization_id = $2 ORDER BY id`,
          [salId, ctx.organizationId],
        );
        const existingMap = new Map<string, number>();
        for (const row of existing.rows) existingMap.set(row.serial, row.id);

        const desiredSet = new Set(desired);

        for (const [serial, id] of existingMap) {
          if (!desiredSet.has(serial)) {
            await client.query(
              `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
              [id, ctx.organizationId],
            );
            await client.query(
              `DELETE FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2`,
              [id, ctx.organizationId],
            );
          }
        }

        for (const serial of desired) {
          if (existingMap.has(serial)) continue;
          const ins = await insertTechSerialForSalContext(client, {
            organizationId: ctx.organizationId,
            salContext: salCtx,
            staffId,
            serial,
            source: 'tech.serial.update',
            sourceMethod: 'SCAN',
          });
          if (!ins.ok) {
            throw new HandlerError(ins.status, ins.error);
          }
        }

        const serialNumbers = await getTechSerialsBySalId(client, salId);
        return { kind: 'ok', serialNumbers };
      }

      if (action === 'undo') {
        const last = await client.query(
          `SELECT id, serial_number FROM tech_serial_numbers
           WHERE context_station_activity_log_id = $1 AND organization_id = $2 ORDER BY id DESC LIMIT 1`,
          [salId, ctx.organizationId],
        );
        if (last.rows.length === 0) {
          throw new HandlerError(400, 'No serials to undo');
        }
        const lastRow = last.rows[0];
        await client.query(
          `DELETE FROM station_activity_logs WHERE tech_serial_number_id = $1 AND activity_type = 'SERIAL_ADDED' AND organization_id = $2`,
          [lastRow.id, ctx.organizationId],
        );
        await client.query(
          `DELETE FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2`,
          [lastRow.id, ctx.organizationId],
        );

        const serialNumbers = await getTechSerialsBySalId(client, salId);
        return { kind: 'undo', serialNumbers, removedSerial: lastRow.serial_number };
      }

      throw new HandlerError(400, 'Unknown action');
      });
    } catch (err) {
      if (err instanceof HandlerError) {
        const failBody = { success: false, error: err.message };
        if (idemKey && err.status < 500) {
          await saveApiIdempotencyResponse(pool, {
            orgId: ctx.organizationId,
            idempotencyKey: idemKey,
            route: ROUTE,
            staffId,
            statusCode: err.status,
            responseBody: failBody,
          });
        }
        return NextResponse.json(failBody, { status: err.status });
      }
      throw err;
    }

    await invalidateCacheTags(['tech-logs', 'orders-next']);
    await publishTechLogChanged({ organizationId: ctx.organizationId, techId: staffId, action: logAction, source: 'tech.serial' });

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
      };
    } else if (outcome.kind === 'undo') {
      okBody = { success: true, serialNumbers: outcome.serialNumbers, removedSerial: outcome.removedSerial };
    } else {
      okBody = { success: true, serialNumbers: outcome.serialNumbers };
    }

    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE,
        staffId,
        statusCode: 200,
        responseBody: okBody,
      });
    }
    return NextResponse.json(okBody);
  } catch (error: any) {
    console.error('Error in tech serial:', error);
    return NextResponse.json({ success: false, error: 'Failed', details: error.message }, { status: 500 });
  }
}, { permission: 'tech.scan_serial' });
