import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { PAIRING_ANSWERED_STATES } from '@/lib/receiving/triage-focus';

/**
 * "Triage finished without answering the pairing question", in SQL.
 *
 * Derived from {@link PAIRING_ANSWERED_STATES} rather than hand-typed, so the
 * KPI and the bench (`isTriagePaired`) can never disagree about whether WAIVED
 * counts as done. Values are compile-time literals from that tuple — nothing
 * user-supplied reaches this string.
 *
 * The COALESCE is deliberate and is NOT the invented-default shape banned on
 * display paths: this is a filter, and it only ever sees cartons that already
 * have a `receiving_triage` row (`triage_complete = true` requires one). So the
 * null it fills is "the operator completed triage and recorded no pairing
 * answer" — which is exactly what this metric means to count.
 */
const PAIRING_UNANSWERED_SQL = `COALESCE(rt.pairing_state, 'UNFOUND') NOT IN (${PAIRING_ANSWERED_STATES.map(
  (s) => `'${s}'`,
).join(', ')})`;

/**
 * GET /api/receiving/triage/metrics — the two Phase 4 triage health numbers
 * (docs/receiving-triage-redesign-plan.md §6):
 *
 *   - avg_unfound_hours   — average age of the CURRENT unfound backlog (source
 *     = 'unmatched', not yet unboxed). A live backlog gauge, not a
 *     historical time-to-resolution metric — there's no "paired_at" stamp to
 *     compute a true resolution duration from, so this reports what's
 *     honestly computable today: how stale the queue is right now.
 *   - save_without_pair_rate — of cartons saved for unbox (triage_complete),
 *     the share that finished with the pairing question still UNANSWERED — how
 *     often B5 (save-while-unfound) actually gets used.
 *
 *     "Unanswered" is the complement of `PAIRING_ANSWERED_STATES`, not
 *     `!= 'MATCHED'` (corrected 2026-08-02). `settleReturnPairing` records
 *     `WAIVED` for a return serial that matches no order — the pairing hub
 *     looked and established there is no PO to find — and `isTriagePaired` has
 *     counted that as done since C6. Filing it as "skipped" would have made
 *     every triage-completed return inflate a metric whose name says the
 *     operator walked past the step.
 *
 *     KNOWN DEAD, and not fixed here: `receiving_triage.triage_complete` is
 *     true on **0 of 2474 dogfood rows**, so the denominator is zero, the rate
 *     is null, and `TriageKpiStrip` (which returns null on a null rate) has
 *     never rendered. The predicate is correct for when that changes; why it
 *     has not is a separate investigation —
 *     docs/todo/triage-complete-never-true-HANDOFF.md.
 *
 * Both are org-scoped, cheap aggregates — no new tables, no background job.
 */
interface MetricsRow {
  avg_unfound_hours: number | null;
  unfound_count: string;
  triage_complete_count: string;
  save_without_pair_count: string;
}

export const GET = withAuth(async (_request: NextRequest, ctx) => {
  const { rows } = await tenantQuery<MetricsRow>(
    ctx.organizationId,
    `SELECT
       -- receiving_date_time: Wave-4 decision, see plan Appendix
       (SELECT AVG(EXTRACT(EPOCH FROM (NOW() - r.receiving_date_time)) / 3600.0)
          FROM receiving_carton r
          LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
         WHERE r.organization_id = $1 AND r.source = 'unmatched' AND ru.unboxed_at IS NULL
       ) AS avg_unfound_hours,
       (SELECT COUNT(*)
          FROM receiving_carton r
          LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
         WHERE r.organization_id = $1 AND r.source = 'unmatched' AND ru.unboxed_at IS NULL
       ) AS unfound_count,
       (SELECT COUNT(*)
          FROM receiving_carton r
          LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         WHERE r.organization_id = $1 AND COALESCE(rt.triage_complete, false) = true
       ) AS triage_complete_count,
       (SELECT COUNT(*)
          FROM receiving_carton r
          LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         WHERE r.organization_id = $1 AND COALESCE(rt.triage_complete, false) = true
           AND ${PAIRING_UNANSWERED_SQL}
       ) AS save_without_pair_count`,
    [ctx.organizationId],
  );

  const row = rows[0];
  const triageCompleteCount = Number(row?.triage_complete_count ?? 0);
  const saveWithoutPairCount = Number(row?.save_without_pair_count ?? 0);

  return NextResponse.json({
    success: true,
    avg_unfound_hours: row?.avg_unfound_hours != null ? Number(row.avg_unfound_hours) : null,
    unfound_count: Number(row?.unfound_count ?? 0),
    triage_complete_count: triageCompleteCount,
    save_without_pair_count: saveWithoutPairCount,
    save_without_pair_rate: triageCompleteCount > 0 ? saveWithoutPairCount / triageCompleteCount : null,
  });
}, { permission: 'receiving.view' });
