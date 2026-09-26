/** Receiving-triage → feed_memberships projection (universal-feed plan Phase 4 "backfill shared memberships for receiving triage"). */

import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';

interface TriageProjectionResult {
  success: boolean;
  /** active/needs_match rows upserted for cartons currently in triage. */
  upserted: number;
  /** existing rows flipped to 'done' because their carton left triage. */
  doneFlipped: number;
  windowDays: number;
}

export interface FeedProjectionDeps {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

const defaultDeps: FeedProjectionDeps = { execute: (q) => db.execute(q) };

export async function projectReceivingTriageMemberships(
  windowDays = 90,
  deps: FeedProjectionDeps = defaultDeps,
): Promise<TriageProjectionResult> {
  const days = Number.isFinite(windowDays) ? Math.max(1, Math.min(Math.round(windowDays), 365)) : 90;

  // 1. Upsert the cartons currently in triage as active / needs_match.
  const upsert = await deps.execute(sql`
    INSERT INTO feed_memberships
      (organization_id, feed_key, entity_type, entity_id, state, occurred_at, title, tone, priority_tier)
    SELECT r.organization_id,
           'receiving_triage',
           'RECEIVING',
           r.id,
           CASE WHEN r.source = 'unmatched' THEN 'needs_match' ELSE 'active' END,
           COALESCE(rt.door_received_at, r.receiving_date_time, r.created_at),
           COALESCE(
             (SELECT rl.item_name FROM receiving_line rl
               WHERE rl.receiving_id = r.id AND rl.item_name IS NOT NULL
               ORDER BY rl.id LIMIT 1),
             r.zoho_purchaseorder_number,
             'Carton #' || r.id
           ),
           CASE WHEN r.source = 'unmatched' THEN 'warning' ELSE 'default' END,
           r.priority_tier
      FROM receiving_carton r
      LEFT JOIN receiving_triage rt
        ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
      LEFT JOIN receiving_unbox ru
        ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
     WHERE COALESCE(rt.triage_complete, false) = false
       AND ru.unboxed_at IS NULL
       AND ru.opened_at IS NULL
       AND COALESCE(rt.door_received_at, r.receiving_date_time, r.created_at) >= NOW() - make_interval(days => ${days})
       AND (
         -- matched, arrived at dock, awaiting triage
         (rt.door_received_at IS NOT NULL AND r.source IS DISTINCT FROM 'unmatched')
         OR
         -- unfound / unmatched (the Unfound tab) — any source='unmatched' carton,
         -- with or without lines (mirrors the live v_unfound_queue)
         r.source = 'unmatched'
       )
    ON CONFLICT (organization_id, feed_key, entity_type, entity_id)
    DO UPDATE SET state = EXCLUDED.state,
                  occurred_at = EXCLUDED.occurred_at,
                  title = EXCLUDED.title,
                  tone = EXCLUDED.tone,
                  priority_tier = EXCLUDED.priority_tier,
                  updated_at = NOW()
    RETURNING id
  `);

  // 2. Flip existing memberships to 'done' once their carton leaves triage
  //    (triaged, or moved to unbox). Only touches rows already projected.
  const flipped = await deps.execute(sql`
    UPDATE feed_memberships fm
       SET state = 'done', updated_at = NOW()
      FROM receiving_carton r
      LEFT JOIN receiving_triage rt
        ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
      LEFT JOIN receiving_unbox ru
        ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
     WHERE fm.organization_id = r.organization_id
       AND fm.feed_key = 'receiving_triage'
       AND fm.entity_type = 'RECEIVING'
       AND fm.entity_id = r.id
       AND fm.state <> 'done'
       AND (COALESCE(rt.triage_complete, false) = true OR ru.unboxed_at IS NOT NULL OR ru.opened_at IS NOT NULL)
    RETURNING fm.id
  `);

  return {
    success: true,
    upserted: upsert.rows.length,
    doneFlipped: flipped.rows.length,
    windowDays: days,
  };
}
