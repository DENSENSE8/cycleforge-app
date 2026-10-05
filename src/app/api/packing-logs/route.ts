import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { classifyScan } from '@/utils/packer';
import { normalizeSku } from '@/utils/sku';
import { upsertOpenOrderException } from '@/lib/orders-exceptions';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { createCacheLookupKey, getCachedJson, invalidateCacheTags, setCachedJson } from '@/lib/cache/upstash-cache';
import { normalizePSTTimestamp, getCurrentPSTDateKey } from '@/utils/date';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { publishActivityLogged, publishOrderChanged, publishPackerLogChanged, publishPackerScanReady } from '@/lib/realtime/publish';
import { ensureReplenishmentForOrder } from '@/lib/replenishment';
import { withAuth } from '@/lib/auth/withAuth';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { buyerNoteHoldBody, readBuyerNoteHold } from '@/lib/orders/buyer-note-interlock';
import { mirrorLegacyPackingToAllocations } from '@/lib/inventory/sync-legacy-pack';
import { attachPhotoWithLegacyUrl } from '@/lib/photos/service';
import { PACKER_BOX_LABEL_PHOTO_TYPE } from '@/lib/photos/types';
import { writeLedgerDelta } from '@/lib/inventory/write-ledger-delta';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';
import type { ScanClassification } from '@/utils/packer';
import { createPackerLog, touchPackerLog } from '@/lib/packing/packer-log-writer';
import { packScanNoTrackingError, resolvePackScan } from '@/lib/packing/pack-scan-order';
import { releasePackedTotes } from '@/lib/picking/tote-scan';

/** The order a tote / unit pack scan named, in the tracking ladder's row shape. */
interface PackScanOrderRow {
    id: number;
    order_id: string | null;
    tracking_number: string | null;
    shipment_id: number | null;
    product_title: string | null;
    condition: string | null;
    quantity: number | string | null;
    sku: string | null;
}

/** LEGACY packer aliases — the old station UI sent packer "1/2/3", which meant staff 4/5/6. */
const LEGACY_PACKER_ALIAS_TO_STAFF_ID: Record<string, number> = {
    '1': 4,
    '2': 5,
    '3': 6,
};

/** Explicit legacy `?packerId=` filter values only — see the warning above. */
function resolveLegacyPackerParam(rawId: string | number | null | undefined): number | null {
    const normalized = String(rawId ?? '').trim();
    if (!normalized) return null;

    if (LEGACY_PACKER_ALIAS_TO_STAFF_ID[normalized]) {
        return LEGACY_PACKER_ALIAS_TO_STAFF_ID[normalized];
    }

    return sessionStaffId(normalized);
}

/** The signed-in actor's staff id — a positive integer, never aliased. */
function sessionStaffId(rawId: string | number | null | undefined): number | null {
    const numeric = Number(String(rawId ?? '').trim());
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function _packTierFromCleanSize(cleanSize?: ScanClassification['cleanSize']): 'SMALL' | 'MEDIUM' | 'LARGE' | null {
    if (!cleanSize) return null;
    if (cleanSize === 'BIG') return 'LARGE';
    if (cleanSize === 'MEDIUM') return 'MEDIUM';
    if (cleanSize === 'SMALL') return 'SMALL';
    return null;
}

/** Compute Sun–Sat PST week range from the current server time (matches client). */
function getCurrentPSTWeekRange(): { startStr: string; endStr: string } {
    const dateKey = getCurrentPSTDateKey();
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const daysFromSunday = date.getDay();
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - daysFromSunday);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startStr: fmt(sunday), endStr: fmt(saturday) };
}

/**
 * Prepend a single new PackerRecord to the current week's Redis cache for this
 * packer (keyed by staffId + week) without invalidating the whole list.
 */
