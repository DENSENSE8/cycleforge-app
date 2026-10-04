import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { publishTransferLedgerEvents, transferBinQty } from '@/lib/neon/location-queries';
import { recordInventoryEvent } from '@/lib/inventory/events';
import {
  readIdempotencyKey,
  withIdempotencyClaim,
} from '@/lib/api-idempotency';
import { TransfersBody } from '@/lib/schemas/locations';
import { parseBody } from '@/lib/schemas/parse';
import { withAuth } from '@/lib/auth/withAuth';

const ROUTE_TRANSFERS = 'transfers.post';

/** POST /api/transfers Body: */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => ({}));

  // ─── Schema validation (defense-in-depth) ───────────────────────────────
  const parsed = parseBody(TransfersBody, body);
  if (parsed instanceof NextResponse) return parsed;

  const fromBarcode = String(body?.fromBinBarcode || '').trim();
  const toBarcode = String(body?.toBinBarcode || '').trim();
  const sku = String(body?.sku || '').trim();
  const qty = Number(body?.qty);
  const reasonCodeId =
    Number.isFinite(Number(body?.reasonCodeId)) && Number(body?.reasonCodeId) > 0
      ? Math.floor(Number(body?.reasonCodeId))
      : null;
  const notes = String(body?.notes || '').trim() || null;
  // Server-trusted actor — body.staffId is ignored.
  const staffId = ctx.staffId;
  // Server-trusted tenant — every read/write below is scoped to this org.
  const orgId = ctx.organizationId;

  const idempotencyKey = readIdempotencyKey(
    request,
    body?.clientEventId ?? body?.idempotencyKey,
  );
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'Idempotency-Key is required' }, { status: 400 });
  }

  // ─── Permission gate is handled by withAuth({ permission: 'bin.adjust' }) ─

  // ─── Validate ──────────────────────────────────────────────────────────
  if (!fromBarcode || !toBarcode) {
    return NextResponse.json({ error: 'fromBinBarcode and toBinBarcode are required' }, { status: 400 });
  }
  if (fromBarcode.toUpperCase() === toBarcode.toUpperCase()) {
    return NextResponse.json({ error: 'fromBinBarcode and toBinBarcode must differ' }, { status: 400 });
  }
  if (!sku) {
    return NextResponse.json({ error: 'sku is required' }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: 'qty must be a positive integer' }, { status: 400 });
  }
  const transferQty = Math.floor(qty);

  const claimed = await withIdempotencyClaim<Record<string, unknown>>(pool, {
    orgId,
    idempotencyKey,
    route: ROUTE_TRANSFERS,
    staffId,
  }, async () => {
    try {
      const result = await transferBinQty({
        fromBarcode,
        toBarcode,
        sku,
        qty: transferQty,
        staffId,
        reasonCodeId,
        notes,
      }, orgId);
      // The move is committed: realtime fan-out and the activity event run
      // after the response so the phone's receipt does not wait on them.
      after(async () => {
        await publishTransferLedgerEvents(result, { orgId, staffId });
        await recordInventoryEvent({
          event_type: 'MOVED',
          actor_staff_id: staffId,
          station: 'MOBILE',
          bin_id: result.toBin.id,
          prev_bin_id: result.fromBin.id,
          sku: result.sku,
          notes,
          payload: {
            action: 'bin_transfer',
            from_bin: result.fromBin.barcode ?? fromBarcode,
            to_bin: result.toBin.barcode ?? toBarcode,
            qty: result.qty,
          },
        }, undefined, orgId).catch((err) => {
          console.warn('transfers: inventory_events insert failed (non-fatal)', err);
        });
      });
      return {
        status: 200,
        body: {
          success: true,
          from_bin: result.fromBin,
          to_bin: result.toBin,
          sku: result.sku,
          qty: result.qty,
          source_qty: result.sourceQty,
          destination_qty: result.destinationQty,
          receipt: { commandId: idempotencyKey },
        },
      };
    } catch (error) {
      const typed = error as Error & { code?: string; available?: number; requested?: number };
      if (typed.code === 'INSUFFICIENT_QTY') {
        return {
          status: 409,
          body: {
            error: 'INSUFFICIENT_QTY',
            message: typed.message,
            available: typed.available,
            requested: typed.requested,
          },
        };
      }
      if (/not found/i.test(typed.message)) {
        return { status: 404, body: { error: typed.message } };
      }
      throw error;
    }
  });
  return NextResponse.json(claimed.body, { status: claimed.status });
}, { permission: 'bin.adjust' });
