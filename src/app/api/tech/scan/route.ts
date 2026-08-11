import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getApiIdempotencyResponse, readIdempotencyKey, saveApiIdempotencyResponse } from '@/lib/api-idempotency';
import { createStationScanSession } from '@/lib/station-scan-session';
import { normalizeTrackingKey18, normalizeTrackingLast8 } from '@/lib/tracking-format';
import { upsertOpenOrderException } from '@/lib/orders-exceptions';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateFbaViews } from '@/lib/fba/invalidation';
import { formatPSTTimestamp } from '@/utils/date';
import { publishActivityLogged, publishOrderTested, publishTechLogChanged } from '@/lib/realtime/publish';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { mergeSerialsFromTsnRows } from '@/lib/tech/serialFields';
import { buildOrderPayload, findOrderByShipment } from '@/lib/tech/order-card';
import { createFbaLog } from '@/lib/fba/createFbaLog';
import { buildFbaPlanRefFromIsoDate } from '@/lib/fba/plan-ref';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { scheduleEnsureOutboundDocsOnPackReady } from '@/lib/documents/ensure-outbound-docs';
import {
  PackPlacementError,
  placeOrderAtLocation,
} from '@/lib/packing/pack-placement';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

const ROUTE = 'tech.scan';
type ScanSourceStation = 'TECH' | 'FBA';