async function prependToPackerLogsCache(staffId: number, newRecord: Record<string, unknown>, orgId: string) {
    const { startStr, endStr } = getCurrentPSTWeekRange();
    const cacheKey = createCacheLookupKey({
        org: orgId,
        packerId: String(staffId),
        limit: 1000,
        offset: 0,
        weekStart: startStr,
        weekEnd: endStr,
    });
    const existing = await getCachedJson<any[]>('api:packing-logs', cacheKey);
    if (Array.isArray(existing)) {
        await setCachedJson(
            'api:packing-logs',
            cacheKey,
            [newRecord, ...existing].slice(0, 1000),
            120,
            ['packing-logs'],
        );
    }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { searchParams } = new URL(req.url);
    // Admin-style filter `?packerId=` can still pin to a specific packer
    // (requires admin.view_logs); otherwise default to the signed-in staff.
    const packerIdParam = searchParams.get('packerId');
    const isAdminFilter = packerIdParam && ctx.permissions.has('admin.view_logs');
    // Only the explicit legacy param may be aliased; the session actor never is.
    const staffId = isAdminFilter && packerIdParam
        ? resolveLegacyPackerParam(packerIdParam)
        : sessionStaffId(ctx.staffId);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    if (!staffId) {
        return NextResponse.json({ error: 'Invalid packer ID' }, { status: 400 });
    }
    const cacheLookup = createCacheLookupKey({ org: ctx.organizationId, packerId: String(staffId), limit, offset });

    const cached = await getCachedJson<any[]>('api:packing-logs', cacheLookup);
    if (cached) {
        return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
    }

    const result = await tenantQuery(ctx.organizationId, `
            SELECT
                pl.id,
                pl.created_at as timestamp,
                COALESCE(stn.tracking_number_raw, pl.scan_ref) AS tracking,
                pl.tracking_type,
                o.product_title as title
            FROM packer_logs pl
            LEFT JOIN shipping_tracking_numbers stn ON stn.id = pl.shipment_id
            LEFT JOIN orders o ON o.shipment_id = pl.shipment_id AND pl.shipment_id IS NOT NULL
            WHERE pl.packed_by = $1
              AND pl.organization_id = $4
              AND pl.completion_state = 'COMPLETED'
            ORDER BY pl.id DESC
            LIMIT $2 OFFSET $3
        `, [staffId, limit, offset, ctx.organizationId]);

    // Map to format expected by StationHistory (include all fields for compatibility)
    const formattedLogs = result.rows.map((log: any) => ({
        id: `packer${staffId}-${log.id}`,
        timestamp: log.timestamp || '',
        tracking: log.tracking || '',
        trackingNumber: log.tracking || '',
        title: log.title || '',
        product: log.title || '',
        packedAt: log.timestamp,
        trackingType: log.tracking_type || '',
    }));

    await setCachedJson('api:packing-logs', cacheLookup, formattedLogs, 300, ['packing-logs']);
    return NextResponse.json(formattedLogs, { headers: { 'x-cache': 'MISS' } });
}, { permission: 'packing.view' });

