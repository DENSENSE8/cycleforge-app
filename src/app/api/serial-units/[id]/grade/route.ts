import { NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { CONDITION_GRADE_VALUES } from '@/components/inventory/types';
import { sortSerialUnitToParts } from '@/lib/inventory/parts-sort';
import { resolveCurrentReceivingLineIds } from '@/lib/neon/serial-units-queries';
import { refreshLineSerialProjectionSafe } from '@/lib/receiving/serial-projection';
import { gatherQualityInputs, recomputeUnitQualitySafe } from '@/lib/neon/quality-queries';
import { evaluateGradeAdvice } from '@/lib/quality/gradeAdvice';
import type { ConditionGrade } from '@/lib/quality/qualityScore';

/** POST /api/serial-units/[id]/grade */
export const POST = withAuth(async (request, ctx) => {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    // .../api/serial-units/[id]/grade → id is segments[-2]
    const idStr = segments[segments.length - 2];
    const serialUnitId = Number(idStr);
    if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) {
        return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = await request.json();
    } catch {
        /* empty body handled below */
    }

    const rawGrade = body.new_grade;
    const clearing =
        rawGrade === null ||
        rawGrade === '' ||
        (typeof rawGrade === 'string' && !rawGrade.trim());
    const newGrade = clearing ? null : String(rawGrade ?? '').trim().toUpperCase();
    if (!clearing && !(CONDITION_GRADE_VALUES as ReadonlyArray<string>).includes(newGrade!)) {
        return NextResponse.json(
            { ok: false, error: 'new_grade must be one of: ' + CONDITION_GRADE_VALUES.join(', ') + ' (or null to clear)' },
            { status: 400 },
        );
    }
    const cosmeticNotes = typeof body.cosmetic_notes === 'string' && body.cosmetic_notes.trim() ? body.cosmetic_notes.trim() : null;
    const functionalNotes = typeof body.functional_notes === 'string' && body.functional_notes.trim() ? body.functional_notes.trim() : null;
    const clientEventId = typeof body.client_event_id === 'string' && body.client_event_id.trim() ? body.client_event_id.trim() : null;

    const actorStaffId: number | null =
        typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

    const orgId = ctx.organizationId;

    try {
        const existing = await tenantQuery<{ condition_grade: string | null; sku: string | null }>(
            orgId,
            `SELECT condition_grade::text AS condition_grade, sku FROM serial_units WHERE id = $1 AND organization_id = $2`,
            [serialUnitId, orgId],
        );
        if (existing.rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'unit not found' }, { status: 404 });
        }
        const prevGrade = existing.rows[0].condition_grade;
        const sku = existing.rows[0].sku;

        if (prevGrade === newGrade) {
            return NextResponse.json(
                { ok: false, error: 'grade unchanged', current_grade: prevGrade },
                { status: 409 },
            );
        }

        // Update the unit row first so the conditionHistory row reflects the
        // new authoritative state.
        const updated = await tenantQuery(
            orgId,
            `UPDATE serial_units
             SET condition_grade = $2::condition_grade_enum,
                 updated_at = NOW()
             WHERE id = $1
               AND organization_id = $3
             RETURNING id, condition_grade::text AS condition_grade, current_status::text AS current_status, updated_at`,
            [serialUnitId, newGrade, orgId],
        );

        // Audit + history.
        const eventNotes =
            cosmeticNotes || functionalNotes
                ? `cosmetic: ${cosmeticNotes ?? '-'} | functional: ${functionalNotes ?? '-'}`
                : null;
        const eventId = await withTenantTransaction(orgId, async (client) => {
            // Idempotent GRADED event: if client_event_id already exists, reuse it.
            if (clientEventId) {
                const dup = await client.query<{ id: number }>(
                    `SELECT id FROM inventory_events WHERE client_event_id = $1 LIMIT 1`,
                    [clientEventId],
                );
                if (dup.rows[0]) return dup.rows[0].id;
            }
            const ev = await client.query<{ id: number }>(
                `INSERT INTO inventory_events
                   (event_type, actor_staff_id, serial_unit_id, sku, client_event_id, notes, payload, organization_id)
                 VALUES ('GRADED', $1, $2, $3, $4, $5, $6::jsonb, $7)
                 ON CONFLICT (client_event_id) DO NOTHING
                 RETURNING id`,
                [
                    actorStaffId,
                    serialUnitId,
                    sku,
                    clientEventId,
                    eventNotes,
                    JSON.stringify({ prev_grade: prevGrade, new_grade: newGrade }),
                    orgId,
                ],
            );
            let newEventId = ev.rows[0]?.id ?? null;
            if (newEventId == null && clientEventId) {
                const existing = await client.query<{ id: number }>(
                    `SELECT id FROM inventory_events WHERE client_event_id = $1 LIMIT 1`,
                    [clientEventId],
                );
                newEventId = existing.rows[0]?.id ?? null;
            }

            if (!clearing) {
                // Condition-history row, linked to the GRADED event. The DB CHECK
                // (prev_grade IS DISTINCT FROM new_grade) is already satisfied — we
                // 409 above on an unchanged grade. Skipped on clear (new_grade NOT NULL).
                await client.query(
                    `INSERT INTO serial_unit_condition_history
                       (serial_unit_id, prev_grade, new_grade, assessed_by_staff_id, cosmetic_notes, functional_notes, inventory_event_id, organization_id)
                     VALUES ($1, $2::condition_grade_enum, $3::condition_grade_enum, $4, $5, $6, $7, $8)`,
                    [
                        serialUnitId,
                        prevGrade,
                        newGrade,
                        actorStaffId,
                        cosmeticNotes,
                        functionalNotes,
                        newEventId,
                        orgId,
                    ],
                );
            }
            return newEventId;
        });

        // Auto-sort: a unit graded "For Parts" needs no testing or claim — it's
        // routed straight into the Technical Room parts bin (STOCKED, pickable).
        // Best-effort: a sort failure never fails the grade write.
        let partsSort: Awaited<ReturnType<typeof sortSerialUnitToParts>> | null = null;
        if (newGrade === 'PARTS') {
            try {
                partsSort = await sortSerialUnitToParts({
                    serialUnitId,
                    staffId: actorStaffId,
                    station: 'TECH',
                    clientEventId,
                });
            } catch (sortErr) {
                console.warn('[grade] parts auto-sort failed (non-fatal)', sortErr);
            }
        }

        // Advisory grade signals (non-blocking) + quality recompute.
        let warnings: ReturnType<typeof evaluateGradeAdvice>['warnings'] = [];
        if (newGrade) {
            try {
                const gathered = await gatherQualityInputs(serialUnitId, orgId);
                if (gathered) {
                    warnings = evaluateGradeAdvice({
                        grade: newGrade as ConditionGrade,
                        openFailures: gathered.openFailures,
                    }).warnings;
                }
            } catch (adviceErr) {
                console.warn('[grade] advice failed (non-fatal)', adviceErr);
            }
        }
        await recomputeUnitQualitySafe(serialUnitId, orgId);

        // The unit's condition_grade changed — refresh the serial projection for whatever receiving line it currently sits on so the re-grade…
        after(async () => {
            try {
                const lines = await resolveCurrentReceivingLineIds([serialUnitId], orgId);
                const lineId = lines.get(serialUnitId);
                if (lineId) await refreshLineSerialProjectionSafe(orgId, lineId);
            } catch (projErr) {
                console.warn('[grade] serial projection refresh failed (non-fatal)', projErr);
            }
        });

        return NextResponse.json({
            ok: true,
            unit: updated.rows[0],
            event_id: eventId,
            parts_sorted: partsSort?.sorted === true,
            parts_bin: partsSort?.sorted === true ? partsSort.bin : null,
            warnings,
            cleared: clearing,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'grade failed';
        console.error('[POST /api/serial-units/[id]/grade] error:', err);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}, { permission: 'serial_units.grade' });