function resolveScanSourceStation(value: unknown): ScanSourceStation {
  return String(value || '').trim().toUpperCase() === 'FBA' ? 'FBA' : 'TECH';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveStaff(db: typeof pool, techId: number) {
  const r = await db.query(`SELECT id, name FROM staff WHERE id = $1 LIMIT 1`, [techId]);
  return r.rows[0] as { id: number; name: string } | undefined;
}

/** Get existing serials linked to a SAL anchor row. */
async function getSerialsBySalId(db: typeof pool, salId: number): Promise<string[]> {
  const r = await db.query(
    `SELECT serial_number FROM tech_serial_numbers
     WHERE context_station_activity_log_id = $1 ORDER BY id`,
    [salId],
  );
  return mergeSerialsFromTsnRows(r.rows);
}

async function getScannedSkuCodes(
  db: typeof pool,
  params: { shipmentId?: number | null; trackingValue?: string | null },
): Promise<string[]> {
  const shipmentId = params.shipmentId ?? null;
  const trackingValue = String(params.trackingValue || '').trim();
  if (!shipmentId && !trackingValue) return [];

  const r = await db.query(
    `SELECT DISTINCT BTRIM(static_sku) AS static_sku
     FROM v_sku
     WHERE (shipment_id = $1)
        OR ($2::text <> '' AND BTRIM(COALESCE(shipping_tracking_number, '')) = BTRIM($2))
     ORDER BY BTRIM(static_sku) ASC`,
    [shipmentId, trackingValue],
  );

  return r.rows
    .map((row) => String(row.static_sku || '').trim())
    .filter(Boolean);
}

/** Find existing FNSKU in catalog. */
async function findFnsku(db: typeof pool, orgId: OrgId, fnsku: string) {
  const r = await db.query(
    `SELECT fnsku, product_title, asin, sku FROM fba_fnskus
     WHERE UPPER(TRIM(fnsku)) = $1 AND organization_id = $2 LIMIT 1`,
    [fnsku.toUpperCase().trim(), orgId],
  );
  return r.rows[0] ?? null;
}

/** Ensure FNSKU exists in catalog; creates a stub row when missing. */
async function ensureFnskuCatalog(db: typeof pool, orgId: OrgId, fnsku: string) {
  const normalized = fnsku.toUpperCase().trim();
  const existing = await findFnsku(db, orgId, normalized);
  if (existing) {
    await db.query(
      `UPDATE fba_fnskus
       SET is_active = TRUE, last_seen_at = NOW(), updated_at = NOW()
       WHERE fnsku = $1 AND organization_id = $2`,
      [normalized, orgId],
    );
    return { catalog: existing, catalogCreated: false };
  }

  const inserted = await db.query(
    `INSERT INTO fba_fnskus (fnsku, product_title, asin, sku, is_active, last_seen_at, updated_at, organization_id)
     VALUES ($1, NULL, NULL, NULL, TRUE, NOW(), NOW(), $2)
     ON CONFLICT (organization_id, fnsku) DO UPDATE
       SET is_active = TRUE, last_seen_at = NOW(), updated_at = NOW()
     RETURNING fnsku, product_title, asin, sku`,
    [normalized, orgId],
  );

  return {
    catalog: inserted.rows[0] ?? { fnsku: normalized, product_title: null, asin: null, sku: null },
    catalogCreated: true,
  };
}

/** Find open FBA shipment item for this FNSKU. */
async function findOpenFbaItem(db: typeof pool, orgId: OrgId, fnsku: string) {
  const r = await db.query(
    `SELECT si.id AS item_id, si.shipment_id AS shipment_id,
            fs.shipment_ref, si.expected_qty, si.actual_qty, si.status
     FROM fba_shipment_items si
     JOIN fba_shipments fs ON fs.id = si.shipment_id AND fs.organization_id = $2
     WHERE si.fnsku = $1 AND si.organization_id = $2
       AND fs.status IN ('PLANNED','TESTED','PACKED','LABEL_ASSIGNED')
     ORDER BY fs.created_at DESC, si.id DESC LIMIT 1`,
    [fnsku.toUpperCase().trim(), orgId],
  );
  return r.rows[0] ?? null;
}

/** Count FBA lifecycle stages for this FNSKU. */
async function fnskuStageCounts(db: typeof pool, orgId: OrgId, fnsku: string) {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE source_stage = 'TECH'  AND event_type = 'SCANNED') AS tech_scanned_qty,
       COUNT(*) FILTER (WHERE source_stage = 'PACK'  AND event_type = 'READY')   AS pack_ready_qty,
       COUNT(*) FILTER (WHERE source_stage = 'SHIP'  AND event_type = 'SHIPPED') AS shipped_qty
     FROM fba_fnsku_logs WHERE fnsku = $1 AND organization_id = $2`,
    [fnsku.toUpperCase().trim(), orgId],
  );
  const row = r.rows[0] ?? {};
  const tech = Number(row.tech_scanned_qty) || 0;
  const pack = Number(row.pack_ready_qty) || 0;
  const shipped = Number(row.shipped_qty) || 0;
  return { tech_scanned_qty: tech, pack_ready_qty: pack, shipped_qty: shipped, available_to_ship: tech - shipped };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({ headers: req.headers, routeKey: 'tech-scan', limit: 120, windowMs: 60_000, organizationId: ctx.organizationId });
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
  const salStation = sourceStation;
  const isFbaSource = sourceStation === 'FBA';
  const packLocationIdRaw = body.packLocationId ?? body.pack_location_id;
  const packLocationId =
    packLocationIdRaw != null && Number.isFinite(Number(packLocationIdRaw))
      ? Number(packLocationIdRaw)
      : null;
  const packLocationBarcode = String(
    body.packLocationBarcode || body.pack_location_barcode || '',
  ).trim() || null;
  if (!value) return NextResponse.json({ success: false, found: false, error: 'Scan value is required' }, { status: 400 });

  // Explicit type override or auto-detect
  const explicitType = String(body.type || '').toUpperCase();
  const isFnsku = explicitType === 'FNSKU' || (!explicitType && looksLikeFnsku(value));
  const scanType = isFnsku ? 'FNSKU' : (explicitType || 'TRACKING');

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
    // GUC is set for every fba_* read/write (mirrors src/app/api/fba/items/scan).
    return await withTenantTransaction(ctx.organizationId, async (client) => {
      // ── FNSKU path ─────────────────────────────────────────────────────
      if (scanType === 'FNSKU') {
        const fnsku = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const { catalog, catalogCreated } = await ensureFnskuCatalog(client as any, ctx.organizationId, fnsku);

        const testDateTime = formatPSTTimestamp();
        let fbaItem = await findOpenFbaItem(client as any, ctx.organizationId, fnsku);

        // Testing station: a tech FNSKU scan means "tested". Advance an open
        // PLANNED item to TESTED, or add the FNSKU to today's plan as TESTED
        // when none exists ("add or update"). FBA-workspace/plan scans use a
        // different endpoint and intentionally stay PLANNED.
        if (!isFbaSource) {
          if (fbaItem && String(fbaItem.status) === 'PLANNED') {
            const upd = await client.query(
              `UPDATE fba_shipment_items
                 SET status = 'TESTED'::fba_shipment_status_enum,
                     ready_by_staff_id = COALESCE(ready_by_staff_id, $1),
                     ready_at = COALESCE(ready_at, NOW()),
                     updated_at = NOW()
               WHERE id = $2 AND organization_id = $3
               RETURNING id, shipment_id, expected_qty, actual_qty, status`,
              [testedBy, fbaItem.item_id, ctx.organizationId],
            );
            if (upd.rows[0]) {
              fbaItem = {
                ...fbaItem,
                item_id: Number(upd.rows[0].id),
                shipment_id: Number(upd.rows[0].shipment_id),
                expected_qty: Number(upd.rows[0].expected_qty),
                actual_qty: Number(upd.rows[0].actual_qty),
                status: String(upd.rows[0].status),
              };
            }
          } else if (!fbaItem) {
            let plan = await client.query(
              `SELECT id, shipment_ref FROM fba_shipments
                WHERE due_date = CURRENT_DATE AND status = 'PLANNED' AND organization_id = $1
                ORDER BY created_at DESC LIMIT 1`,
              [ctx.organizationId],
            );
            let planId: number; let planRef: string | null;
            if (plan.rows.length === 0) {
              const d = await client.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
              const ref = buildFbaPlanRefFromIsoDate(String(d.rows[0]?.d || ''));
              const np = await client.query(
                `INSERT INTO fba_shipments (shipment_ref, due_date, status, organization_id)
                 VALUES ($1, CURRENT_DATE, 'PLANNED', $2) RETURNING id, shipment_ref`,
                [ref, ctx.organizationId],
              );
              planId = Number(np.rows[0].id); planRef = np.rows[0].shipment_ref;
            } else {
              planId = Number(plan.rows[0].id); planRef = plan.rows[0].shipment_ref;
            }
            const ni = await client.query(
              `INSERT INTO fba_shipment_items
                 (shipment_id, fnsku, product_title, asin, sku, expected_qty, actual_qty, status, ready_by_staff_id, ready_at, organization_id)
               VALUES ($1, $2, $3, $4, $5, 1, 1, 'TESTED', $6, NOW(), $7)
               ON CONFLICT (shipment_id, fnsku) DO UPDATE
                 SET status = CASE WHEN fba_shipment_items.status = 'PLANNED'
                                   THEN 'TESTED'::fba_shipment_status_enum
                                   ELSE fba_shipment_items.status END,
                     updated_at = NOW()
               RETURNING id, shipment_id, expected_qty, actual_qty, status`,
              [planId, fnsku, catalog.product_title, catalog.asin, catalog.sku, testedBy, ctx.organizationId],
            );
            fbaItem = {
              item_id: Number(ni.rows[0].id),
              shipment_id: planId,
              shipment_ref: planRef,
              expected_qty: Number(ni.rows[0].expected_qty),
              actual_qty: Number(ni.rows[0].actual_qty),
              status: String(ni.rows[0].status),
            };
          }
        }

        // 1. SAL row (SoT)
        const salId = await createStationActivityLog(client, {
          organizationId: ctx.organizationId,
          station: salStation,
          activityType: 'FNSKU_SCANNED',
          staffId: testedBy,
          fnsku,
          fbaShipmentId: fbaItem?.shipment_id ?? null,
          fbaShipmentItemId: fbaItem?.item_id ?? null,
          notes: isFbaSource ? 'FBA workspace FNSKU scan' : 'Tech FNSKU scan',
          metadata: { source: stationSource, product_title: catalog.product_title, sku: catalog.sku, asin: catalog.asin },
          createdAt: testDateTime,
        });

        // 2. fba_fnsku_logs row (FK to SAL)
        const fnskuLogId = await createFbaLog(client, ctx.organizationId, {
          fnsku,
          sourceStage: isFbaSource ? 'FBA' : 'TECH',
          eventType: 'SCANNED',
          staffId: testedBy,
          stationActivityLogId: salId!,
          fbaShipmentId: fbaItem?.shipment_id ?? null,
          fbaShipmentItemId: fbaItem?.item_id ?? null,
          station: isFbaSource ? 'FBA_WORKSPACE' : 'TECH_STATION',
          notes: isFbaSource ? 'FBA workspace FNSKU scan' : undefined,
          metadata: { source: stationSource, product_title: catalog.product_title, sku: catalog.sku, asin: catalog.asin },
        });

        // Get existing serials for this session
        const serials = salId ? await getSerialsBySalId(client as any, salId) : [];
        const scannedSkuCodes = await getScannedSkuCodes(client as any, { trackingValue: fnsku });
        const summary = await fnskuStageCounts(client as any, ctx.organizationId, fnsku);

        await client.query('COMMIT');
        // A tech/FBA FNSKU scan always mutates fba_shipment_items (advance an open
        // item PLANNED→TESTED, or insert a new TESTED row), so bust the full FBA
        // read set (board / today / stage-counts, dual-fired legacy + org-scoped).
        // A tech-station scan is additionally a tech-log / order event; an
        // FBA-workspace scan is not.
        await invalidateFbaViews(
          ctx.organizationId,
          isFbaSource ? [] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.techLogs, CACHE_TAGS.orderDetail],
        );
        if (!isFbaSource) {
          await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: fnskuLogId!, source: ROUTE });
        }
        if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: salStation, activityType: 'FNSKU_SCANNED', staffId: testedBy, scanRef: null, fnsku, source: stationSource }).catch(() => {});

        const scanSessionId = await createStationScanSession(pool, {
          staffId: testedBy,
          sessionKind: 'FNSKU',
          fnsku,
          trackingRaw: fnsku,
          trackingKey18: normalizeTrackingKey18(fnsku),
          scanRef: fnsku,
        });

        const out = {
          success: true,
          found: true,
          orderFound: false,
          catalogCreated,
          catalogMessage: catalogCreated
            ? 'Added to catalog. You can fill in product details later.'
            : null,
          salId,
          fnskuLogId,
          techActivityId: salId,
          scanSessionId,
          summary,
          shipment: fbaItem ? {
            shipment_id: fbaItem.shipment_id,
            shipment_ref: fbaItem.shipment_ref ?? null,
            item_id: fbaItem.item_id,
            expected_qty: fbaItem.expected_qty,
            actual_qty: fbaItem.actual_qty,
            status: fbaItem.status,
          } : null,
          order: buildOrderPayload(null, {
            orderId: 'FNSKU',
            productTitle: catalog.product_title || fnsku,
            sku: catalog.sku || 'N/A',
            condition: 'FBA Scan',
            tracking: fnsku,
            serialNumbers: serials,
            scannedSkuCodes,
            testDateTime,
            testedBy,
            accountSource: 'fba',
            asin: catalog.asin || null,
            createdAt: testDateTime,
          }),
        };
        if (idemKey) await saveApiIdempotencyResponse(pool, { orgId: ctx.organizationId, idempotencyKey: idemKey, route: ROUTE, staffId: testedBy, statusCode: 200, responseBody: out });
        return NextResponse.json(out);
      }

      // ── TRACKING path ──────────────────────────────────────────────────
      const resolved = await resolveShipmentId(value, ctx.organizationId);
      const key18 = normalizeTrackingKey18(value);
      const last8Raw = normalizeTrackingLast8(value);
      const last8 = /^\d{8}$/.test(last8Raw) && !looksLikeFnsku(value) ? last8Raw : null;
      const order = await findOrderByShipment(client as any, resolved.shipmentId, key18, last8, ctx.organizationId);

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
          station: salStation,
          activityType: 'TRACKING_SCANNED',
          staffId: testedBy,
          shipmentId: resolved.shipmentId ?? null,
          scanRef: resolved.scanRef ?? value,
          ordersExceptionId,
          notes: isFbaSource ? 'FBA tracking scan without matched order' : 'Tracking scan without matched order',
          metadata: { source: stationSource, order_found: false, tracking: value },
          createdAt: testDateTime,
        });

        await client.query('COMMIT');
        await invalidateCacheTags(isFbaSource ? ['fba-stage-counts'] : ['orders', 'orders-next', 'tech-logs']);
      await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.techLogs, CACHE_TAGS.orderDetail]);
        await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.techLogs, CACHE_TAGS.orderDetail]);
        if (salId && !isFbaSource) await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: salId, source: ROUTE });
        if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: salStation, activityType: 'TRACKING_SCANNED', staffId: testedBy, scanRef: resolved.scanRef ?? value, fnsku: null, source: stationSource }).catch(() => {});

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

      // Ready-to-Pack TRACKING always loads the order (serials can follow).
      // Bench placement is optional: only when a packing DESK/STAGING is armed
      // (or a barcode is sent). No arm → plain tracking scan, no place.
      let packPlacement: Awaited<ReturnType<typeof placeOrderAtLocation>> | null = null;

      const salId = await createStationActivityLog(client, {
        organizationId: ctx.organizationId,
        station: salStation,
        activityType: 'TRACKING_SCANNED',
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
      const existingSerials = salId ? await getSerialsBySalId(client as any, salId) : [];
      const scannedSkuCodes = await getScannedSkuCodes(client as any, {
        shipmentId: matchedShipmentId,
        trackingValue,
      });

      await client.query('COMMIT');
      await invalidateCacheTags(isFbaSource ? ['fba-stage-counts'] : ['orders', 'orders-next', 'tech-logs']);
      await invalidateCacheTags(ctx.organizationId, isFbaSource ? [CACHE_TAGS.fbaStageCounts] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.techLogs, CACHE_TAGS.orderDetail]);
      if (salId && !isFbaSource) await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: salId, source: ROUTE });
      if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: salStation, activityType: 'TRACKING_SCANNED', staffId: testedBy, scanRef: resolved.scanRef ?? value, fnsku: null, source: stationSource }).catch(() => {});
      if (!isFbaSource) {
        await publishOrderTested({
          organizationId: ctx.organizationId,
          orderId: Number(order.id),
          testedBy,
          source: ROUTE,
          packLocationId: packPlacement?.locationId ?? null,
          packLocationName: packPlacement?.locationName ?? null,
        });
        if (packPlacement) {
          await recordAudit(pool, ctx, req, {
            source: 'tech-scan',
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
}, { permission: 'tech.scan_serial' });
