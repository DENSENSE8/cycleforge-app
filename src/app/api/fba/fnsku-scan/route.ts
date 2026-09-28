import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { getApiIdempotencyResponse, readIdempotencyKey, saveApiIdempotencyResponse } from '@/lib/api-idempotency';
import { createStationScanSession } from '@/lib/station-scan-session';
import { normalizeTrackingKey18 } from '@/lib/tracking-format';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateFbaViews } from '@/lib/fba/invalidation';
import { formatPSTTimestamp } from '@/utils/date';
import { publishActivityLogged, publishTechLogChanged } from '@/lib/realtime/publish';
import { createStationActivityLog } from '@/lib/station-activity';
import { buildOrderPayload } from '@/lib/tech/order-card';
import {
  getScannedSkuCodes,
  getSerialsBySalId,
  resolveScanSourceStation,
  resolveStaff,
} from '@/lib/picking/desk-scan';
import { createFbaLog } from '@/lib/fba/createFbaLog';
import { buildFbaPlanRefFromIsoDate } from '@/lib/fba/plan-ref';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Persisted SAL `metadata.source`, realtime source and idempotency route key —
 * data, not the URL. Rows written before 2026-09-27 carry 'tech.scan'.
 */
const ROUTE = 'fba.fnsku-scan';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find existing FNSKU in catalog. */
async function findFnsku(db: PoolClient, orgId: OrgId, fnsku: string) {
  const r = await db.query(
    `SELECT fnsku, product_title, asin, sku FROM fba_fnskus
     WHERE UPPER(TRIM(fnsku)) = $1 AND organization_id = $2 LIMIT 1`,
    [fnsku.toUpperCase().trim(), orgId],
  );
  return r.rows[0] ?? null;
}

/** Ensure FNSKU exists in catalog; creates a stub row when missing. */
async function ensureFnskuCatalog(db: PoolClient, orgId: OrgId, fnsku: string) {
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
async function findOpenFbaItem(db: PoolClient, orgId: OrgId, fnsku: string) {
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
async function fnskuStageCounts(db: PoolClient, orgId: OrgId, fnsku: string) {
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

/**
 * POST /api/fba/fnsku-scan — FNSKU desk scan: ensures the catalog row, adds the
 * unit to today's FBA plan (testing station source), writes the TECH (or FBA)
 * FNSKU_SCANNED anchor + its fba_fnsku_logs SCANNED row.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({ headers: req.headers, routeKey: 'fba-fnsku-scan', limit: 120, windowMs: 60_000, organizationId: ctx.organizationId });
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
  if (!value) return NextResponse.json({ success: false, found: false, error: 'Scan value is required' }, { status: 400 });

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
      const fnsku = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const { catalog, catalogCreated } = await ensureFnskuCatalog(client, ctx.organizationId, fnsku);

      const testDateTime = formatPSTTimestamp();
      let fbaItem = await findOpenFbaItem(client, ctx.organizationId, fnsku);

      // Testing station:
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
        station: sourceStation,
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
      const serials = salId ? await getSerialsBySalId(client, salId) : [];
      const scannedSkuCodes = await getScannedSkuCodes(client, { trackingValue: fnsku });
      const summary = await fnskuStageCounts(client, ctx.organizationId, fnsku);

      await client.query('COMMIT');
      // A tech/FBA FNSKU scan always mutates fba_shipment_items (advance an open item PLANNED→TESTED, or insert a new TESTED row), so bust the…
      await invalidateFbaViews(
        ctx.organizationId,
        isFbaSource ? [] : [CACHE_TAGS.orders, CACHE_TAGS.ordersNext, CACHE_TAGS.deskPickLogs, CACHE_TAGS.orderDetail],
      );
      if (!isFbaSource) {
        await publishTechLogChanged({ organizationId: ctx.organizationId, techId: testedBy, action: 'insert', rowId: fnskuLogId!, source: ROUTE });
      }
      if (salId) publishActivityLogged({ organizationId: ctx.organizationId, id: salId, station: sourceStation, activityType: 'FNSKU_SCANNED', staffId: testedBy, scanRef: null, fnsku, source: stationSource }).catch(() => {});

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
          sku: catalog.sku || 'N/A', // ds-allow-na: FNSKU scan API payload writer
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scan failed';
    console.error('Error in FNSKU scan:', error);
    return NextResponse.json({ success: false, found: false, error: 'Scan failed', details: message }, { status: 500 });
  }
}, { permission: 'tech.scan_serial' });
