import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getApiIdempotencyResponse, readIdempotencyKey, saveApiIdempotencyResponse } from '@/lib/api-idempotency';
import { createStationScanSession } from '@/lib/station-scan-session';
import { normalizeTrackingKey18, normalizeTrackingLast8 } from '@/lib/tracking-format';
import { upsertOpenOrderException } from '@/lib/orders-exceptions';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { formatPSTTimestamp } from '@/utils/date';
import { publishActivityLogged, publishOrderPicked, publishTechLogChanged } from '@/lib/realtime/publish';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { buildOrderPayload, findOrderByShipment } from '@/lib/tech/order-card';
import {
  getScannedSkuCodes,
  getSerialsBySalId,
  resolveScanSourceStation,
  resolveStaff,
} from '@/lib/picking/desk-scan';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { scheduleEnsureOutboundDocsOnPackReady } from '@/lib/documents/ensure-outbound-docs';
import {
  type OrderPackPlacement,
  PackPlacementError,
  placeOrderAtLocation,
} from '@/lib/packing/pack-placement';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/**
 * Persisted SAL `metadata.source`, realtime source and idempotency route key —
 * data, not the URL. Rows written before 2026-09-27 carry 'tech.scan'.
 */
const ROUTE = 'picking.desk.scan';

