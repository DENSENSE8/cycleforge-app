/**
 * Gathers everything the triage ranker reads for one unit, in one tenant
 * transaction: device readings + codes (optionally one session's), checklist
 * results, failure tags, the latest verdict, the unit's completed repairs, and
 * — for the same SKU / device family — repair resolution history and past
 * triage decisions.
 */

import type { PoolClient } from 'pg';

import { normalizeUnitRepairParts } from '@/lib/counter/visit-provenance';
import type {
  TriageCodeSignal,
  TriageFailureTagSignal,
  TriagePastDecision,
  TriageRankInput,
  TriageReadingSignal,
  TriageResolution,
  TriageScope,
  TriageStepKind,
  TriageVerdictSignal,
} from '@/lib/qc/triage/rank';
import type { OrgId } from '@/lib/tenancy/constants';

export interface TriageUnit {
  id: number;
  sku: string | null;
  family: string | null;
}

export class TriageInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

/** Newest readings considered; the latest per kind+code wins. */
const READINGS_LIMIT = 200;
const RESOLUTIONS_LIMIT = 500;
const DECISIONS_LIMIT = 1000;

function readingText(value: unknown): string {
  if (value && typeof value === 'object' && 'value' in value) {
    const v = (value as { value: unknown }).value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const unit = (value as { unit?: unknown }).unit;
      return typeof unit === 'string' && unit ? `${v} ${unit}` : String(v);
    }
  }
  return JSON.stringify(value);
}

