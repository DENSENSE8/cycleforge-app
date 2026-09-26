/** Nightly signal → insight_links rollup (universal-feed plan Phase 5 learning loop). */

import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';

interface SignalRollupResult {
  success: boolean;
  /** insight_links rows written/updated (one per (org, signal_kind) with signals in window). */
  rowsWritten: number;
  windowDays: number;
}

export interface SignalRollupDeps {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

const defaultDeps: SignalRollupDeps = { execute: (q) => db.execute(q) };

/** How many top reason codes to keep per (org, signal_kind) rollup. */
const TOP_REASONS = 5;

/**
 * Aggregate entity_signals from the trailing `windowDays` into per-org
 * insight_links rollup rows. Returns the row count touched.
 */
export async function runSignalInsightRollup(
  windowDays = 30,
  deps: SignalRollupDeps = defaultDeps,
): Promise<SignalRollupResult> {
  const days = Number.isFinite(windowDays) ? Math.max(1, Math.min(Math.round(windowDays), 365)) : 30;

  // CTE chain: per-reason counts (incl.
  const result = await deps.execute(sql`
    WITH per_reason AS (
      SELECT s.organization_id,
             s.signal_kind,
             s.reason_code,
             COUNT(*)::int AS n
        FROM entity_signals s
       WHERE s.occurred_at >= NOW() - make_interval(days => ${days})
       GROUP BY s.organization_id, s.signal_kind, s.reason_code
    ),
    totals AS (
      -- total volume INCLUDES the NULL-reason bucket (all signals of the kind).
      SELECT organization_id, signal_kind, SUM(n)::int AS total
        FROM per_reason
       GROUP BY organization_id, signal_kind
    ),
    ranked AS (
      -- rank ONLY real reason codes; the NULL bucket never consumes a rank slot.
      SELECT organization_id, signal_kind, reason_code, n,
             ROW_NUMBER() OVER (
               PARTITION BY organization_id, signal_kind
               ORDER BY n DESC, reason_code
             ) AS rk
        FROM per_reason
       WHERE reason_code IS NOT NULL
    ),
    reason_roll AS (
      SELECT organization_id,
             signal_kind,
             COUNT(*)::int AS distinct_reasons,
             COALESCE(
               jsonb_agg(
                 jsonb_build_object('reason_code', reason_code, 'n', n)
                 ORDER BY n DESC, reason_code
               ) FILTER (WHERE rk <= ${TOP_REASONS}),
               '[]'::jsonb
             ) AS top_reasons
        FROM ranked
       GROUP BY organization_id, signal_kind
    )
    INSERT INTO insight_links
      (organization_id, linkage_type, subject_kind, subject_ref, metrics, source)
    SELECT t.organization_id,
           'org_signal_rollup',
           'signal_kind',
           t.signal_kind,
           jsonb_build_object(
             'window_days', ${days}::int,
             'total', t.total,
             'distinct_reasons', COALESCE(rr.distinct_reasons, 0),
             'top_reasons', COALESCE(rr.top_reasons, '[]'::jsonb),
             'computed_at', NOW()
           ),
           'org_rollup'
      FROM totals t
      LEFT JOIN reason_roll rr
        ON rr.organization_id = t.organization_id AND rr.signal_kind = t.signal_kind
    ON CONFLICT (organization_id, linkage_type, subject_kind, subject_ref)
      WHERE organization_id IS NOT NULL AND subject_ref IS NOT NULL
    DO UPDATE SET metrics = EXCLUDED.metrics
    RETURNING id
  `);

  return { success: true, rowsWritten: result.rows.length, windowDays: days };
}