/**
 * POST /api/picking/desk/scan — the Picker desk's tracking scan: loads the
 * order card, writes the PICK / PICK_SCANNED anchor (FBA source keeps
 * FBA / TRACKING_SCANNED), optionally places the order at an armed pack bench.
 * FNSKU scans go to `POST /api/fba/fnsku-scan`.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({ headers: req.headers, routeKey: 'picking-desk-scan', limit: 120, windowMs: 60_000, organizationId: ctx.organizationId });
  if (!rate.ok) {
    return NextResponse.json({ success: false, found: false, error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, found: false, error: 'Invalid JSON' }, { status: 400 });

  const value = String(body.value || body.tracking || '').trim();
  // Server-trusted actor — body.techId is ignored for attribution.
  const techId = ctx.staffId;
  const sourceStation = resolveScanSourceStation(body.sourceStation);
  const stationSource = sourceStation === 'FBA' ? 'fba.scan' : ROUTE;
  const isFbaSource = sourceStation === 'FBA';
  // The desk's tracking scan is a PICK (units taken for the order), not a test.
  // FBA tracking scans stay FBA/TRACKING_SCANNED.
  const trackingSalStation = isFbaSource ? 'FBA' : 'PICK';
  const trackingActivityType = isFbaSource ? 'TRACKING_SCANNED' : 'PICK_SCANNED';
  const packLocationIdRaw = body.packLocationId ?? body.pack_location_id;
  const packLocationId =
    packLocationIdRaw != null && Number.isFinite(Number(packLocationIdRaw))
      ? Number(packLocationIdRaw)
      : null;
  const packLocationBarcode = String(
    body.packLocationBarcode || body.pack_location_barcode || '',
  ).trim() || null;
  if (!value) return NextResponse.json({ success: false, found: false, error: 'Scan value is required' }, { status: 400 });

  const explicitType = String(body.type || '').toUpperCase();
  if (explicitType === 'FNSKU' || (!explicitType && looksLikeFnsku(value))) {
    return NextResponse.json(
      { success: false, found: false, error: 'FNSKU scans go to POST /api/fba/fnsku-scan' },
      { status: 400 },
    );
  }

  const idemKey = readIdempotencyKey(req, body.idempotencyKey);
  if (idemKey) {
    const hit = await getApiIdempotencyResponse(pool, ctx.organizationId, idemKey, ROUTE);
    if (hit?.status_code === 200) return NextResponse.json(hit.response_body);
  }

  try {
    const staff = await resolveStaff(pool, techId);
    if (!staff) return NextResponse.json({ success: false, found: false, error: 'Staff not found' }, { status: 404 });
    const testedBy = staff.id;

    // Wrap the write path in a tenant transaction so the `app.current_org`
    // GUC is set for every read/write.
    return await withTenantTransaction(ctx.organizationId, async (client) => {
      const resolved = await resolveShipmentId(value, ctx.organizationId);
      const key18 = normalizeTrackingKey18(value);
      const last8Raw = normalizeTrackingLast8(value);
      const last8 = /^\d{8}$/.test(last8Raw) && !looksLikeFnsku(value) ? last8Raw : null;
      const order = await findOrderByShipment(client, resolved.shipmentId, key18, last8, ctx.organizationId);

      if (!order) {
        // No order found — create exception + SAL
        let ordersExceptionId: number | null = null;
        const upsertResult = await upsertOpenOrderException({
          organizationId: ctx.organizationId,
          shippingTrackingNumber: value,
          sourceStation: isFbaSource ? 'fba' : 'tech',
          staffId: testedBy,
          staffName: staff.name,
          reason: 'not_found',
          notes: isFbaSource ? 'FBA scan: tracking not found in orders' : 'Tech scan: tracking not found in orders',
        }, client, ctx.organizationId);
        ordersExceptionId = upsertResult.exception?.id ?? null;

        const testDateTime = formatPSTTimestamp();
        const salId = await createStationActivityLog(client, {
          organizationId: ctx.organizationId,
          station: trackingSalStation,
          activityType: trackingActivityType,
          staffId: testedBy,
          shipmentId: resolved.shipmentId ?? null,
          scanRef: resolved.scanRef ?? value,
          ordersExceptionId,
          notes: isFbaSource ? 'FBA tracking scan without matched order' : 'Pick scan without matched order',
          metadata: { source: stationSource, order_found: false, tracking: value },
          createdAt: testDateTime,
        });

        await client.query('COMMIT');
        await invalidateCacheTags(isFbaSource ? ['fba-stage-counts'] : ['orders', 'orders-next', 'desk-pick-logs']);
      await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.deskPickLogs, CACHE_TAGS.orderDetail]);
        await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.deskPickLogs, CACHE_TAGS.orderDetail]);
        if (salId && !isFbaSource) await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: salId, source: ROUTE });
        if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: trackingSalStation, activityType: trackingActivityType, staffId: testedBy, scanRef: resolved.scanRef ?? value, fnsku: null, source: stationSource }).catch(() => {});

        const scanSessionId = await createStationScanSession(pool, {
          staffId: testedBy,
          sessionKind: 'EXCEPTION',
          shipmentId: resolved.shipmentId ?? null,
          ordersExceptionId,
          trackingKey18: key18,
          trackingRaw: value,
          scanRef: resolved.scanRef ?? value,
        });

        const out = {
          success: true,
          found: true,
          orderFound: false,
          salId,
          techActivityId: salId,
          scanSessionId,
          warning: 'Tracking number not found in orders. Added to exceptions.',
          order: buildOrderPayload(null, {
            tracking: value,
            testDateTime,
            testedBy,
            notes: 'Tracking recorded in orders_exceptions for reconciliation',
          }),
        };
        if (idemKey) await saveApiIdempotencyResponse(pool, { orgId: ctx.organizationId, idempotencyKey: idemKey, route: ROUTE, staffId: testedBy, statusCode: 200, responseBody: out });
        return NextResponse.json(out);
      }

      // Order found — create/update SAL
      const matchedShipmentId = order.shipment_id != null ? Number(order.shipment_id) : (resolved.shipmentId ?? null);
      const trackingValue = order.shipping_tracking_number || value;
      const testDateTime = formatPSTTimestamp();
      const pickedAt = new Date().toISOString();

      // Ready-to-Pack TRACKING always loads the order (serials can follow).
      // Bench placement is optional: only when a packing DESK/STAGING is armed
      // (or a barcode is sent). No arm → plain tracking scan, no place.
      let packPlacement: OrderPackPlacement | null = null;

      const salId = await createStationActivityLog(client, {
        organizationId: ctx.organizationId,
        station: trackingSalStation,
        activityType: trackingActivityType,
        staffId: testedBy,
        shipmentId: matchedShipmentId,
        scanRef: resolved.scanRef ?? value,
        metadata: {
          source: stationSource,
          order_found: true,
          order_id: order.order_id,
          order_row_id: Number(order.id),
          tracking: trackingValue,
          pack_location_id: packLocationId,
          pack_location_barcode: packLocationBarcode,
        },
        createdAt: testDateTime,
      });

      if (!isFbaSource && (packLocationId != null || packLocationBarcode)) {
        packPlacement = await placeOrderAtLocation(
          ctx.organizationId,
          {
            orderId: Number(order.id),
            locationId: packLocationId,
            barcode: packLocationBarcode,
            staffId: testedBy,
            source: 'tech_scan',
          },
          client,
        );
      }

      // Get existing serials for this shipment (via any SAL row for same shipment)
      const existingSerials = salId ? await getSerialsBySalId(client, salId) : [];
      const scannedSkuCodes = await getScannedSkuCodes(client, {
        shipmentId: matchedShipmentId,
        trackingValue,
      });

      await client.query('COMMIT');
      await invalidateCacheTags(isFbaSource ? ['fba-stage-counts'] : ['orders', 'orders-next', 'desk-pick-logs']);
      await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.deskPickLogs, CACHE_TAGS.orderDetail]);
      if (salId && !isFbaSource) await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: salId, source: ROUTE });
      if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: trackingSalStation, activityType: trackingActivityType, staffId: testedBy, scanRef: resolved.scanRef ?? value, fnsku: null, source: stationSource }).catch(() => {});
      if (!isFbaSource) {
        await publishOrderPicked({
          organizationId: ctx.organizationId,
          orderId: Number(order.id),
          pickedBy: testedBy,
          pickedByName: staff.name,
          pickedAt,
          source: ROUTE,
          packLocationId: packPlacement?.locationId ?? null,
          packLocationName: packPlacement?.locationName ?? null,
        });
        if (packPlacement) {
          await recordAudit(pool, ctx, req, {
            source: 'picking-desk-scan',
            action: AUDIT_ACTION.ORDER_PACK_PLACE,
            entityType: AUDIT_ENTITY.ORDER,
            entityId: Number(order.id),
            after: { ...packPlacement },
          });
        }
        // JIT Phase 4: pre-fetch outbound docs while packer queue warms (print stays on pack).
        scheduleEnsureOutboundDocsOnPackReady(
          ctx.organizationId,
          Number(order.id),
          'pack_ready.tech_scan',
        );
      }

      const scanSessionId = await createStationScanSession(pool, {
        staffId: testedBy,
        sessionKind: 'ORDER',
        shipmentId: matchedShipmentId,
        trackingKey18: key18,
        trackingRaw: value,
        scanRef: resolved.scanRef ?? trackingValue,
      });

      const out = {
        success: true,
        found: true,
        orderFound: true,
        salId,
        techActivityId: salId,
        techSerialId: null,
        scanSessionId,
        packPlacement,
        order: buildOrderPayload(order, {
          tracking: trackingValue,
          serialNumbers: existingSerials,
          scannedSkuCodes,
          testDateTime,
          testedBy,
        }),
      };
      if (idemKey) await saveApiIdempotencyResponse(pool, { orgId: ctx.organizationId, idempotencyKey: idemKey, route: ROUTE, staffId: testedBy, statusCode: 200, responseBody: out });
      return NextResponse.json(out);
    });
  } catch (error: unknown) {
    if (error instanceof PackPlacementError) {
      return NextResponse.json(
        {
          success: false,
          found: true,
          orderFound: true,
          error: error.message,
          code: error.code,
        },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Scan failed';
    console.error('Error in tech scan:', error);
    return NextResponse.json({ success: false, found: false, error: 'Scan failed', details: message }, { status: 500 });
  }
}, { permission: 'picking.scan' });