export async function loadTriageInput(
  client: PoolClient,
  orgId: OrgId,
  serialUnitId: number,
  qcSessionId: number | null,
): Promise<{ unit: TriageUnit; input: TriageRankInput }> {
  const unitRes = await client.query<{ id: number; sku: string | null; family: string | null }>(
    `SELECT su.id, su.sku, sc.category AS family
       FROM serial_units su
  LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id AND sc.organization_id = su.organization_id
      WHERE su.id = $1 AND su.organization_id = $2`,
    [serialUnitId, orgId],
  );
  const unit = unitRes.rows[0];
  if (!unit) throw new TriageInputError('unit not found', 404);

  if (qcSessionId != null) {
    const s = await client.query<{ serial_unit_id: number | null }>(
      `SELECT serial_unit_id FROM qc_sessions WHERE id = $1 AND organization_id = $2`,
      [qcSessionId, orgId],
    );
    if (!s.rows[0]) throw new TriageInputError('session not found', 404);
    if (s.rows[0].serial_unit_id !== serialUnitId) throw new TriageInputError('session is not on this unit', 400);
  }

  const readingsRes = await client.query<{
    id: string;
    kind: string;
    code: string | null;
    value: unknown;
    code_meaning: string | null;
    code_severity: string | null;
  }>(
    `SELECT dr.id::text, dr.kind, dr.code, dr.value,
            dc.meaning AS code_meaning, dc.severity AS code_severity
       FROM diagnostic_readings dr
  LEFT JOIN LATERAL (
              SELECT meaning, severity
                FROM diagnostic_codes dc
               WHERE dc.organization_id = dr.organization_id
                 AND dc.code = dr.code
                 AND dc.active
                 AND (dc.device_family = $4 OR dc.device_family IS NULL)
            ORDER BY (dc.device_family IS NULL)
               LIMIT 1
            ) dc ON dr.code IS NOT NULL
      WHERE dr.organization_id = $1
        AND dr.serial_unit_id = $2
        AND ($3::bigint IS NULL OR dr.qc_session_id = $3)
   ORDER BY dr.read_at DESC, dr.id DESC
      LIMIT ${READINGS_LIMIT}`,
    [orgId, serialUnitId, qcSessionId, unit.family],
  );
  const readings: TriageReadingSignal[] = [];
  const codes: TriageCodeSignal[] = [];
  const seen = new Set<string>();
  for (const r of readingsRes.rows) {
    const identity = `${r.kind}|${r.code ?? ''}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const payload = r.value && typeof r.value === 'object' ? (r.value as Record<string, unknown>) : {};
    if (r.code) {
      // Catalogued INFO codes are facts, not faults.
      if (r.code_severity === 'INFO') continue;
      codes.push({
        id: r.id,
        code: r.code,
        label: [r.code_meaning, r.code_severity].filter(Boolean).join(' · '),
        failureModeId: null,
      });
      continue;
    }
    readings.push({
      id: r.id,
      key: r.kind,
      label: typeof payload.label === 'string' ? payload.label : r.kind,
      value: readingText(r.value),
      passed: typeof payload.passed === 'boolean' ? payload.passed : null,
      failureModeId: null,
    });
  }

  const checklistRes = await client.query<{
    step_id: number;
    step_label: string;
    passed: boolean | null;
    value_num: string | null;
    value_text: string | null;
    value_unit: string | null;
    failure_mode_id: number | null;
  }>(
    `SELECT qc.id AS step_id, qc.step_label, tv.passed, tv.value_num::text, tv.value_text, qc.value_unit,
            COALESCE(tv.failed_mode_id, qc.failure_mode_id) AS failure_mode_id
       FROM tech_verifications tv
       JOIN qc_check_templates qc ON qc.id = tv.step_id AND qc.organization_id = tv.organization_id
      WHERE tv.organization_id = $1
        AND tv.source_kind = 'serial_unit'
        AND tv.step_type = 'QC'
        AND tv.source_row_id = $2
   ORDER BY qc.sort_order, qc.id`,
    [orgId, serialUnitId],
  );

  const tagsRes = await client.query<{ id: number; failure_mode_id: number; resolution_status: TriageFailureTagSignal['status'] }>(
    `SELECT id, failure_mode_id, resolution_status
       FROM unit_failure_tags
      WHERE organization_id = $1 AND serial_unit_id = $2`,
    [orgId, serialUnitId],
  );

  const verdictRes = await client.query<{ id: number; verdict: TriageVerdictSignal['verdict']; at: string; notes: string | null }>(
    `SELECT id, verdict, created_at AS at, NULLIF(TRIM(notes), '') AS notes
       FROM testing_results
      WHERE organization_id = $1 AND serial_unit_id = $2
   ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [orgId, serialUnitId],
  );

  const repairsRes = await client.query<{ id: number; summary: string; completed_at: string }>(
    `SELECT id, summary, completed_at
       FROM unit_repairs
      WHERE organization_id = $1 AND serial_unit_id = $2 AND status = 'completed' AND completed_at IS NOT NULL
   ORDER BY completed_at DESC
      LIMIT 20`,
    [orgId, serialUnitId],
  );

  const modesRes = await client.query<{ id: number; code: string; label: string }>(
    `SELECT id, code, label FROM failure_modes WHERE organization_id = $1`,
    [orgId],
  );

  const checklist = checklistRes.rows.map((r) => ({
    stepId: r.step_id,
    label: r.step_label,
    passed: r.passed,
    value:
      r.value_num != null ? `${r.value_num}${r.value_unit ? ` ${r.value_unit}` : ''}` : r.value_text?.trim() || null,
    failureModeId: r.failure_mode_id,
  }));
  // unit_failure_tags.id is bigint — pg hands it back as a string.
  const failureTags = tagsRes.rows.map((r) => ({ id: Number(r.id), failureModeId: r.failure_mode_id, status: r.resolution_status }));

  const suspectedModes = [
    ...new Set([
      ...failureTags.filter((t) => t.status === 'open').map((t) => t.failureModeId),
      ...checklist.filter((c) => c.passed === false && c.failureModeId != null).map((c) => c.failureModeId as number),
    ]),
  ];

  let resolutions: TriageResolution[] = [];
  let decisions: TriagePastDecision[] = [];
  if (unit.sku != null || unit.family != null) {
    if (suspectedModes.length > 0) {
      const res = await client.query<{
        repair_id: number;
        failure_mode_id: number;
        status: 'completed' | 'failed';
        parts_used: unknown;
        summary: string;
        scope: TriageScope;
      }>(
        `SELECT ur.id AS repair_id, rfr.failure_mode_id, ur.status, ur.parts_used, ur.summary,
                CASE WHEN su.sku = $3 THEN 'sku' ELSE 'family' END AS scope
           FROM repair_failure_resolutions rfr
           JOIN unit_repairs ur ON ur.id = rfr.repair_id AND ur.organization_id = rfr.organization_id
           JOIN serial_units su ON su.id = ur.serial_unit_id AND su.organization_id = ur.organization_id
      LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id AND sc.organization_id = su.organization_id
          WHERE rfr.organization_id = $1
            AND rfr.failure_mode_id = ANY($2::int[])
            AND ur.status IN ('completed', 'failed')
            AND (su.sku = $3 OR ($4::text IS NOT NULL AND sc.category = $4))
       ORDER BY ur.completed_at DESC NULLS LAST, ur.id DESC
          LIMIT ${RESOLUTIONS_LIMIT}`,
        [orgId, suspectedModes, unit.sku, unit.family],
      );
      resolutions = res.rows.map((r) => ({
        repairId: r.repair_id,
        failureModeId: r.failure_mode_id,
        scope: r.scope,
        status: r.status,
        parts: normalizeUnitRepairParts(r.parts_used).map((p) => p.description),
        summary: r.summary ?? '',
      }));
    }

    const dRes = await client.query<{
      step_key: string;
      step: string;
      kind: TriageStepKind;
      failure_mode_id: number | null;
      decision: 'ACCEPTED' | 'REJECTED';
      scope: TriageScope;
    }>(
      `SELECT step_key, step, kind, failure_mode_id, decision,
              CASE WHEN sku = $2 THEN 'sku' ELSE 'family' END AS scope
         FROM qc_triage_decisions
        WHERE organization_id = $1
          AND decision IS NOT NULL
          AND (sku = $2 OR ($3::text IS NOT NULL AND device_family = $3))
     ORDER BY decided_at DESC
        LIMIT ${DECISIONS_LIMIT}`,
      [orgId, unit.sku, unit.family],
    );
    decisions = dRes.rows.map((r) => ({
      stepKey: r.step_key,
      step: r.step,
      kind: r.kind,
      failureModeId: r.failure_mode_id,
      scope: r.scope,
      decision: r.decision,
    }));
  }

  const verdict = verdictRes.rows[0];
  return {
    unit,
    input: {
      signals: {
        readings,
        codes,
        checklist,
        failureTags,
        latestVerdict: verdict ? { ...verdict, id: Number(verdict.id), at: new Date(verdict.at).toISOString() } : null,
        repairs: repairsRes.rows.map((r) => ({ id: r.id, summary: r.summary ?? '', completedAt: new Date(r.completed_at).toISOString() })),
      },
      failureModes: modesRes.rows,
      resolutions,
      decisions,
    },
  };
}
