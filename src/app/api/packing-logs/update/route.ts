import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishActivityLogged, publishPackerLogChanged, publishOrderChanged } from '@/lib/realtime/publish';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { normalizePSTTimestamp } from '@/utils/date';
import { createStationActivityLog } from '@/lib/station-activity';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { publishStockLedgerEvent } from '@/lib/realtime/publish';
import { withAuth } from '@/lib/auth/withAuth';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { mirrorLegacyPackingToAllocations } from '@/lib/inventory/sync-legacy-pack';
import { attachPhotoWithLegacyUrl } from '@/lib/photos/service';
import { PACKER_BOX_LABEL_PHOTO_TYPE } from '@/lib/photos/types';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';
import pool from '@/lib/db';
import { createPackerLog, finalizePackerLogCapture } from '@/lib/packing/packer-log-writer';
import { releasePackedTotes } from '@/lib/picking/tote-scan';

class PackFinalizeRequestError extends Error {}

/** The signed-in actor's staff id — a positive integer, never aliased. */
function sessionStaffId(rawId: string | number | null | undefined): number | null {
  const numeric = Number(String(rawId ?? '').trim());
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

const PACKING_LOGS_UPDATE_ROUTE = 'packing-logs.update';

/** Update packer_logs table (mobile app after photos are uploaded). */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const idempotencyKey = readIdempotencyKey(
    req,
    body.idempotencyKey ?? body.clientEventId ?? body.client_event_id ?? null,
  );

  const out = await withIdempotencyClaim(pool, {
    orgId: ctx.organizationId,
    idempotencyKey,
    route: PACKING_LOGS_UPDATE_ROUTE,
    staffId: sessionStaffId(ctx.staffId),
  }, async () => {
    const res = await (async (): Promise<NextResponse> => {
  try {
    const {
      shippingTrackingNumber,
      trackingType,
      packDateTime,
      packerPhotosUrl,
      orderId,
      draftPackerLogId: rawDraftPackerLogId,
    } = body;
    // Server-trusted actor.
    const packedBy = ctx.staffId;

    // Validation
    if (!shippingTrackingNumber) {
      return NextResponse.json({ error: 'shippingTrackingNumber is required' }, { status: 400 });
    }
    if (!trackingType) {
      return NextResponse.json({ error: 'trackingType is required' }, { status: 400 });
    }
    const draftPackerLogId = Number(rawDraftPackerLogId);
    const isDraftFinalization = rawDraftPackerLogId != null;
    if (isDraftFinalization && (!Number.isSafeInteger(draftPackerLogId) || draftPackerLogId <= 0)) {
      return NextResponse.json({ error: 'draftPackerLogId must be a positive integer' }, { status: 400 });
    }
    if (!isDraftFinalization && (!Array.isArray(packerPhotosUrl) || packerPhotosUrl.length === 0)) {
      return NextResponse.json({ error: 'packerPhotosUrl must be a non-empty array' }, { status: 400 });
    }

    const staffId = sessionStaffId(packedBy);

    if (!staffId) {
      return NextResponse.json({ error: 'Invalid packer ID' }, { status: 400 });
    }

    const canonicalPackDate = normalizePSTTimestamp(packDateTime, { fallbackToNow: true })!;

    const photoUrlList: string[] = Array.isArray(packerPhotosUrl)
      ? packerPhotosUrl.filter((u: any) => typeof u === 'string' && u.trim())
      : [];

    // Run the whole write inside the per-org GUC transaction (app.current_org) so RLS isolates every tenant-table touch.
    type TxResult =
      | { deduplicated: true; existingId: number }
      | {
          deduplicated: false;
          packerLogId: number | undefined;
          ledgerRows: Array<{ id: number; sku: string; delta: number }>;
          updatedRows: Array<{ id: number; order_id: string | number | null }>;
          photosCount: number;
          stationActivityId: number | null;
        };

    const txResult = await withTenantTransaction<TxResult>(ctx.organizationId, async (client) => {
      // 1. Resolve shipment_id, then write through the canonical packer-log boundary.
      const { shipmentId: resolvedShipmentId, scanRef: resolvedScanRef } =
        await resolveShipmentId(shippingTrackingNumber, ctx.organizationId);

      let packerLogId: number | undefined;
      let photosCount = photoUrlList.length;

      if (isDraftFinalization) {
        // A CAPTURING record is photo-evidence storage, not a packed fact. Lock
        // it before looking at its photo links so two Finish taps cannot turn
        // one capture into two completion ledger events.
        const draft = await client.query<{
          id: number;
          shipment_id: number | null;
          tracking_type: string;
          completion_state: string;
        }>(
          `SELECT id, shipment_id, tracking_type, completion_state
             FROM packer_logs
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE`,
          [draftPackerLogId, ctx.organizationId],
        );
        const row = draft.rows[0];
        if (!row) throw new PackFinalizeRequestError('Packing session was not found. Start packing again.');
        if (row.tracking_type !== 'ORDERS') {
          throw new PackFinalizeRequestError('Only an order packing session can be finalized here.');
        }
        if (row.shipment_id == null || resolvedShipmentId == null || Number(row.shipment_id) !== Number(resolvedShipmentId)) {
          throw new PackFinalizeRequestError('The scanned tracking number does not match this packing session.');
        }
        if (row.completion_state === 'COMPLETED') {
          return { deduplicated: true, existingId: row.id };
        }
        if (row.completion_state !== 'CAPTURING') {
          throw new PackFinalizeRequestError('This packing session is no longer available to finish.');
        }

        const photoCount = await client.query<{ count: string }>(
          `SELECT COUNT(DISTINCT p.id)::text AS count
             FROM photos p
             INNER JOIN photo_entity_links l
               ON l.photo_id = p.id
              AND l.organization_id = p.organization_id
            WHERE l.entity_type = 'PACKER_LOG'
              AND l.entity_id = $1
              AND l.link_role = 'primary'
              AND p.organization_id = $2`,
          [row.id, ctx.organizationId],
        );
        photosCount = Number(photoCount.rows[0]?.count ?? 0);
        if (photosCount < 1) {
          throw new PackFinalizeRequestError('Capture at least one packing photo before finishing.');
        }

        const finalized = await finalizePackerLogCapture(client, {
          organizationId: ctx.organizationId,
          packerLogId: row.id,
          packedBy: staffId,
          shipmentId: row.shipment_id,
          scanRef: resolvedScanRef,
          source: PACKING_LOGS_UPDATE_ROUTE,
        });
        if (!finalized) {
          throw new PackFinalizeRequestError('This packing session changed while it was being finished. Try again.');
        }
        packerLogId = finalized.id;
      }

      // Idempotency: the mobile flow auto-finalizes when uploads complete AND tapping "Done" calls this endpoint.
      const dupCheck = isDraftFinalization ? { rows: [] as Array<{ id: number }> } : await client.query<{ id: number }>(
        `SELECT pl.id
           FROM packer_logs pl
          WHERE pl.scan_ref = $1
            AND pl.packed_by = $2
            AND pl.tracking_type = $3
            AND pl.completion_state = 'COMPLETED'
            AND pl.created_at > NOW() - INTERVAL '5 minutes'
            AND pl.organization_id = $4
            AND EXISTS (
              SELECT 1
                FROM photos p
                INNER JOIN photo_entity_links l
                  ON l.photo_id = p.id
                 AND l.organization_id = p.organization_id
               WHERE l.entity_type = 'PACKER_LOG'
                 AND l.entity_id = pl.id
                 AND l.link_role = 'primary'
                 AND p.organization_id = pl.organization_id
            )
          ORDER BY pl.id DESC
          LIMIT 1`,
        [resolvedScanRef, staffId, trackingType, ctx.organizationId],
      );

      if (dupCheck.rows.length > 0) {
        const existingId = dupCheck.rows[0].id;
        // No writes occurred; COMMIT of this read-only tx is harmless.
        return { deduplicated: true, existingId };
      }

      const insertedLog = packerLogId == null
        ? await createPackerLog(client, {
            organizationId: ctx.organizationId,
            shipmentId: resolvedShipmentId,
            scanRef: resolvedScanRef,
            trackingType,
            createdAt: canonicalPackDate,
            packedBy: staffId,
            source: PACKING_LOGS_UPDATE_ROUTE,
          })
        : null;

      packerLogId ??= insertedLog?.id;

      if (packerLogId) {
        await mirrorLegacyPackingToAllocations({
          packerLogId,
          shipmentId: resolvedShipmentId ?? null,
          actorStaffId: staffId,
        }, ctx.organizationId);
      }

      const salId = await createStationActivityLog(client, {
        organizationId: ctx.organizationId,
        station: 'PACK',
        activityType: 'PACK_COMPLETED',
        staffId,
        shipmentId: resolvedShipmentId ?? null,
        scanRef: resolvedScanRef ?? shippingTrackingNumber,
        packerLogId,
        notes: 'Mobile pack scan',
        metadata: {
          source: 'packing-logs.update',
          tracking_type: trackingType,
          photos_count: photosCount,
          ...(ctx.session.deviceKind === 'phone'
            ? {
                origin: 'phone',
                surface: `/m/p/${packerLogId}/photos`,
                client_event_id: idempotencyKey ?? (String(body.clientEventId ?? '').trim() || null),
                ...(Number.isSafeInteger(Number(body.mobileScanEventId)) && Number(body.mobileScanEventId) > 0
                  ? { mobile_scan_event_id: Number(body.mobileScanEventId) }
                  : null),
                subject_entity_type: 'shipment',
                subject_id: String(resolvedShipmentId ?? packerLogId ?? shippingTrackingNumber),
                subject_identifier: String(orderId ?? shippingTrackingNumber),
              }
            : null),
        },
        createdAt: canonicalPackDate,
      });
      await refreshOrderStageFacts(ctx.organizationId, { shipmentIds: [resolvedShipmentId] }, client);
      // Server-trusted audit: actor/org/ip come from ctx + request headers.
      // Entity-type literals are kept as-is — dashboards key off them.
      await recordAudit(client, ctx, req, {
        source: 'api.packing-logs.update',
        action: AUDIT_ACTION.PACK_COMPLETED,
        entityType: resolvedShipmentId ? 'SHIPMENT' : 'PACKER_LOG',
        entityId: String(resolvedShipmentId ?? packerLogId ?? shippingTrackingNumber),
        stationActivityLogId: salId,
        method: 'scan',
        extra: {
          tracking_type: trackingType,
          photos_count: photosCount,
          order_id: orderId ?? null,
        },
      });

      // 2. Insert photo URLs into the unified photos table
      if (!isDraftFinalization && packerLogId && photoUrlList.length > 0) {
        for (const url of photoUrlList) {
          await attachPhotoWithLegacyUrl({
            organizationId: ctx.organizationId,
            staffId,
            entityType: 'PACKER_LOG',
            entityId: packerLogId,
            legacyUrl: url,
            photoType: PACKER_BOX_LABEL_PHOTO_TYPE,
            idempotent: true,
          });
        }
      }

      // 3. Packing is not carrier handoff. The final SHIPPED status is written
      // only by the dock scan-out path after the carton physically leaves.
      const updateResult = await client.query<{ id: number; order_id: string | number | null }>(`
        UPDATE orders
        SET status = 'packed'
        WHERE shipment_id = $1
          AND shipment_id IS NOT NULL
          AND (status IS NULL OR status != 'packed')
          AND organization_id = $2
        RETURNING id, order_id
      `, [resolvedShipmentId, ctx.organizationId]);

      if (updateResult.rows.length === 0) {
        // Fallback: match via shipping_tracking_numbers join for legacy unlinked rows
        const fallbackUpdate = await client.query<{ id: number; order_id: string | number | null }>(`
          UPDATE orders o
          SET status = 'packed'
          FROM shipping_tracking_numbers stn
          WHERE o.shipment_id = stn.id
            AND RIGHT(regexp_replace(UPPER(stn.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 8)
                = RIGHT(regexp_replace(UPPER($1), '[^A-Z0-9]', '', 'g'), 8)
            AND (o.status IS NULL OR o.status != 'packed')
            AND o.organization_id = $2
          RETURNING o.id, o.order_id
        `, [shippingTrackingNumber, ctx.organizationId]);
        if (fallbackUpdate.rows.length > 0) {
          const targetOrderId = fallbackUpdate.rows[0].id;
          await client.query(`
            INSERT INTO work_assignments
                (organization_id, entity_type, entity_id, work_type, assigned_packer_id,
                 completed_by_packer_id, status, priority, notes, completed_at)
            VALUES ($1, 'ORDER', $2, 'PACK', $3, $3, 'DONE', 100, 'Auto-completed on mobile pack scan', NOW())
            ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT}
            DO UPDATE
                SET assigned_packer_id     = EXCLUDED.assigned_packer_id,
                    completed_by_packer_id = EXCLUDED.completed_by_packer_id,
                    status                 = 'DONE',
                    completed_at           = NOW(),
                    updated_at             = NOW()
            WHERE work_assignments.organization_id = $1
          `, [ctx.organizationId, targetOrderId, staffId]);
          await releasePackedTotes(ctx.organizationId, {
            orderId: targetOrderId,
            shipmentId: resolvedShipmentId,
          }, client);
        }
        return { deduplicated: false, packerLogId, stationActivityId: salId, ledgerRows: [], updatedRows: fallbackUpdate.rows, photosCount };
      } else {
        const targetOrderId = updateResult.rows[0].id;
        await client.query(`
          INSERT INTO work_assignments
              (organization_id, entity_type, entity_id, work_type, assigned_packer_id,
               completed_by_packer_id, status, priority, notes, completed_at)
          VALUES ($1, 'ORDER', $2, 'PACK', $3, $3, 'DONE', 100, 'Auto-completed on mobile pack scan', NOW())
          ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT}
          DO UPDATE
              SET assigned_packer_id     = EXCLUDED.assigned_packer_id,
                  completed_by_packer_id = EXCLUDED.completed_by_packer_id,
                  status                 = 'DONE',
                  completed_at           = NOW(),
                  updated_at             = NOW()
          WHERE work_assignments.organization_id = $1
        `, [ctx.organizationId, targetOrderId, staffId]);
        await releasePackedTotes(ctx.organizationId, { shipmentId: resolvedShipmentId }, client);
      }

      // 4. Emit PACKED ledger rows per SKU in the shipment.
      const ledgerRows: Array<{ id: number; sku: string; delta: number }> = [];
      if (resolvedShipmentId) {
        const ledgerResult = await client.query<{ id: number; sku: string; delta: number }>(
          `INSERT INTO sku_stock_ledger
             (sku, delta, reason, dimension, staff_id,
              ref_packer_log_id, ref_shipment_id, notes, organization_id)
           SELECT
             q.sku,
             SUM(q.qty_int)::int,
             'PACKED',
             'BOXED',
             $1,
             $2,
             $3,
             $4,
             $5::uuid
           FROM (
             SELECT
               o.sku,
               COALESCE(
                 NULLIF(regexp_replace(COALESCE(o.quantity, ''), '[^0-9-]', '', 'g'), '')::int,
                 1
               ) AS qty_int
             FROM orders o
             WHERE o.shipment_id = $3
               AND o.sku IS NOT NULL
               AND BTRIM(o.sku) <> ''
               AND o.organization_id = $5
           ) q
           GROUP BY q.sku
           RETURNING id, sku, delta`,
          [staffId, packerLogId, resolvedShipmentId, 'Mobile pack scan', ctx.organizationId],
        );
        ledgerRows.push(...ledgerResult.rows);
      }

      return { deduplicated: false, packerLogId, stationActivityId: salId, ledgerRows, updatedRows: updateResult.rows, photosCount };
    });

    if (txResult.deduplicated) {
      return NextResponse.json({
        success: true,
        message: 'Packer log already finalized (idempotent)',
        packerLogId: txResult.existingId,
        ordersUpdated: 0,
        trackingNumber: shippingTrackingNumber,
        trackingType,
        photosCount: photoUrlList.length,
        deduplicated: true,
      });
    }

    const { packerLogId, stationActivityId, ledgerRows, updatedRows, photosCount } = txResult;
    if (stationActivityId != null) {
      await publishActivityLogged({
        organizationId: ctx.organizationId,
        id: stationActivityId,
        station: 'PACK',
        activityType: 'PACK_COMPLETED',
        staffId,
        scanRef: shippingTrackingNumber,
        source: 'packing-logs.update',
      }).catch(() => {});
    }

    // Publish one Ably event per ledger row so ActivityFeed updates live.
    for (const row of ledgerRows) {
      try {
        await publishStockLedgerEvent({
          organizationId: ctx.organizationId,
          ledgerId: row.id,
          sku: row.sku,
          delta: row.delta,
          reason: 'PACKED',
          dimension: 'BOXED',
          staffId,
          source: 'packing-logs.update',
        });
      } catch (err) {
        console.warn('[packing-logs.update] realtime publish failed', err);
      }
    }

    await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'orders', 'orders-next', 'shipped']);

    // Build packer-log row for live surgical insert on all subscribed web sessions.
    const shippedOrderId = updatedRows[0]?.id ?? null;  // may be null for unlinked rows
    const packerRow = {
      id: packerLogId,
      created_at: canonicalPackDate,
      shipping_tracking_number: shippingTrackingNumber,
      packed_by: staffId,
      order_id: updatedRows[0]?.order_id ?? null,
      product_title: null,
      quantity: null,
      condition: null,
      sku: null,
      photos: photoUrlList,
    };
    await publishPackerLogChanged({
      organizationId: ctx.organizationId,
      packerId: staffId,
      action: 'insert',
      packerLogId,
      row: packerRow,
      source: 'packing-logs.update',
    });
    if (shippedOrderId) {
      await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [shippedOrderId], source: 'packing-logs.update' });
    }

    return NextResponse.json({
      success: true,
      message: 'Packer logs updated and order marked as packed',
      packerLogId,
      ordersUpdated: updatedRows.length,
      trackingNumber: shippingTrackingNumber,
      trackingType,
      photosCount
    });

  } catch (error: any) {
    console.error('Error updating packer_logs:', error);
    return NextResponse.json({
      error: 'Failed to update packer_logs',
      details: error.message
    }, { status: error instanceof PackFinalizeRequestError ? 400 : 500 });
  }
    })();
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  });
  return NextResponse.json(out.body, { status: out.status });
}, { permission: 'packing.complete_order' });
