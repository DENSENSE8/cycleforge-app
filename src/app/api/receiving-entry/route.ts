import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { type OrgId } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { getCarrier } from '@/lib/tracking-format';
import { formatPSTTimestamp } from '@/utils/date';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { searchPurchaseOrdersByTracking, searchPurchaseReceivesByTracking } from '@/lib/zoho';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import { importZohoPurchaseOrderToReceiving } from '@/lib/zoho-receiving-sync';
import { getReceivingSchema } from '@/lib/receiving-schema-cache';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { recordReceivingScan } from '@/lib/receiving/record-scan';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveReceivingTypeId } from '@/lib/catalog/org-catalog';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';

/**
 * Compute Mon–Fri week range (PST date strings) for a given PST timestamp string
 * such as '2026-03-04T14:30:00'.  Used to target the exact Redis cache key that
 * ReceivingLogs uses when fetching by week.
 */
function _getPSTWeekRange(pstTimestamp: string): { startStr: string; endStr: string } {
    const dateKey = pstTimestamp.substring(0, 10); // 'YYYY-MM-DD'
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dow = date.getDay(); // 0=Sun
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysFromMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startStr: fmt(monday), endStr: fmt(friday) };
}

/** Background auto-match linker (chokepoint fold, §7 Step D). */
async function linkAndMatchLines(
    orgId: OrgId,
    receivingId: number,
    actorStaffId: number | null,
    lockSql: string,
    lockParams: unknown[],
): Promise<number> {
    return withTenantTransaction(orgId, async (client) => {
        const locked = await client.query<{ id: number; workflow_status: string }>(
            lockSql,
            lockParams,
        );
        if (locked.rows.length === 0) return 0;

        const lineIds = locked.rows.map((r) => r.id);
        await client.query(
            `UPDATE receiving_line
             SET receiving_id = $1,
                 updated_at   = NOW()
             WHERE id = ANY($2::int[])
               AND organization_id = $3`,
            [receivingId, lineIds, orgId],
        );

        const skipped: Array<{ id: number; workflow_status: string }> = [];
        for (const row of locked.rows) {
            if (row.workflow_status !== 'EXPECTED' && row.workflow_status !== 'ARRIVED') {
                skipped.push(row);
                continue;
            }
            await transitionReceivingLine(
                {
                    receivingLineId: row.id,
                    to: 'MATCHED',
                    actorStaffId,
                    station: 'RECEIVING',
                    skipEvent: true,
                },
                client,
                orgId,
            );
        }
        if (skipped.length > 0) {
            console.warn(
                'receiving-entry auto-match: linked without status change (already at/beyond MATCHED): ' +
                    skipped.map((r) => `${r.id}:${r.workflow_status}`).join(', '),
            );
        }
        return locked.rows.length;
    });
}

