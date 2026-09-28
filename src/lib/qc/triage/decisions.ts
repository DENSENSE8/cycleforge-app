/** qc_triage_decisions writes: every suggested step, then the tech's accept/reject on it. */

import { randomUUID } from 'node:crypto';

import type { TriageDecisionBody, TriageDecisionWrite, TriageSuggestion } from '@/lib/qc/triage/contracts';
import type { TriageUnit } from '@/lib/qc/triage/load';
import type { TriageRankedStep } from '@/lib/qc/triage/rank';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export async function insertTriageSuggestions(
  orgId: OrgId,
  args: {
    unit: TriageUnit;
    qcSessionId: number | null;
    steps: TriageRankedStep[];
    rankedBy: 'DETERMINISTIC' | 'AI';
    model: string | null;
    staffId: number;
  },
): Promise<{ requestId: string; suggestions: TriageSuggestion[] }> {
  const requestId = randomUUID();
  if (args.steps.length === 0) return { requestId, suggestions: [] };
  const ids = await withTenantTransaction(orgId, async (client) => {
    const r = await client.query<{ id: string; step_key: string }>(
      `INSERT INTO qc_triage_decisions
              (organization_id, serial_unit_id, qc_session_id, request_id, sku, device_family,
               failure_mode_id, step_key, step, kind, why, evidence, confidence, rank,
               ranked_by, model, suggested_by_staff_id)
       SELECT $1, $2, $3, $4, $5, $6, s.failure_mode_id, s.step_key, s.step, s.kind, s.why, s.evidence,
              s.confidence, s.rank, $7, $8, $9
         FROM jsonb_to_recordset($10::jsonb) AS s(
                failure_mode_id int, step_key text, step text, kind text, why text,
                evidence jsonb, confidence numeric, rank int)
       RETURNING id::text, step_key`,
      [
        orgId,
        args.unit.id,
        args.qcSessionId,
        requestId,
        args.unit.sku,
        args.unit.family,
        args.rankedBy,
        args.model,
        args.staffId,
        JSON.stringify(
          args.steps.map((s, i) => ({
            failure_mode_id: s.failureModeId,
            step_key: s.key,
            step: s.step,
            kind: s.kind,
            why: s.why,
            evidence: s.evidence,
            confidence: s.confidence,
            rank: i + 1,
          })),
        ),
      ],
    );
    return new Map(r.rows.map((row) => [row.step_key, Number(row.id)]));
  });
  return {
    requestId,
    suggestions: args.steps.map((s, i) => ({
      id: ids.get(s.key) as number,
      rank: i + 1,
      key: s.key,
      step: s.step,
      kind: s.kind,
      why: s.why,
      evidence: s.evidence,
      confidence: s.confidence,
      failureModeId: s.failureModeId,
    })),
  };
}

/** Records (or changes) the human decision on one suggestion; null when it is not this org's. */
export async function recordTriageDecision(
  orgId: OrgId,
  body: TriageDecisionBody,
  staffId: number,
): Promise<TriageDecisionWrite | null> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<{ decided_at: Date; changed: boolean }>(
      `WITH prev AS (
         SELECT id, decision FROM qc_triage_decisions
          WHERE id = $1 AND organization_id = $2
          FOR UPDATE
       )
       UPDATE qc_triage_decisions d
          SET decision = $3,
              -- An omitted note keeps the recorded one; an explicit null clears it.
              decision_note = CASE WHEN $6 THEN $4 ELSE d.decision_note END,
              decided_by_staff_id = $5,
              decided_at = CASE WHEN prev.decision IS DISTINCT FROM $3 THEN NOW() ELSE d.decided_at END
         FROM prev
        WHERE d.id = prev.id AND d.organization_id = $2
    RETURNING d.decided_at, prev.decision IS DISTINCT FROM $3 AS changed`,
      [body.suggestionId, orgId, body.decision, body.note ?? null, staffId, body.note !== undefined],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      suggestionId: body.suggestionId,
      decision: body.decision,
      decidedAt: new Date(row.decided_at).toISOString(),
      changed: row.changed,
    };
  });
}
