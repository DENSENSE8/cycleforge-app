import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { db } from '@/lib/drizzle/db';
import { packerLogs } from '@/lib/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { fetchPackerLogRows } from '@/lib/neon/packer-logs-week';
import { readShippedDeskFilters } from '@/lib/shipping/shipped-filter/shipped-filter-sql';
import { readShippedPickedBy, readShippedTimeWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { computePackerLogEnrichment } from '@/lib/neon/packer-log-enrichment';
import { attachPhotoWithLegacyUrl } from '@/lib/photos/service';
import { PACKER_BOX_LABEL_PHOTO_TYPE } from '@/lib/photos/types';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { createPackerLog } from '@/lib/packing/packer-log-writer';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { searchParams } = new URL(req.url);
    const packerIdParam = searchParams.get('packerId') || searchParams.get('packedBy');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');
    const weekStart = searchParams.get('weekStart') || '';
    const weekEnd = searchParams.get('weekEnd') || '';
    // The Shipped desk's view filters (`shippedFilter`, `carrier`,
    // `statusCategory`, `exceptions`) — answered in SQL, one predicate with
    // the sidebar facet counts. Absent params narrow nothing.
    const shippedFilters = readShippedDeskFilters(searchParams);
    // `dateFrom`/`dateTo` + `timeFrom`/`timeTo` → the exact shipped-instant
    // window (warehouse wall clock); absent times = no narrowing beyond the week.
    const timeWindow = readShippedTimeWindow(searchParams);
    // `?pickedBy` — the order's picker.
    const pickedBy = readShippedPickedBy(searchParams);

    const packerIdNum = packerIdParam ? parseInt(packerIdParam) : null;
    // Universal staff filter (P1-WORK-02): packed OR tested by this staff.
    const staffParam = searchParams.get('staff');
    const staffNum = staffParam ? parseInt(staffParam) : null;
    // The bench find box.
    const searchTerm = (searchParams.get('q') || '').trim();
    // Spine-first: `phase=spine` returns the immediate-paint columns only; the
    // deferred fields are filled via POST /api/packerlogs/hydrate.
    const spineOnly = searchParams.get('phase') === 'spine';

    const { rows, cacheTTL, cacheHit } = await fetchPackerLogRows({
        organizationId: ctx.organizationId,
        packerId: packerIdNum != null && !Number.isNaN(packerIdNum) ? packerIdNum : null,
        staffId: staffNum != null && !Number.isNaN(staffNum) ? staffNum : null,
        limit,
        offset,
        weekStart,
        weekEnd,
        shippedFilters,
        shippedFrom: timeWindow?.fromIso ?? null,
        shippedTo: timeWindow?.toIso ?? null,
        pickedBy,
        spineOnly,
        searchTerm,
    });
    const CACHE_HEADERS = { 'Cache-Control': `private, max-age=${cacheTTL}, stale-while-revalidate=30` };
    return NextResponse.json(rows, {
        headers: { 'x-cache': cacheHit ? 'HIT' : 'MISS', ...CACHE_HEADERS },
    });
}, { permission: 'packing.view' });

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
        route: 'packerlogs.post',
        staffId: ctx.staffId ?? null,
    }, async () => {
    try {
        // Server-trusted actor — body.packedBy is ignored.
        const packedBy = ctx.staffId;

        const { shipmentId, scanRef } = await resolveShipmentId(
          body.shippingTrackingNumber || '',
          ctx.organizationId,
        );
        const trackingType = body.trackingType || 'ORDERS';
        const written = await withTenantTransaction(ctx.organizationId, (client) =>
            createPackerLog(client, {
                organizationId: ctx.organizationId,
                shipmentId: shipmentId ?? null,
                scanRef: scanRef ?? null,
                trackingType,
                packedBy,
                source: 'packerlogs.post',
            }),
        );

        const packerLogId = written?.id;
        const salId = await createStationActivityLog(pool, {
            organizationId: ctx.organizationId,
            station: 'PACK',
            activityType: trackingType === 'ORDERS' ? 'PACK_COMPLETED' : 'PACK_SCAN',
            staffId: packedBy,
            shipmentId: shipmentId ?? null,
            scanRef: scanRef ?? body.shippingTrackingNumber ?? null,
            packerLogId,
            metadata: {
                source: 'packerlogs.post',
                tracking_type: trackingType,
            },
        });
        await refreshOrderStageFacts(ctx.organizationId, { shipmentIds: [shipmentId] });
        if (trackingType === 'ORDERS') {
            await recordAudit(pool, ctx, req, {
                source: 'api.packerlogs.post',
                action: AUDIT_ACTION.PACK_COMPLETED,
                entityType: shipmentId ? 'SHIPMENT' : 'PACKER_LOG',
                entityId: String(shipmentId ?? packerLogId ?? body.shippingTrackingNumber ?? 'unknown'),
                stationActivityLogId: salId,
                method: 'scan',
                extra: {
                    tracking_type: trackingType,
                },
            });
        }
        if (packerLogId && Array.isArray(body.packerPhotosUrl) && body.packerPhotosUrl.length > 0) {
            for (const url of body.packerPhotosUrl) {
                if (typeof url === 'string' && url.trim()) {
                    await attachPhotoWithLegacyUrl({
                        organizationId: ctx.organizationId,
                        staffId: packedBy,
                        entityType: 'PACKER_LOG',
                        entityId: packerLogId,
                        legacyUrl: url,
                        photoType: PACKER_BOX_LABEL_PHOTO_TYPE,
                        idempotent: true,
                    });
                }
            }
        }

        // Bust both packerlogs and orders caches: is_packed is computed in /api/orders,
        // so creating a new packer log must clear the orders cache too.
        await invalidateCacheTags(ctx.organizationId, ['packing-logs', 'orders']);

        // Precompute the shipped-table read model for this new PACK scan so the dashboard reads it from packer_log_enrichment instead of…
        if (salId != null) {
            after(() =>
                computePackerLogEnrichment(pool, [salId]).catch((e) =>
                    console.warn('[packerlogs.post] enrichment compute failed', e),
                ),
            );
        }
        const row = written ? {
            id: written.id,
            organizationId: ctx.organizationId,
            shipmentId: shipmentId ?? null,
            scanRef: scanRef ?? null,
            trackingType,
            completionState: written.completionState,
            packedBy,
            createdAt: written.createdAt,
            updatedAt: written.createdAt,
        } : null;
        return {
            status: 200,
            body: (row ? { ...row } : { success: true }) as Record<string, unknown>,
        };
    } catch (error: any) {
        console.error('Error creating packer log:', error);
        return {
            status: 500,
            body: { error: 'Failed to create log', details: error.message },
        };
    }
    });
    return NextResponse.json(out.body, { status: out.status });
}, { permission: 'packing.complete_order' });