// POST - Add entry to receiving table
export const POST = withAuth(async (request: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const body = await request.json();
    const { trackingNumber, carrier: providedCarrier } = body;
    const skipZohoMatch = !!(body?.skipZohoMatch ?? body?.skip_zoho_match);

    const conditionGradeAllowed = new Set(['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS']);
    const qaStatusAllowed = new Set(['PENDING', 'PASSED', 'FAILED_DAMAGED', 'FAILED_INCOMPLETE', 'FAILED_FUNCTIONAL', 'HOLD']);
    const dispositionAllowed = new Set(['ACCEPT', 'HOLD', 'RTV', 'SCRAP', 'REWORK']);
    const returnPlatformAllowed = new Set(['AMZ', 'EBAY_DRAGONH', 'EBAY_USAV', 'EBAY_MK', 'FBA', 'WALMART', 'ECWID']);
    const targetChannelAllowed = new Set(['ORDERS', 'FBA']);

    // condition_grade / disposition_code are nullable for Zoho PO-originated entries
    // (per-item state lives in receiving_lines); for standalone bulk scans they default to USED_A/HOLD.
    const rawConditionGrade = String(body?.conditionGrade || body?.condition_grade || '').trim().toUpperCase();
    const conditionGrade = conditionGradeAllowed.has(rawConditionGrade) ? rawConditionGrade : null;

    const rawQaStatus = String(body?.qaStatus || body?.qa_status || 'PENDING').trim().toUpperCase();
    const qaStatus = qaStatusAllowed.has(rawQaStatus) ? rawQaStatus : 'PENDING';

    const rawDisposition = String(body?.dispositionCode || body?.disposition_code || '').trim().toUpperCase();
    const dispositionCode = dispositionAllowed.has(rawDisposition) ? rawDisposition : null;

    const isReturn = !!body?.isReturn || !!body?.is_return;
    const rawReturnPlatform = String(body?.returnPlatform || body?.return_platform || '').trim().toUpperCase();
    const returnPlatform = isReturn && returnPlatformAllowed.has(rawReturnPlatform) ? rawReturnPlatform : null;
    const returnReason = isReturn ? (String(body?.returnReason || body?.return_reason || '').trim() || null) : null;

    const needsTest = body?.needsTest === undefined && body?.needs_test === undefined
        ? true
        : !!(body?.needsTest ?? body?.needs_test);
    const assignedTechIdRaw = Number(body?.assignedTechId ?? body?.assigned_tech_id);
    const assignedTechId = needsTest && Number.isFinite(assignedTechIdRaw) && assignedTechIdRaw > 0 ? assignedTechIdRaw : null;

    const rawTargetChannel = String(body?.targetChannel || body?.target_channel || '').trim().toUpperCase();
    const targetChannel = targetChannelAllowed.has(rawTargetChannel) ? rawTargetChannel : null;

    const zohoPurchaseReceiveId = String(body?.zohoPurchaseReceiveId || body?.zoho_purchase_receive_id || '').trim() || null;
    const zohoWarehouseId = String(body?.zohoWarehouseId || body?.zoho_warehouse_id || '').trim() || null;

    if (!trackingNumber) {
        return NextResponse.json({ 
            error: 'trackingNumber is required' 
        }, { status: 400 });
    }

    const detectedCarrier = providedCarrier && providedCarrier !== 'Unknown'
        ? providedCarrier
        : getCarrier(trackingNumber);

    // Always stamp on the server in PST/PDT to avoid client timezone drift.
    const now = formatPSTTimestamp();

    // Register the tracking number in shipping_tracking_numbers so the
    // receiving row links via shipment_id (canonical inbound identity).
    const shipment = await registerShipmentPermissive({
        trackingNumber,
        sourceSystem: 'receiving_entry',
    }, ctx.organizationId);

    const { columns: availableColumns, dateColumn } = await getReceivingSchema();
    // `receiving.source` is NOT NULL with CHECK (source IN ('zoho_po','unmatched','local_pickup')) and no DB default, so the insert must…
    const sourceAllowed = new Set(['zoho_po', 'unmatched', 'local_pickup']);
    const rawSource = String(body?.source || '').trim().toLowerCase();
    const source = sourceAllowed.has(rawSource) ? rawSource : 'unmatched';

    // Normalized catalog link (Phase 2).
    const typeId = await resolveReceivingTypeId(ctx.organizationId, { isReturn });

    // Door stamp (received_at/received_by) moved to the triage street table (receiving_triage.door_received_at/door_received_by) — written via…
    const valuesByColumn: Record<string, any> = {
        [dateColumn]: now,
        // Legacy receiving_tracking_number dropped — tracking lives in STN
        // (registered into shipment_id just below).
        shipment_id: shipment?.id ?? null,
        carrier: detectedCarrier,
        source,
        condition_grade: conditionGrade,
        qa_status: qaStatus,
        disposition_code: dispositionCode,
        is_return: isReturn,
        return_platform: returnPlatform,
        return_reason: returnReason,
        needs_test: needsTest,
        assigned_tech_id: assignedTechId,
        target_channel: targetChannel,
        type_id: typeId,
        zoho_purchase_receive_id: zohoPurchaseReceiveId,
        zoho_warehouse_id: zohoWarehouseId,
        organization_id: ctx.organizationId,
        updated_at: now,
    };

    const insertColumns: string[] = [];
    const insertValues: any[] = [];
    Object.entries(valuesByColumn).forEach(([column, value]) => {
        if (!availableColumns.has(column)) return;
        insertColumns.push(column);
        insertValues.push(value);
    });

    if (insertColumns.length === 0) {
        throw new Error('No compatible receiving columns found for insert');
    }

    const valuePlaceholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
    // Carton INSERT + triage door stamp in ONE tenant transaction.
    const inserted = await withTenantTransaction(orgId, async (client) => {
        const ins = await client.query(
            `INSERT INTO receiving_carton (${insertColumns.join(', ')})
                 VALUES (${valuePlaceholders})
                 RETURNING id`,
            insertValues,
        );
        await upsertReceivingTriage(client, orgId, Number(ins.rows[0].id), {
            doorReceivedAt: now,
            doorReceivedBy: ctx.staffId ?? null,
        });
        return ins;
    });

    const newRecord = {
        id: String(inserted.rows[0].id),
        timestamp: now,
        tracking: trackingNumber,
        status: detectedCarrier,
        count: 1,
        condition_grade: conditionGrade,
        qa_status: qaStatus,
        disposition_code: dispositionCode,
        is_return: isReturn,
        return_platform: returnPlatform,
        needs_test: needsTest,
        assigned_tech_id: assignedTechId,
        target_channel: targetChannel,
        zoho_purchase_receive_id: zohoPurchaseReceiveId,
        zoho_warehouse_id: zohoWarehouseId,
    };

    // ── Respond immediately, then run cache invalidation + Zoho in background ──
    const newReceivingId = Number(inserted.rows[0].id);

    try {
        await recordReceivingScan(
            newReceivingId,
            trackingNumber,
            detectedCarrier,
            ctx.staffId,
            source === 'zoho_po' ? 'zoho_po' : 'unmatched',
        );
    } catch (err) {
        console.warn('receiving-entry: recordReceivingScan failed (non-fatal)', err);
    }

    after(async () => {
        try {
            // Invalidate cached receiving-logs so next fetch hits DB fresh.
            // Avoids race where a quick delete could be overwritten by a
            // stale surgical cache prepend.
            await invalidateReceivingViews(ctx.organizationId);
            await publishReceivingLogChanged({
                organizationId: ctx.organizationId,
                action: 'insert',
                rowId: newRecord.id,
                row: newRecord,
                source: 'receiving-entry',
            });
        } catch (e) {
            console.warn('Cache/realtime update failed:', e instanceof Error ? e.message : e);
        }

        // ── Zoho auto-match (slow, best-effort) — skip for bulk scans ──
        if (skipZohoMatch) return;
        try {
            // 1a. Check local receiving_lines first — lock, link, and advance via the guarded chokepoint in one tenant transaction (see…
            const localLinkedCount = await linkAndMatchLines(
                orgId,
                newReceivingId,
                ctx.staffId ?? null,
                `SELECT rl.id, rl.workflow_status::text AS workflow_status
                     FROM receiving_line rl
                     LEFT JOIN receiving_line_zoho rz
                       ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
                     WHERE rl.receiving_id IS NULL
                       AND rl.organization_id = $3
                       AND (
                         rz.zoho_purchase_receive_id = $1
                         OR rl.notes ILIKE $2
                       )
                     ORDER BY rl.id
                     LIMIT 50
                     FOR UPDATE OF rl`,
                [trackingNumber, `%${trackingNumber}%`, orgId]
            );

            if (localLinkedCount === 0) {
                // 1b. Search Zoho Purchase Receives by tracking (bound to
                // the authenticated tenant's Zoho credentials).
                const zohoReceives = await withZohoOrg(ctx.organizationId, () =>
                    searchPurchaseReceivesByTracking(trackingNumber),
                ).catch(() => []);
                let matchedPoIds: string[] = [];

                if (zohoReceives.length > 0) {
                    const firstReceive = zohoReceives[0];
                    const prId = String(firstReceive.purchase_receive_id || '');
                    if (prId) {
                        await tenantQuery(
                            orgId,
                            `UPDATE receiving_carton
                                 SET zoho_purchase_receive_id = $1, updated_at = NOW()
                                 WHERE id = $2 AND zoho_purchase_receive_id IS NULL`,
                            [prId, newReceivingId]
                        );
                    }
                    for (const receive of zohoReceives.slice(0, 3)) {
                        const poId = String(receive.purchaseorder_id || '');
                        if (!poId || matchedPoIds.includes(poId)) continue;
                        matchedPoIds.push(poId);

                        // Same fold as 1a: lock this PO's unmatched lines,
                        // link them, and advance only EXPECTED/ARRIVED to
                        // MATCHED through the chokepoint — one tenant tx per PO.
                        const poLinkedCount = await linkAndMatchLines(
                            orgId,
                            newReceivingId,
                            ctx.staffId ?? null,
                            `SELECT rl.id, rl.workflow_status::text AS workflow_status
                                 FROM receiving_line rl
                                 JOIN receiving_line_zoho rz
                                   ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
                                 WHERE rz.zoho_purchaseorder_id = $1
                                   AND rl.receiving_id IS NULL
                                   AND rl.organization_id = $2
                                 ORDER BY rl.id
                                 FOR UPDATE OF rl`,
                            [poId, orgId]
                        );

                        if (poLinkedCount === 0) {
                            await importZohoPurchaseOrderToReceiving(ctx.organizationId, poId, {
                                receivingId: newReceivingId,
                                workflowStatus: 'MATCHED',
                            }).catch(() => null);
                        }
                    }
                }

                // 1c. If no receives matched, search Zoho POs directly
                if (zohoReceives.length === 0) {
                    const zohoPOs = await withZohoOrg(ctx.organizationId, () =>
                        searchPurchaseOrdersByTracking(trackingNumber),
                    ).catch(() => []);
                    for (const po of zohoPOs.slice(0, 3)) {
                        const poId = po.purchaseorder_id;
                        if (!poId || matchedPoIds.includes(poId)) continue;
                        matchedPoIds.push(poId);
                        await importZohoPurchaseOrderToReceiving(ctx.organizationId, poId, {
                            receivingId: newReceivingId,
                            workflowStatus: 'MATCHED',
                        }).catch(() => null);
                    }
                }
            }
        } catch (matchErr) {
            console.warn('Zoho auto-match warning:', matchErr instanceof Error ? matchErr.message : matchErr);
        }

        // ── Work assignment creation ──
        if (needsTest && assignedTechId) {
            try {
                const assignmentTableRes = await pool.query(
                    `SELECT EXISTS (
                            SELECT 1 FROM information_schema.tables WHERE table_name = 'work_assignments'
                        ) AS exists`
                );
                if (assignmentTableRes.rows[0]?.exists) {
                    await tenantQuery(
                        orgId,
                        `INSERT INTO work_assignments (
                                organization_id, entity_type, entity_id, work_type,
                                assigned_tech_id, status, priority, notes
                             )
                             VALUES ($1, 'RECEIVING', $2, 'TEST', $3, 'ASSIGNED', 100, $4)
                             ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
                        [ctx.organizationId, newReceivingId, assignedTechId, `Auto-created from receiving entry ${trackingNumber}`]
                    );
                }
            } catch {
                // Non-fatal
            }
        }
    });

    return NextResponse.json({
        success: true,
        record: newRecord,
    }, { status: 201 });
}, { permission: 'receiving.scan_po' });

// GET - Fetch all receiving logs
export const GET = withAuth(async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const cacheLookup = createCacheLookupKey({ limit, offset });

    const cached = await getCachedJson<any[]>('api:receiving-entry', cacheLookup);
    if (cached) {
        return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
    }

    const { dateColumn, hasQuantity } = await getReceivingSchema();
    const countExpr = hasQuantity ? "COALESCE(quantity, '1')" : "'1'";
    const result = await tenantQuery(
        orgId,
        `SELECT
                r.id,
                to_char(r.${dateColumn}::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
                stn.tracking_number_raw AS tracking,
                r.carrier,
                ${countExpr.replace(/\bquantity\b/g, 'r.quantity')} AS quantity
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
             WHERE r.shipment_id IS NOT NULL
             ORDER BY r.id DESC
             LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
        
    await setCachedJson('api:receiving-entry', cacheLookup, result.rows, 30, ['receiving-logs']);
    return NextResponse.json(result.rows, { headers: { 'x-cache': 'MISS' } });
}, { permission: 'receiving.view' });