const PACKING_LOGS_POST_ROUTE = 'packing-logs.post';

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const idempotencyKey = readIdempotencyKey(
        req,
        body.idempotencyKey ?? body.clientEventId ?? body.client_event_id ?? null,
    );

    // Request-level idempotency (client UUID). Natural shipment_id dedup still
    // helps order re-scans; non-order / SKU path always INSERTs without a key.
    const out = await withIdempotencyClaim(pool, {
        orgId: ctx.organizationId,
        idempotencyKey,
        route: PACKING_LOGS_POST_ROUTE,
        staffId: sessionStaffId(ctx.staffId),
    }, async () => {
        const res = await (async (): Promise<NextResponse> => {
    try {
        const { trackingNumber, rawScan, photos, createdAt, timestamp, packerName } = body;
        // Server-trusted actor — body.packerId is ignored, and the session id is
        // NEVER run through the legacy alias map (that stamped staff 1/2/3's
        // scans as 4/5/6 and hid them from Pack → History).
        const scanInput = String(trackingNumber || '').trim();
        if (!scanInput) {
            return NextResponse.json({ error: 'trackingNumber is required' }, { status: 400 });
        }
        // The scan as the operator made it — the station normalizes tracking
        // input, which would mangle a tote code or a unit label.
        const packScanInput = String(rawScan || '').trim() || scanInput;

        const staffId = sessionStaffId(ctx.staffId);

        if (!staffId) {
            return NextResponse.json({ error: 'Invalid packer ID' }, { status: 400 });
        }
        
        // createdAt is preferred (explicit packer_logs.created_at); timestamp is the legacy field name
        const packDateTime = normalizePSTTimestamp(normalizeScanTimestamp(createdAt ?? timestamp), { fallbackToNow: true })!;
        
        const photoUrls: string[] = Array.isArray(photos) ? photos.filter((u: any) => typeof u === 'string' && u.trim()) : [];

        
        const scanClassification = classifyScan(scanInput);

        return await withTenantTransaction(ctx.organizationId, async (client) => {
        const staffNameResult = await client.query(
            `SELECT name FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
            [staffId, ctx.organizationId]
        );
        const fallbackPackerName = String(packerName || '').trim() || null;
        const staffName = staffNameResult.rows[0]?.name || fallbackPackerName;

        // A tote or a unit (label / serial) names the order to pack; the pack
        // then runs on that order's primary tracking exactly like a label scan.
        const packScan = await resolvePackScan(client, ctx.organizationId, packScanInput);
        if (packScan?.kind === 'refused') {
            return NextResponse.json({ error: packScan.error }, { status: 409 });
        }
        if (packScan?.kind === 'unit-not-on-order') {
            return NextResponse.json({
                error: packScan.error,
                unitNotOnOrder: true,
                serialUnitId: packScan.serialUnitId,
                unitKey: packScan.unitKey,
            }, { status: 404 });
        }
        let scannedOrder: PackScanOrderRow | null = null;
        if (packScan?.kind === 'order') {
            const scanned = await client.query<PackScanOrderRow>(
                `SELECT o.id, o.order_id, stn.tracking_number_raw AS tracking_number, o.shipment_id,
                        o.product_title, o.condition, o.quantity, o.sku
                 FROM   orders o
                 LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
                 WHERE  o.id = $1
                   AND  o.organization_id = $2`,
                [packScan.orderId, ctx.organizationId],
            );
            scannedOrder = scanned.rows[0] ?? null;
            if (!scannedOrder) {
                return NextResponse.json({ error: `The order for ${packScanInput} was not found` }, { status: 404 });
            }
            if (!String(scannedOrder.tracking_number ?? '').trim()) {
                return NextResponse.json({
                    error: packScanNoTrackingError(String(scannedOrder.order_id || `#${scannedOrder.id}`)),
                    orderRowId: Number(scannedOrder.id),
                }, { status: 409 });
            }
        }
        const classification: ScanClassification = scannedOrder
            ? { ...classifyScan(String(scannedOrder.tracking_number)), trackingType: 'ORDERS' }
            : scanClassification;

        if (classification.trackingType === 'ORDERS') {
            // FedEx GS1 SoT: unwrap gun-scanned 96… envelopes to the short human
            // STN so exact join matches sheet/transfer rows (same as receiving).
            const {
              exact: normalizedInput,
              key18: trackingKey18,
              last8: trackingLast8,
            } = orderTrackingMatchKeys(scanInput);
            if (!scannedOrder && (!trackingLast8 || trackingLast8.length < 8)) {
                return NextResponse.json({ error: 'Invalid tracking number' }, { status: 400 });
            }
            // Primary: the order a tote / unit scan named; else exact normalized
            // match via shipment_id FK (fast)
            let orderLookup = scannedOrder ? { rows: [scannedOrder] } : await client.query(
                `SELECT o.id, o.order_id, stn.tracking_number_raw AS tracking_number, o.shipment_id,
                        o.product_title, o.condition, o.quantity, o.sku
                 FROM   orders o
                 JOIN   shipping_tracking_numbers stn ON stn.id = o.shipment_id
                 WHERE  stn.tracking_number_normalized = $1
                   AND  o.organization_id = $2
                 ORDER BY o.id DESC
                 LIMIT 1`,
                [normalizedInput, ctx.organizationId]
            );

            // Fallback 1: key18 suffix match (more specific than last8)
            if (orderLookup.rows.length === 0) {
                orderLookup = await client.query(
                    `SELECT o.id, o.order_id, s.tracking_number_raw AS tracking_number, o.shipment_id,
                            o.product_title, o.condition, o.quantity, o.sku
                     FROM   shipping_tracking_numbers s
                     JOIN   orders o ON o.shipment_id = s.id
                     WHERE  RIGHT(regexp_replace(UPPER(s.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 18) = $1
                       AND  o.organization_id = $2
                     ORDER BY o.id DESC
                     LIMIT 1`,
                    [trackingKey18, ctx.organizationId]
                );
            }

            // Fallback 2: last-8 digit suffix match (handles barcode with 420-zip prefix, etc.)
            if (orderLookup.rows.length === 0) {
                orderLookup = await client.query(
                    `SELECT o.id, o.order_id, stn.tracking_number_raw AS tracking_number, o.shipment_id,
                            o.product_title, o.condition, o.quantity, o.sku
                     FROM   orders o
                     JOIN   shipping_tracking_numbers stn ON stn.id = o.shipment_id
                     WHERE  RIGHT(regexp_replace(stn.tracking_number_normalized, '[^0-9]', '', 'g'), 8) = $1
                       AND  o.organization_id = $2
                     ORDER BY o.id DESC
                     LIMIT 1`,
                    [trackingLast8, ctx.organizationId]
                );
            }

            // ── FBA path: check if this tracking belongs to an FBA shipment ──
            if (orderLookup.rows.length === 0) {
                const fbaLookup = await client.query(
                    `SELECT
                       fs.id              AS plan_id,
                       fs.shipment_ref,
                       fs.amazon_shipment_id,
                       fs.status          AS plan_status,
                       stn.tracking_number_raw,
                       stn.carrier,
                       (SELECT string_agg(DISTINCT fsi.fnsku, ', ' ORDER BY fsi.fnsku)
                        FROM fba_shipment_items fsi WHERE fsi.shipment_id = fs.id
                       ) AS fnskus,
                       (SELECT COALESCE(fsi2.product_title, ff.product_title, fsi2.fnsku)
                        FROM fba_shipment_items fsi2
                        LEFT JOIN fba_fnskus ff ON ff.fnsku = fsi2.fnsku
                        WHERE fsi2.shipment_id = fs.id
                        ORDER BY fsi2.id LIMIT 1
                       ) AS first_product_title,
                       (SELECT COUNT(*)::int FROM fba_shipment_items fsi3
                        WHERE fsi3.shipment_id = fs.id) AS item_count,
                       (SELECT SUM(fsi4.expected_qty)::int FROM fba_shipment_items fsi4
                        WHERE fsi4.shipment_id = fs.id) AS total_qty
                     FROM fba_shipment_tracking fst
                     JOIN shipping_tracking_numbers stn ON stn.id = fst.tracking_id
                     JOIN fba_shipments fs ON fs.id = fst.shipment_id
                     WHERE stn.tracking_number_normalized = $1
                       AND fs.organization_id = $2
                     ORDER BY fs.created_at DESC
                     LIMIT 1`,
                    [normalizedInput, ctx.organizationId],
                );

                if (fbaLookup.rows.length > 0) {
                    const fba = fbaLookup.rows[0];
                    const { shipmentId: fbaShipId, scanRef: fbaScanRef } = await resolveShipmentId(scanInput, ctx.organizationId);

                    // Log the packer scan
                    const fbaPackerLog = await createPackerLog(client, {
                        organizationId: ctx.organizationId,
                        shipmentId: fbaShipId,
                        scanRef: fbaScanRef ?? scanInput,
                        trackingType: 'FBA',
                        createdAt: packDateTime,
                        packedBy: staffId,
                        source: 'packing-logs.fba',
                        onConflictDoNothing: true,
                    });

                    const fbaPackerLogId = fbaPackerLog?.id ?? null;
                    const fbaCreatedAt = fbaPackerLog?.createdAt ?? packDateTime;

                    if (fbaPackerLogId) {
                        await mirrorLegacyPackingToAllocations({
                            packerLogId: fbaPackerLogId,
                            shipmentId: fbaShipId ?? null,
                            actorStaffId: staffId,
                        }, ctx.organizationId);
                    }

                    await createStationActivityLog(client, {
                        organizationId: ctx.organizationId,
                        station: 'PACK',
                        activityType: 'PACK_COMPLETED',
                        staffId,
                        shipmentId: fbaShipId ?? null,
                        scanRef: fbaScanRef ?? scanInput,
                        fbaShipmentId: Number(fba.plan_id),
                        packerLogId: fbaPackerLogId,
                        notes: `FBA pack scan — ${fba.shipment_ref}`,
                        metadata: {
                            source: 'packing-logs',
                            tracking_type: 'FBA',
                            tracking: scanInput,
                            fba_plan_id: fba.plan_id,
                            amazon_shipment_id: fba.amazon_shipment_id,
                        },
                        createdAt: fbaCreatedAt,
                    });
                    await refreshOrderStageFacts(ctx.organizationId, { shipmentIds: [fbaShipId] }, client);

                    const productTitle = String(
                        fba.first_product_title ||
                        (fba.amazon_shipment_id ? `FBA ${fba.amazon_shipment_id}` : null) ||
                        fba.shipment_ref ||
                        'FBA Shipment',
                    ).trim();

                    const fbaRecord = {
                        id: fbaPackerLogId,
                        created_at: fbaCreatedAt,
                        tracking_number: scanInput,
                        packed_by: staffId,
                        order_id: fba.amazon_shipment_id || fba.shipment_ref,
                        product_title: productTitle,
                        condition: `${fba.item_count} SKU · ${fba.total_qty} units`,
                        quantity: fba.total_qty,
                        sku: fba.fnskus,
                    };

                    await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'fba-board']);
                    if (fbaRecord.id) await prependToPackerLogsCache(staffId, fbaRecord, ctx.organizationId);

                    // Hand off to a paired phone (if any) for the photo flow.
                    publishPackerScanReady({
                        organizationId: ctx.organizationId,
                        staffId,
                        packerLogId: fbaPackerLogId,
                        variant: 'fba',
                        scannedValue: scanInput,
                        trackingType: 'FBA',
                        order: null,
                        fba: {
                            fnsku: String(fba.fnskus || '').split(',')[0]?.trim() || '',
                            productTitle: productTitle,
                            shipmentRef: fba.shipment_ref || null,
                            plannedQty: Number(fba.total_qty ?? 0),
                            combinedPackScannedQty: Number(fba.total_qty ?? 0),
                            isNew: false,
                        },
                        source: 'packing-logs.fba',
                    }).catch(() => {});

                    return NextResponse.json({
                        success: true,
                        trackingType: 'FBA',
                        orderId: fba.amazon_shipment_id || fba.shipment_ref,
                        productTitle: productTitle,
                        condition: `${fba.item_count} SKU · ${fba.total_qty} units`,
                        qty: fba.total_qty,
                        shippingTrackingNumber: scanInput,
                        packedBy: staffId,
                        packDateTime,
                        packerRecord: fbaRecord,
                        fba: {
                            plan_id: fba.plan_id,
                            shipment_ref: fba.shipment_ref,
                            amazon_shipment_id: fba.amazon_shipment_id,
                            item_count: fba.item_count,
                            total_qty: fba.total_qty,
                            fnskus: fba.fnskus,
                        },
                    });
                }
            }

            if (orderLookup.rows.length === 0) {
                const upsertResult = await upsertOpenOrderException({
                    organizationId: ctx.organizationId,
                    shippingTrackingNumber: normalizedInput,
                    sourceStation: 'packer',
                    staffId,
                    staffName,
                    reason: 'not_found',
                    notes: 'Packer scan: tracking not found in orders',
                }, pool, ctx.organizationId);
                const ordersExceptionId = upsertResult.exception?.id ?? null;

                const { shipmentId: nfShipmentId, scanRef: nfScanRef } = await resolveShipmentId(scanInput, ctx.organizationId);

                // Check for an existing row by shipment_id or scan_ref last-8 to avoid duplicates
                const nfExisting = await client.query(`
                    SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
                    FROM packer_logs
                    WHERE organization_id = $3
                      AND ((shipment_id IS NOT NULL AND shipment_id = $1)
                       OR (shipment_id IS NULL AND scan_ref IS NOT NULL
                           AND RIGHT(regexp_replace(UPPER(scan_ref), '[^A-Z0-9]', '', 'g'), 8) = $2))
                    ORDER BY id DESC LIMIT 1
                `, [nfShipmentId, trackingLast8, ctx.organizationId]);

                let notFoundPackerLogId: number | null;
                let notFoundCreatedAt: string;
                if (nfExisting.rows.length > 0) {
                    notFoundPackerLogId = nfExisting.rows[0].id;
                    notFoundCreatedAt = nfExisting.rows[0].created_at ?? packDateTime;
                    await touchPackerLog(client, {
                        organizationId: ctx.organizationId,
                        packerLogId: Number(notFoundPackerLogId),
                        packedBy: staffId,
                        source: 'packing-logs.not-found-rescan',
                    });
                } else {
                    const notFoundLog = await createPackerLog(client, {
                        organizationId: ctx.organizationId,
                        shipmentId: nfShipmentId,
                        scanRef: nfScanRef,
                        trackingType: classification.trackingType,
                        createdAt: packDateTime,
                        packedBy: staffId,
                        source: 'packing-logs.not-found',
                    });
                    notFoundPackerLogId = notFoundLog?.id ?? null;
                    notFoundCreatedAt = notFoundLog?.createdAt ?? packDateTime;
                }

                if (notFoundPackerLogId) {
                    await mirrorLegacyPackingToAllocations({
                        packerLogId: notFoundPackerLogId,
                        shipmentId: nfShipmentId ?? null,
                        actorStaffId: staffId,
                    }, ctx.organizationId);
                }

                if (notFoundPackerLogId && photoUrls.length > 0) {
                    for (const url of photoUrls) {
                        await attachPhotoWithLegacyUrl({
                            organizationId: ctx.organizationId,
                            staffId,
                            entityType: 'PACKER_LOG',
                            entityId: notFoundPackerLogId,
                            legacyUrl: url,
                            photoType: PACKER_BOX_LABEL_PHOTO_TYPE,
                            idempotent: true,
                        });
                    }
                }

                const notFoundRecord = {
                    id: notFoundPackerLogId,
                    created_at: notFoundCreatedAt,
                    tracking_number: scanInput,
                    packed_by: staffId,
                    order_id: null,
                    product_title: null,
                    condition: null,
                    quantity: null,
                    sku: null,
                };

                const nfSalId = await createStationActivityLog(client, {
                    organizationId: ctx.organizationId,
                    station: 'PACK',
                    activityType: 'PACK_COMPLETED',
                    staffId,
                    shipmentId: nfShipmentId ?? null,
                    scanRef: nfScanRef ?? scanInput,
                    ordersExceptionId,
                    packerLogId: notFoundPackerLogId,
                    notes: 'Pack scan not matched to order',
                    metadata: {
                        source: 'packing-logs',
                        tracking_type: classification.trackingType,
                        tracking: scanInput,
                    },
                    createdAt: notFoundCreatedAt,
                });
                await refreshOrderStageFacts(ctx.organizationId, { shipmentIds: [nfShipmentId] }, client);
                await recordAudit(client, ctx, req, {
                    source: 'api.packing-logs',
                    action: AUDIT_ACTION.PACK_COMPLETED,
                    entityType: nfShipmentId ? 'SHIPMENT' : 'ORDERS_EXCEPTION',
                    entityId: String(nfShipmentId ?? ordersExceptionId ?? scanInput),
                    stationActivityLogId: nfSalId,
                    actorStaffIdOverride: staffId,
                    extra: {
                        tracking_type: classification.trackingType,
                        tracking: scanInput,
                        matchedOrder: false,
                    },
                });

                await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'orders', 'orders-next', 'shipped']);
                if (nfSalId) publishActivityLogged({ organizationId: ctx.organizationId, id: nfSalId, station: 'PACK', activityType: 'PACK_COMPLETED', staffId, scanRef: nfScanRef ?? scanInput, fnsku: null, source: 'packing-logs' }).catch(() => {});
                if (notFoundRecord.id) await prependToPackerLogsCache(staffId, notFoundRecord, ctx.organizationId);

                publishPackerScanReady({
                    organizationId: ctx.organizationId,
                    staffId,
                    packerLogId: notFoundPackerLogId,
                    variant: 'exception',
                    scannedValue: scanInput,
                    trackingType: classification.trackingType,
                    order: {
                        orderId: '',
                        productTitle: 'Unmatched tracking — exception queue',
                        qty: 1,
                        condition: 'N/A', // ds-allow-na: packing-exception API payload writer
                        tracking: scanInput,
                        sku: null,
                        itemNumber: null,
                        shipByDate: null,
                    },
                    fba: null,
                    source: 'packing-logs.exception',
                }).catch(() => {});

                return NextResponse.json({
                    success: true,
                    warning: 'Order not found in orders. Added to exceptions queue.',
                    trackingType: classification.trackingType,
                    shippingTrackingNumber: scanInput,
                    packedBy: staffId,
                    packDateTime,
                    packerRecord: notFoundRecord,
                    photosCount: Array.isArray(photos) ? photos.length : 0,
                });
            }

            const order = orderLookup.rows[0];

            // Buyer-note interlock: nothing below (PACKED, ledger, print bundle)
            // runs until the order's current buyer note is acknowledged
            // (src/lib/orders/buyer-note-interlock.ts). The 409 carries the note.
            const buyerNoteHold = await readBuyerNoteHold(client, ctx.organizationId, Number(order.id));
            if (buyerNoteHold) {
                return NextResponse.json(buyerNoteHoldBody(buyerNoteHold), { status: 409 });
            }

            // A pack scan records PACKED. Only the physical dock scan-out path
            // may advance an order to SHIPPED.
            await client.query(`
                UPDATE orders
                SET status = 'packed'
                WHERE id = $1
                  AND organization_id = $2
                  AND (status IS NULL OR status != 'packed')
            `, [order.id, ctx.organizationId]);

            // Upsert a PACK work_assignment as DONE.
            // completed_by_packer_id records the scanner-station actor (staffId).
            await client.query(`
                INSERT INTO work_assignments
                    (organization_id, entity_type, entity_id, work_type, assigned_packer_id,
                     completed_by_packer_id, status, priority, notes, completed_at)
                VALUES ($1, 'ORDER', $2, 'PACK', $3, $3, 'DONE', 100, 'Auto-completed on pack scan', NOW())
                ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT}
                DO UPDATE
                    SET assigned_packer_id     = EXCLUDED.assigned_packer_id,
                        completed_by_packer_id = EXCLUDED.completed_by_packer_id,
                        status                 = 'DONE',
                        completed_at           = NOW(),
                        updated_at             = NOW()
                WHERE work_assignments.organization_id = $1
            `, [ctx.organizationId, order.id, staffId]);

            const orderShipmentId: number | null = order.shipment_id ?? null;

            // Check for an existing row by shipment_id to avoid duplicate rows on re-scan
            const foundExisting = await client.query(`
                SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
                FROM packer_logs
                WHERE shipment_id = $1
                  AND organization_id = $2
                ORDER BY id DESC LIMIT 1
            `, [orderShipmentId, ctx.organizationId]);

            let foundPackerLogId: number | null;
            let foundCreatedAt: string;
            if (foundExisting.rows.length > 0) {
                foundPackerLogId = foundExisting.rows[0].id;
                foundCreatedAt = foundExisting.rows[0].created_at ?? packDateTime;
                await touchPackerLog(client, {
                    organizationId: ctx.organizationId,
                    packerLogId: Number(foundPackerLogId),
                    packedBy: staffId,
                    source: 'packing-logs.order-rescan',
                });
            } else {
                const foundLog = await createPackerLog(client, {
                    organizationId: ctx.organizationId,
                    shipmentId: orderShipmentId,
                    scanRef: null,
                    trackingType: classification.trackingType,
                    createdAt: packDateTime,
                    packedBy: staffId,
                    source: 'packing-logs.order',
                });
                foundPackerLogId = foundLog?.id ?? null;
                foundCreatedAt = foundLog?.createdAt ?? packDateTime;
            }

            if (foundPackerLogId) {
                await mirrorLegacyPackingToAllocations({
                    packerLogId: foundPackerLogId,
                    shipmentId: orderShipmentId ?? null,
                    actorStaffId: staffId,
                }, ctx.organizationId);
            }

            if (foundPackerLogId && photoUrls.length > 0) {
                for (const url of photoUrls) {
                    await attachPhotoWithLegacyUrl({
                        organizationId: ctx.organizationId,
                        staffId,
                        entityType: 'PACKER_LOG',
                        entityId: foundPackerLogId,
                        legacyUrl: url,
                        photoType: PACKER_BOX_LABEL_PHOTO_TYPE,
                        idempotent: true,
                    });
                }
            }

            // A tote pack closes the pick → pack loop: the tote goes back to OPEN.
            const releasedTotes = packScan?.kind === 'order' && packScan.via === 'tote'
                ? await releasePackedTotes(ctx.organizationId, { orderId: Number(order.id), shipmentId: orderShipmentId }, client)
                : [];

            const foundRecord = {
                id: foundPackerLogId,
                created_at: foundCreatedAt,
                tracking_number: order.tracking_number ?? null,
                packed_by: staffId,
                order_id: order.order_id ?? null,
                product_title: order.product_title ?? null,
                condition: order.condition ?? null,
                quantity: order.quantity ?? null,
                sku: order.sku ?? null,
            };

            const foundSalId = await createStationActivityLog(client, {
                organizationId: ctx.organizationId,
                station: 'PACK',
                activityType: 'PACK_COMPLETED',
                staffId,
                shipmentId: orderShipmentId,
                scanRef: order.tracking_number ?? scanInput,
                packerLogId: foundPackerLogId,
                notes: 'Order packed successfully',
                metadata: {
                    source: 'packing-logs',
                    // Inside the ORDERS branch (narrowed at the top-level
                    // classification check), so no CLEAN size/tier applies.
                    tracking_type: classification.trackingType,
                    order_id: order.order_id ?? null,
                    order_row_id: Number(order.id),
                },
                createdAt: foundCreatedAt,
            });
            await refreshOrderStageFacts(ctx.organizationId, { orderIds: [order.id], shipmentIds: [orderShipmentId] }, client);
            await recordAudit(client, ctx, req, {
                source: 'api.packing-logs',
                action: AUDIT_ACTION.PACK_COMPLETED,
                entityType: 'ORDER',
                entityId: String(order.id),
                stationActivityLogId: foundSalId,
                actorStaffIdOverride: staffId,
                extra: {
                    shipment_id: orderShipmentId,
                    order_id: order.order_id ?? null,
                    tracking_type: classification.trackingType,
                    matchedOrder: true,
                },
            });

            await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'orders', 'orders-next', 'shipped']);
            if (foundSalId) publishActivityLogged({ organizationId: ctx.organizationId, id: foundSalId, station: 'PACK', activityType: 'PACK_COMPLETED', staffId, scanRef: order.tracking_number ?? scanInput, fnsku: null, source: 'packing-logs' }).catch(() => {});
            if (foundRecord.id) await prependToPackerLogsCache(staffId, foundRecord, ctx.organizationId);

            // Broadcast to all devices so UpNext + Pending grid update instantly
            await Promise.allSettled([
                publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [order.id], source: 'packing-logs' }),
                publishPackerLogChanged({
                    organizationId: ctx.organizationId,
                    packerId: staffId,
                    action: 'insert',
                    packerLogId: foundPackerLogId ?? undefined,
                    source: 'packing-logs',
                }),
                publishPackerScanReady({
                    organizationId: ctx.organizationId,
                    staffId,
                    packerLogId: foundPackerLogId,
                    variant: 'order',
                    scannedValue: scanInput,
                    trackingType: classification.trackingType,
                    order: {
                        orderId: String(order.order_id ?? '').trim(),
                        productTitle: String(order.product_title ?? '').trim() || 'Unknown product',
                        qty: Math.max(1, Number(order.quantity ?? 1) || 1),
                        condition: String(order.condition ?? '').trim() || 'N/A', // ds-allow-na: packing-scan API payload writer
                        tracking: String(order.tracking_number ?? scanInput).trim(),
                        sku: order.sku ?? null,
                        itemNumber: order.item_number ?? null,
                        shipByDate: order.ship_by_date ?? null,
                    },
                    fba: null,
                    source: 'packing-logs.order',
                }),
            ]);

            // Fire-and-forget: detect replenishment need for shipped order
            // (org-required: thread the caller's tenant, never unscoped).
            ensureReplenishmentForOrder({
                orderId: order.id,
                reason: 'shipped',
                changedBy: 'packer-station',
            }, ctx.organizationId).catch(() => {});

            return NextResponse.json({
                success: true,
                trackingType: classification.trackingType,
                orderId: order.order_id,
                orderRowId: order.id,
                productTitle: order.product_title,
                condition: order.condition,
                qty: order.quantity,
                sku: order.sku ?? null,
                shippingTrackingNumber: order.tracking_number ?? classification.normalizedInput,
                trackingNumber: order.tracking_number ?? null,
                packedBy: staffId,
                packDateTime,
                packerRecord: foundRecord,
                photosCount: Array.isArray(photos) ? photos.length : 0,
                message: 'Order packed successfully',
                /** How the order was named when not by its label: 'tote' | 'unit'. */
                packedFrom: packScan?.kind === 'order' ? packScan.via : null,
                releasedTotes,
                /** Station triggers PoPC via POST .../documents/print (keeps this txn short). */
                printBundleSuggested: true,
            });
        }

        // Non-order scans (SKU, FNSKU, etc.):
        let skuUpdated = false;
        let resolvedSkuTitle: string | null = null;
        let resolvedSkuBase: string | null = null;
        let resolvedSkuQty: number | null = null;

        if (classification.trackingType === 'SKU' && classification.skuBase) {
            const addQty = classification.skuQty || 1;
            const normalizedBase = normalizeSku(classification.skuBase || '');
            resolvedSkuBase = normalizedBase;
            resolvedSkuQty = addQty;

            // 1) Prefer the Ecwid platform mapping (sku_platform_ids platform='ecwid').
            const ecwidLookup = await client.query(
                `SELECT COALESCE(
                            NULLIF(BTRIM(sc.product_title), ''),
                            NULLIF(BTRIM(sp.display_name), '')
                        ) AS product_title
                 FROM sku_platform_ids sp
                 LEFT JOIN sku_catalog sc ON sc.id = sp.sku_catalog_id
                 WHERE sp.platform = 'ecwid'
                   AND sp.is_active = true
                   AND sp.organization_id = $2
                   AND (
                       BTRIM(sp.platform_sku) = $1
                       OR BTRIM(sp.platform_item_id) = $1
                       OR regexp_replace(UPPER(TRIM(COALESCE(sp.platform_sku, ''))), '^0+', '') =
                          regexp_replace(UPPER($1), '^0+', '')
                   )
                 ORDER BY
                   CASE WHEN NULLIF(BTRIM(COALESCE(sc.product_title, '')), '') IS NOT NULL THEN 0 ELSE 1 END,
                   sp.created_at DESC NULLS LAST,
                   sp.id DESC
                 LIMIT 1`,
                [normalizedBase, ctx.organizationId],
            );
            resolvedSkuTitle = ecwidLookup.rows[0]?.product_title || null;

            // 2) Read sku_stock for title fallback; quantity changes go through ledger.
            const skuRows = await client.query(
                'SELECT id, stock, sku, product_title FROM sku_stock WHERE organization_id = $1',
                [ctx.organizationId],
            );
            const target = skuRows.rows.find(
                (r: any) => normalizeSku(String(r.sku || '')) === normalizedBase
            );

            if (!resolvedSkuTitle) {
                resolvedSkuTitle = target?.product_title || null;
            }

            if (addQty !== 0) {
                await writeLedgerDelta(client, {
                    orgId: ctx.organizationId,
                    sku: normalizedBase,
                    delta: addQty,
                    reason: 'PACKER_SCAN',
                    staffId,
                    notes: `packing-logs non-order scan ${classification.normalizedInput}`,
                });
            }
            skuUpdated = addQty !== 0;
        }

        const nonOrderLog = await createPackerLog(client, {
            organizationId: ctx.organizationId,
            shipmentId: null,
            scanRef: classification.normalizedInput,
            trackingType: classification.trackingType,
            createdAt: packDateTime,
            packedBy: staffId,
            source: 'packing-logs.non-order',
        });

        const nonOrderPackerLogId = nonOrderLog?.id ?? null;
        if (nonOrderPackerLogId) {
            // shipment_id is null for non-order scans; mirror still safe (no-op).
            await mirrorLegacyPackingToAllocations({
                packerLogId: nonOrderPackerLogId,
                shipmentId: null,
                actorStaffId: staffId,
            }, ctx.organizationId);
        }
        if (nonOrderPackerLogId && photoUrls.length > 0) {
            for (const url of photoUrls) {
                    await attachPhotoWithLegacyUrl({
                        organizationId: ctx.organizationId,
                        staffId,
                        entityType: 'PACKER_LOG',
                        entityId: nonOrderPackerLogId,
                        legacyUrl: url,
                        photoType: PACKER_BOX_LABEL_PHOTO_TYPE,
                        idempotent: true,
                    });
            }
        }

        const nonOrderRecord = {
            id: nonOrderPackerLogId,
            created_at: nonOrderLog?.createdAt ?? packDateTime,
            tracking_number: classification.normalizedInput,
            packed_by: staffId,
            order_id: null,
            product_title: resolvedSkuTitle,
            condition: null,
            quantity: resolvedSkuQty,
            sku: resolvedSkuBase,
        };

        const nonOrderSalId = await createStationActivityLog(client, {
            organizationId: ctx.organizationId,
            station: 'PACK',
            activityType: 'PACK_SCAN',
            staffId,
            scanRef: classification.normalizedInput,
            packerLogId: nonOrderPackerLogId,
            notes: `Pack ${classification.trackingType} scan`,
            metadata: {
                source: 'packing-logs',
                tracking_type: classification.trackingType,
            },
            createdAt: nonOrderLog?.createdAt ?? packDateTime,
        });
        if (nonOrderSalId) publishActivityLogged({ organizationId: ctx.organizationId, id: nonOrderSalId, station: 'PACK', activityType: 'PACK_SCAN', staffId, scanRef: classification.normalizedInput, fnsku: null, source: 'packing-logs' }).catch(() => {});

        await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'orders', 'orders-next', 'shipped']);
        if (nonOrderRecord.id) await prependToPackerLogsCache(staffId, nonOrderRecord, ctx.organizationId);

        return NextResponse.json({
            success: true,
            trackingType: classification.trackingType,
            shippingTrackingNumber: classification.normalizedInput,
            productTitle: resolvedSkuTitle,
            sku: resolvedSkuBase,
            qty: resolvedSkuQty,
            packedBy: staffId,
            packDateTime,
            packerRecord: nonOrderRecord,
            photosCount: Array.isArray(photos) ? photos.length : 0,
            skuUpdated,
        });
        });
    } catch (error: any) {
        console.error('Error updating order:', error);
        return NextResponse.json({
            error: 'Failed to update order',
            details: error.message
        }, { status: 500 });
    }
        })();
        return {
            status: res.status,
            body: (await res.json()) as Record<string, unknown>,
        };
    });
    return NextResponse.json(out.body, { status: out.status });
}, { permission: 'packing.complete_order' });

function normalizeScanTimestamp(input: any): string | null {
    if (!input) return null;
    const raw = String(input).trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
        return raw;
    }

    if (raw.includes('/')) {
        const cleaned = raw.replace(',', '');
        const [datePart, timePart] = cleaned.split(' ');
        if (!datePart || !timePart) return null;
        const [m, d, y] = datePart.split('/').map(Number);
        const [h, min, s] = timePart.split(':').map(Number);
        if (!m || !d || !y) return null;
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h || 0).padStart(2, '0')}:${String(min || 0).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`;
    }
    return normalizePSTTimestamp(raw);
}