export const PUT = withAuth(async (req: NextRequest, ctx) => {
    const body = await req.json();
    const id = Number(body.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'ID must be a positive integer' }, { status: 400 });
    }

    // Keep this legacy metadata editor deliberately narrow. Completion,
    // actor, tenant, and timestamps belong to the canonical packing writer
    // and must never be mass-assigned from a request body.
    const updateData: Partial<typeof packerLogs.$inferInsert> = {};
    if (body.scanRef === null || typeof body.scanRef === 'string') {
        updateData.scanRef = body.scanRef;
    }
    if (typeof body.trackingType === 'string' && body.trackingType.trim()) {
        updateData.trackingType = body.trackingType.trim();
    }
    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No editable fields were provided' }, { status: 400 });
    }
    updateData.updatedAt = new Date();

    const updatedLog = await db
        .update(packerLogs)
        .set(updateData)
        .where(and(
            eq(packerLogs.id, id),
            eq(packerLogs.organizationId, ctx.organizationId),
        ))
        .returning();

    if (updatedLog.length === 0) {
        return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    await invalidateCacheTags(ctx.organizationId, ['packing-logs']);
    return NextResponse.json(updatedLog[0]);
}, { permission: 'packing.complete_order' });

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const activityLogId = searchParams.get('activityLogId');
    const orgId = ctx.organizationId;

    // Tenant-scoped transaction: SET LOCAL app.current_org so RLS isolates
    // the station_activity_logs / packer_logs deletes; explicit
    // organization_id predicates are kept as defense-in-depth alongside the GUC.
    return await withTenantTransaction(orgId, async (client) => {
        if (activityLogId) {
            const salId = parseInt(activityLogId, 10);
            if (Number.isNaN(salId)) {
                return NextResponse.json({ error: 'Invalid activityLogId' }, { status: 400 });
            }
            const sel = await client.query(
                'SELECT packer_log_id, shipment_id FROM station_activity_logs WHERE id = $1 AND organization_id = $2',
                [salId, orgId]
            );
            if (!sel.rows[0]) {
                return NextResponse.json({ error: 'Log not found' }, { status: 404 });
            }
            const plId: number | null = sel.rows[0].packer_log_id ?? null;
            await client.query('DELETE FROM station_activity_logs WHERE id = $1 AND organization_id = $2', [salId, orgId]);
            if (plId != null) {
                await client.query('DELETE FROM packer_logs WHERE id = $1 AND organization_id = $2', [plId, orgId]);
            }
            await refreshOrderStageFacts(orgId, { shipmentIds: [sel.rows[0].shipment_id] }, client);
            await invalidateCacheTags(orgId, ['packing-logs', 'orders', 'shipped']);
            return NextResponse.json({ success: true });
        }

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const plId = parseInt(id, 10);
        if (Number.isNaN(plId)) {
            return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
        }

        const plCheck = await client.query('SELECT id, shipment_id FROM packer_logs WHERE id = $1 AND organization_id = $2', [plId, orgId]);
        if (!plCheck.rows[0]) {
            return NextResponse.json({ error: 'Log not found' }, { status: 404 });
        }

        await client.query('DELETE FROM station_activity_logs WHERE packer_log_id = $1 AND organization_id = $2', [plId, orgId]);
        await client.query('DELETE FROM packer_logs WHERE id = $1 AND organization_id = $2', [plId, orgId]);
        await refreshOrderStageFacts(orgId, { shipmentIds: [plCheck.rows[0].shipment_id] }, client);
        await invalidateCacheTags(orgId, ['packing-logs', 'orders', 'shipped']);
        return NextResponse.json({ success: true, deletedLog: { id: plId } });
    });
}, { permission: 'packing.complete_order' });
