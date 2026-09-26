import { NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { transition } from '@/lib/inventory/state-machine';
import { recordInventoryEvent } from '@/lib/inventory/events';

/** POST /api/tech/test-result */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));
  const serialUnitIdRaw = Number(body?.serial_unit_id);
  const serialUnitIdInput =
    Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0 ? Math.floor(serialUnitIdRaw) : null;
  const serialNumberInput = String(body?.serial_number || '').trim() || null;
  const action = String(body?.action || '').trim().toLowerCase() as 'start' | 'pass' | 'fail' | 'reset';
  const conditionGradeInput = String(body?.condition_grade || '').trim().toUpperCase() || null;
  const notes = String(body?.notes || '').trim() || null;
  const clientEventId = String(body?.client_event_id || '').trim() || null;

  if (!serialUnitIdInput && !serialNumberInput) {
    return NextResponse.json(
      { ok: false, error: 'serial_unit_id or serial_number is required' },
      { status: 400 },
    );
  }
  if (action !== 'start' && action !== 'pass' && action !== 'fail' && action !== 'reset') {
    return NextResponse.json(
      { ok: false, error: "action must be 'start' | 'pass' | 'fail' | 'reset'" },
      { status: 400 },
    );
  }

  const actorStaffIdTop: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const orgId = ctx.organizationId;

  // RESET — clear a wrong test verdict.
  if (action === 'reset') {
    const result = await withTenantTransaction(orgId, async (client) => {
      const uq = serialUnitIdInput
        ? await client.query<{ id: number; sku: string | null; current_status: string; condition_grade: string | null }>(
            `SELECT id, sku, current_status::text AS current_status, condition_grade::text AS condition_grade
                 FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
            [serialUnitIdInput, orgId],
          )
        : await client.query<{ id: number; sku: string | null; current_status: string; condition_grade: string | null }>(
            `SELECT id, sku, current_status::text AS current_status, condition_grade::text AS condition_grade
                 FROM serial_units WHERE normalized_serial = UPPER(TRIM($1)) AND organization_id = $2 LIMIT 1 FOR UPDATE`,
            [serialNumberInput, orgId],
          );
      const unit = uq.rows[0];
      if (!unit) return { ok: false as const, status: 404, error: 'serial_units row not found' };
      const cur = unit.current_status;
      if (cur !== 'IN_TEST' && cur !== 'GRADED' && cur !== 'IN_REPAIR') {
        return { ok: false as const, status: 409, error: `unit is ${cur}; only IN_TEST / GRADED / IN_REPAIR can be reset` };
      }
      const target = cur === 'IN_TEST' ? 'RECEIVED' : 'IN_TEST';

      // Only a PASS verdict (which lands the unit in GRADED) ever changes the condition_grade; a FAIL (IN_REPAIR) never writes a…
      let restoredGrade: string | null = null;
      if (cur === 'GRADED') {
        const histQ = await client.query<{ prev_grade: string | null; new_grade: string | null }>(
          `SELECT prev_grade::text AS prev_grade, new_grade::text AS new_grade
               FROM serial_unit_condition_history WHERE serial_unit_id = $1 AND organization_id = $2
              ORDER BY id DESC LIMIT 1`,
          [unit.id, orgId],
        );
        const lastHist = histQ.rows[0];
        if (lastHist?.new_grade && lastHist.new_grade === unit.condition_grade && lastHist.prev_grade) {
          restoredGrade = lastHist.prev_grade;
        }
      }

      const t = await transition(
        {
          unitId: unit.id,
          to: target,
          eventType: 'ADJUSTED',
          actorStaffId: actorStaffIdTop,
          station: 'TECH',
          clientEventId: clientEventId ? `${clientEventId}:reset` : null,
          notes,
          payload: { source: 'tech.test-reset', from: cur, verdict_cleared: true },
        },
        client,
        orgId,
      );
      if (!t.ok) return { ok: false as const, status: t.status, error: t.error };

      let conditionHistoryId: number | null = null;
      if (restoredGrade) {
        await client.query(
          `UPDATE serial_units SET condition_grade = $2::condition_grade_enum, updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
          [unit.id, restoredGrade, orgId],
        );
        const h = await client.query<{ id: number }>(
          `INSERT INTO serial_unit_condition_history (
               serial_unit_id, assessed_by_staff_id, prev_grade, new_grade, inventory_event_id, cosmetic_notes, organization_id
             ) VALUES ($1, $2, $3::condition_grade_enum, $4::condition_grade_enum, $5, $6, $7) RETURNING id`,
          [unit.id, actorStaffIdTop, unit.condition_grade, restoredGrade, t.eventId, 'test reset: verdict cleared', orgId],
        );
        conditionHistoryId = h.rows[0]?.id ?? null;
      }

      return {
        ok: true as const,
        serialUnitId: unit.id,
        prevStatus: cur,
        nextStatus: target,
        prevGrade: unit.condition_grade,
        newGrade: restoredGrade ?? unit.condition_grade,
        inventoryEventId: t.eventId,
        conditionHistoryId,
      };
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      serial_unit_id: result.serialUnitId,
      prev_status: result.prevStatus,
      next_status: result.nextStatus,
      prev_grade: result.prevGrade,
      new_grade: result.newGrade,
      inventory_event_id: result.inventoryEventId,
      condition_history_id: result.conditionHistoryId,
    });
  }
  const validGrades = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'];
  if (conditionGradeInput && !validGrades.includes(conditionGradeInput)) {
    return NextResponse.json(
      { ok: false, error: `condition_grade must be one of ${validGrades.join(', ')}` },
      { status: 400 },
    );
  }

  const nextStatus = action === 'start' ? 'IN_TEST' : action === 'pass' ? 'GRADED' : 'IN_REPAIR';
  const eventType = action === 'start' ? 'TEST_START' : action === 'pass' ? 'TEST_PASS' : 'TEST_FAIL';

  const result = await withTenantTransaction(orgId, async (client) => {
    // 1. Resolve the unit. Prefer id; fall back to normalized serial.
    const unitQ = serialUnitIdInput
      ? await client.query<{ id: number; sku: string | null; current_status: string; condition_grade: string | null }>(
          `SELECT id, sku, current_status::text AS current_status, condition_grade::text AS condition_grade
              FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [serialUnitIdInput, orgId],
        )
      : await client.query<{ id: number; sku: string | null; current_status: string; condition_grade: string | null }>(
          `SELECT id, sku, current_status::text AS current_status, condition_grade::text AS condition_grade
              FROM serial_units WHERE normalized_serial = UPPER(TRIM($1)) AND organization_id = $2 LIMIT 1`,
          [serialNumberInput, orgId],
        );
    const unit = unitQ.rows[0];
    if (!unit) {
      return {
        ok: false as const,
        error: 'serial_units row not found',
        status: 404,
      };
    }

    const prevStatus = unit.current_status;
    const prevGrade = unit.condition_grade;

    const actorStaffId: number | null =
      typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

    // 2. Transition the unit (status only) through the state machine.
    //    Optionally update condition_grade on PASS via a separate guarded UPDATE.
    const setGrade =
      action === 'pass' && !!conditionGradeInput && conditionGradeInput !== prevGrade;
    const eventPayload = {
      source: 'tech.test-result',
      action,
      condition_grade: setGrade ? conditionGradeInput : prevGrade,
    };

    let eventId: number | null = null;
    if (prevStatus === nextStatus) {
      // IDENTITY — transition() would 409 (from===to), e.g. re-grading an
      // already-GRADED unit via 'pass' or re-starting an IN_TEST unit. Emit
      // the event directly; status is already correct.
      const ev = await recordInventoryEvent(
        {
          event_type: eventType,
          actor_staff_id: actorStaffId,
          station: 'TECH',
          serial_unit_id: unit.id,
          sku: unit.sku,
          prev_status: prevStatus,
          next_status: nextStatus,
          client_event_id: clientEventId,
          notes,
          payload: eventPayload,
        },
        client,
        orgId,
      );
      eventId = ev.id;
    } else {
      const t = await transition(
        {
          unitId: unit.id,
          to: nextStatus,
          eventType,
          actorStaffId,
          station: 'TECH',
          clientEventId,
          notes,
          payload: eventPayload,
        },
        client,
        orgId,
      );
      if (!t.ok) return { ok: false as const, status: t.status, error: t.error };
      eventId = t.eventId;
    }

    // 3. transition()/recordInventoryEvent write current_status only; apply the
    //    condition_grade change as a SEPARATE guarded UPDATE.
    if (setGrade) {
      await client.query(
        `UPDATE serial_units SET condition_grade = $2::condition_grade_enum, updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
        [unit.id, conditionGradeInput, orgId],
      );
    }

    // 4. Condition history — append if grade actually changed.
    let conditionHistoryId: number | null = null;
    if (setGrade) {
      const hist = await client.query<{ id: number }>(
        `INSERT INTO serial_unit_condition_history (
            serial_unit_id, assessed_by_staff_id,
            prev_grade, new_grade,
            inventory_event_id, cosmetic_notes,
            organization_id
          )
          VALUES ($1, $2, $3::condition_grade_enum, $4::condition_grade_enum, $5, $6, $7)
          RETURNING id`,
        [
          unit.id,
          actorStaffId,
          prevGrade,
          conditionGradeInput,
          eventId,
          notes,
          orgId,
        ],
      );
      conditionHistoryId = hist.rows[0]?.id ?? null;
    }

    return {
      ok: true as const,
      serialUnitId: unit.id,
      prevStatus,
      nextStatus,
      prevGrade,
      newGrade: setGrade ? conditionGradeInput : prevGrade,
      inventoryEventId: eventId,
      conditionHistoryId,
    };
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    serial_unit_id: result.serialUnitId,
    prev_status: result.prevStatus,
    next_status: result.nextStatus,
    prev_grade: result.prevGrade,
    new_grade: result.newGrade,
    inventory_event_id: result.inventoryEventId,
    condition_history_id: result.conditionHistoryId,
  });
}, { permission: 'tech.scan_serial' });
