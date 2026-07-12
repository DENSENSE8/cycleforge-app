import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

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
 *     the share that were still unpaired (pairing_state != 'MATCHED') at save
 *     time — how often B5 (save-while-unfound) actually gets used.
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
           AND COALESCE(rt.pairing_state, 'UNFOUND') <> 'MATCHED'
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
