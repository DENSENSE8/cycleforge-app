/** Lazy materialisation of `receiving_line_unit` — Phase 1 of the per-unit "no serial" plan… */

import { tenantQueryOneTrip, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { refreshReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';

/** A `receiving_line_unit` row as the planner needs it. */
export interface ExistingLineUnit {
  /** Durable identity. Never renumbered. */
  id: number;
  /** Display order within the line (1-based). Not an identity. */
  ordinal: number;
  /** Linked serial, or null for a not-yet-scanned unit. */
  serialUnitId: number | null;
  /** Operator waived the serial for THIS unit — not a free slot. */
  serialAbsent: boolean;
}

/** One line's materialisation input. */
export interface EnsureLineUnitsLine {
  lineId: number;
  /** `receiving_line.quantity_expected` — null/0 means no expectation yet. */
  expectedQty: number | null;
  /** Current `serial_units.id`s on this line, in SCAN ORDER (oldest first). */
  serialIds: ReadonlyArray<number>;
}

interface PlanLineUnitsInput extends Omit<EnsureLineUnitsLine, 'lineId'> {
  /** Rows already materialised for this line (any order). */
  existing: ReadonlyArray<ExistingLineUnit>;
}

/** What {@link ensureLineUnits} must write to converge one line. */
export interface LineUnitPlan {
  /** Ordinals to append. Always above every existing ordinal. */
  insertOrdinals: number[];
  /** Unit ids whose `serial_unit_id` must be cleared — the serial left this line. */
  releaseUnitIds: number[];
  /** Serial → slot assignments, by ordinal (unique per line, so id-free). */
  attach: Array<{ ordinal: number; serialUnitId: number }>;
  /** Rows this line should have once applied. */
  targetCount: number;
  /** Serials with nowhere to land (every slot taken or waived). Diagnostic only. */
  unplacedSerialIds: number[];
  /** Nothing to write — the caller skips the transaction entirely. */
  noop: boolean;
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Decide what a line needs to converge. Pure: no I/O, no clock, no randomness.
 *
 * Idempotency comes from the plan being empty once the line is converged —
 * a second run over the resulting rows returns `noop: true`.
 */
export function planLineUnits(input: PlanLineUnitsInput): LineUnitPlan {
  const existing = [...input.existing].sort((a, b) => a.ordinal - b.ordinal);
  const expected = Math.max(0, Math.floor(Number(input.expectedQty ?? 0)) || 0);

  // De-dupe defensively: the same serial must never claim two slots
  // (ux_receiving_line_unit_serial would reject it anyway).
  const serialIds: number[] = [];
  const seenSerials = new Set<number>();
  for (const raw of input.serialIds) {
    const id = toPositiveInt(raw);
    if (id == null || seenSerials.has(id)) continue;
    seenSerials.add(id);
    serialIds.push(id);
  }

  // Never shrink: surplus rows from a lowered quantity_expected survive.
  const targetCount = Math.max(expected, serialIds.length, existing.length);

  const maxOrdinal = existing.reduce((max, u) => Math.max(max, u.ordinal), 0);
  const insertOrdinals: number[] = [];
  for (let i = 1; i <= targetCount - existing.length; i += 1) {
    insertOrdinals.push(maxOrdinal + i);
  }

  // A claim survives only while its serial is still on this line. Anything else
  // is released — the unit row and its waiver/grade stay put, which is what
  // makes "delete a scanned serial" leave the rest of the line untouched.
  const releaseUnitIds: number[] = [];
  const keptSerials = new Set<number>();
  for (const unit of existing) {
    if (unit.serialUnitId == null) continue;
    if (seenSerials.has(unit.serialUnitId)) keptSerials.add(unit.serialUnitId);
    else releaseUnitIds.push(unit.id);
  }

  // Free slots, lowest ordinal first: unclaimed existing rows, rows we just
  // released, and every row we are about to insert. Waived rows are excluded.
  const releasing = new Set(releaseUnitIds);
  const freeOrdinals = existing
    .filter((u) => !u.serialAbsent && (u.serialUnitId == null || releasing.has(u.id)))
    .map((u) => u.ordinal)
    .concat(insertOrdinals)
    .sort((a, b) => a - b);

  const attach: Array<{ ordinal: number; serialUnitId: number }> = [];
  const unplacedSerialIds: number[] = [];
  let slot = 0;
  for (const serialUnitId of serialIds) {
    if (keptSerials.has(serialUnitId)) continue; // already parked on this line
    if (slot >= freeOrdinals.length) {
      unplacedSerialIds.push(serialUnitId);
      continue;
    }
    attach.push({ ordinal: freeOrdinals[slot], serialUnitId });
    slot += 1;
  }

  return {
    insertOrdinals,
    releaseUnitIds,
    attach,
    targetCount,
    unplacedSerialIds,
    noop:
      insertOrdinals.length === 0 && releaseUnitIds.length === 0 && attach.length === 0,
  };
}

/** Injectable collaborators for {@link ensureLineUnits} (real impls by default). */
export interface EnsureLineUnitsDeps {
  /** Load already-materialised rows for these lines, grouped by line id. */
  loadUnits: (
    orgId: OrgId,
    lineIds: number[],
  ) => Promise<Map<number, ExistingLineUnit[]>>;
  /** Apply one line's non-empty plan. Never called for a noop plan. */
  applyPlan: (orgId: OrgId, lineId: number, plan: LineUnitPlan) => Promise<void>;
  /** Refresh the rebuildable fast-status projection after a material change. */
  refreshFacts?: (orgId: OrgId, lineId: number) => Promise<void>;
}

/**
 * Load `receiving_line_unit` rows for a set of lines, org-scoped. Internal to
 * the default deps for now — Phase 2's read model is the first caller that
 * needs it exported.
 */
async function loadLineUnits(
  orgId: OrgId,
  lineIds: number[],
): Promise<Map<number, ExistingLineUnit[]>> {
  const grouped = new Map<number, ExistingLineUnit[]>();
  if (lineIds.length === 0) return grouped;

  const result = await tenantQueryOneTrip(
    orgId,
    `SELECT id, receiving_line_id, ordinal, serial_unit_id, serial_absent
       FROM receiving_line_unit
      WHERE organization_id = $2 AND receiving_line_id = ANY($1::int[])
      ORDER BY receiving_line_id ASC, ordinal ASC`,
    [lineIds, orgId],
  );

  for (const row of result.rows) {
    const lineId = Number(row.receiving_line_id);
    if (!Number.isFinite(lineId)) continue;
    const unit: ExistingLineUnit = {
      // BIGSERIAL arrives as a string from node-postgres (no int8 parser here).
      id: Number(row.id),
      ordinal: Number(row.ordinal),
      serialUnitId: row.serial_unit_id != null ? Number(row.serial_unit_id) : null,
      serialAbsent: !!row.serial_absent,
    };
    const bucket = grouped.get(lineId);
    if (bucket) bucket.push(unit);
    else grouped.set(lineId, [unit]);
  }

  return grouped;
}

/** Apply one line's plan inside a single tenant transaction. */
async function applyLineUnitPlan(
  orgId: OrgId,
  lineId: number,
  plan: LineUnitPlan,
): Promise<void> {
  if (plan.noop) return;

  await withTenantTransaction(orgId, async (client) => {
    if (plan.insertOrdinals.length > 0) {
      // ON CONFLICT DO NOTHING: two tabs opening the same carton at once both
      // plan the same appends, and the loser must be a no-op, not a 23505.
      await client.query(
        `INSERT INTO receiving_line_unit (organization_id, receiving_line_id, ordinal)
         SELECT $1::uuid, $2::int, o FROM unnest($3::int[]) AS o
         ON CONFLICT (organization_id, receiving_line_id, ordinal) DO NOTHING`,
        [orgId, lineId, plan.insertOrdinals],
      );
    }

    if (plan.releaseUnitIds.length > 0) {
      await client.query(
        `UPDATE receiving_line_unit
            SET serial_unit_id = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
        [orgId, plan.releaseUnitIds],
      );
    }

    if (plan.attach.length > 0) {
      const serialIds = plan.attach.map((a) => a.serialUnitId);

      // A returned-then-re-received serial is still parked on its previous line's unit row.
      await client.query(
        `UPDATE receiving_line_unit
            SET serial_unit_id = NULL, updated_at = now()
          WHERE organization_id = $1
            AND receiving_line_id <> $2
            AND serial_unit_id = ANY($3::int[])`,
        [orgId, lineId, serialIds],
      );

      await client.query(
        `UPDATE receiving_line_unit AS u
            SET serial_unit_id = v.serial_unit_id, updated_at = now()
           FROM (SELECT * FROM unnest($3::int[], $4::int[]) AS t(ordinal, serial_unit_id)) AS v
          WHERE u.organization_id = $1
            AND u.receiving_line_id = $2
            AND u.ordinal = v.ordinal`,
        [orgId, lineId, plan.attach.map((a) => a.ordinal), serialIds],
      );
    }
  });
}

const defaultDeps: EnsureLineUnitsDeps = {
  loadUnits: loadLineUnits,
  applyPlan: applyLineUnitPlan,
  refreshFacts: (orgId, lineId) =>
    refreshReceivingUnitStageFacts(orgId, { lineIds: [lineId] }).then(() => undefined),
};

/** Materialise `receiving_line_unit` rows for the given lines. */
export async function ensureLineUnits(
  orgId: OrgId,
  lines: ReadonlyArray<EnsureLineUnitsLine>,
  deps: EnsureLineUnitsDeps = defaultDeps,
): Promise<Map<number, LineUnitPlan>> {
  const plans = new Map<number, LineUnitPlan>();

  const byId = new Map<number, EnsureLineUnitsLine>();
  for (const line of lines) {
    const lineId = toPositiveInt(line.lineId);
    if (lineId == null || byId.has(lineId)) continue;
    byId.set(lineId, line);
  }
  if (byId.size === 0) return plans;

  const lineIds = Array.from(byId.keys());
  const existingByLine = await deps.loadUnits(orgId, lineIds);

  for (const [lineId, line] of byId) {
    const plan = planLineUnits({
      expectedQty: line.expectedQty,
      serialIds: line.serialIds,
      existing: existingByLine.get(lineId) ?? [],
    });
    plans.set(lineId, plan);
    if (!plan.noop) {
      await deps.applyPlan(orgId, lineId, plan);
      await deps.refreshFacts?.(orgId, lineId);
    }
  }

  return plans;
}

/**
 * Best-effort {@link ensureLineUnits} for read paths — materialisation must never fail the read that triggered it.
 *
 * `existing`, when the caller already read every listed line's units (lines without units simply absent),
 * replaces the load. Resolves true when something was (or may have been) written — the caller's units are stale.
 */
export async function ensureLineUnitsSafe(
  orgId: OrgId,
  lines: ReadonlyArray<EnsureLineUnitsLine>,
  existing?: ReadonlyMap<number, ExistingLineUnit[]>,
): Promise<boolean> {
  try {
    const plans = await ensureLineUnits(
      orgId,
      lines,
      existing
        ? { ...defaultDeps, loadUnits: async () => new Map(existing) }
        : defaultDeps,
    );
    for (const plan of plans.values()) if (!plan.noop) return true;
    return false;
  } catch (err) {
    console.warn('[receiving-line-unit] materialisation failed (non-fatal)', err);
    return true;
  }
}
