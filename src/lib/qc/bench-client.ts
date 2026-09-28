/**
 * Client side of the QC bench (`/api/qc/*`): fetchers that unwrap the `{ data } | { error }` envelope
 * and parse the payload with the contract's own schemas, plus the pure derivations both bench faces
 * (the `/test` Units display and the phone runner `/m/u/[id]/qc`) read. No React here — the hooks are
 * `use-qc-bench.ts`.
 */

import { z } from 'zod';
import {
  diagnosticCodesSchema,
  diagnosticReadingsListSchema,
  diagnosticReadingsWriteSchema,
  qcProceduresSchema,
  qcSessionWriteSchema,
  qcSessionsSchema,
  type DiagnosticReading,
  type DiagnosticSeverity,
  type QcProcedures,
  type QcSession,
  type QcSessionKind,
  type QcSessionOutcome,
} from '@/lib/qc/contracts';
import {
  triageDecisionWriteSchema,
  triageNextSchema,
  type TriageNext,
  type TriageSuggestion,
} from '@/lib/qc/triage/contracts';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** A `/api/qc/*` request the server refused; `status` lets 403 read as "no permission". */
export class QcBenchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function qcRequest<S extends z.ZodTypeAny>(
  url: string,
  schema: S,
  init?: { method: 'POST'; body: unknown; signal?: AbortSignal } | { signal?: AbortSignal },
): Promise<z.infer<S>> {
  const post = init && 'method' in init;
  const res = await fetch(url, {
    cache: 'no-store',
    signal: init?.signal,
    ...(post
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
      : {}),
  });
  const json = (await res.json().catch(() => null)) as { data?: unknown; error?: unknown } | null;
  if (!res.ok || json == null || json.data === undefined) {
    const message = typeof json?.error === 'string' && json.error ? json.error : `HTTP ${res.status}`;
    throw new QcBenchError(message, res.status);
  }
  return schema.parse(json.data);
}

export function qcBenchErrorText(err: unknown): string {
  if (err instanceof QcBenchError && err.status === 403) return 'No QC permission';
  return err instanceof Error ? err.message : 'Request failed';
}

// ── Fetchers ────────────────────────────────────────────────────────────────

export function fetchQcSessions(unitId: number, signal?: AbortSignal) {
  return qcRequest(`/api/qc/sessions?unitId=${unitId}`, qcSessionsSchema, { signal });
}

export function startQcSession(unitId: number, kind: 'TEST' | 'REPAIR') {
  return qcRequest('/api/qc/sessions', qcSessionWriteSchema, {
    method: 'POST',
    body: { kind, serialUnitId: unitId },
  });
}

export function endQcSession(sessionId: number, outcome: QcSessionOutcome | null) {
  return qcRequest(`/api/qc/sessions/${sessionId}/end`, qcSessionWriteSchema, {
    method: 'POST',
    body: { outcome },
  });
}

export async function fetchQcReadings(unitId: number, signal?: AbortSignal): Promise<DiagnosticReading[]> {
  const data = await qcRequest(`/api/qc/readings?unitId=${unitId}`, diagnosticReadingsListSchema, { signal });
  return data.readings;
}

export interface ManualReadingDraft {
  kind: string;
  code: string;
  value: string;
}

/** One MANUAL reading, stamped with a fresh idempotency key per press. */
export function recordManualReading(unitId: number, sessionId: number | null, draft: ManualReadingDraft) {
  const text = draft.value.trim();
  const num = text === '' ? NaN : Number(text);
  return qcRequest('/api/qc/readings', diagnosticReadingsWriteSchema, {
    method: 'POST',
    body: {
      readings: [
        {
          clientEventId: `manual-${safeRandomUUID()}`,
          serialUnitId: unitId,
          qcSessionId: sessionId,
          source: 'MANUAL',
          kind: draft.kind.trim(),
          code: draft.code.trim() || null,
          value: text === '' ? {} : Number.isFinite(num) ? { value: text, num } : { value: text },
        },
      ],
    },
  });
}

export async function fetchQcCodes(signal?: AbortSignal) {
  const data = await qcRequest('/api/qc/codes', diagnosticCodesSchema, { signal });
  return data.codes;
}

export function fetchQcProcedures(skuCatalogId: number, signal?: AbortSignal): Promise<QcProcedures> {
  return qcRequest(`/api/qc/procedures?skuCatalogId=${skuCatalogId}`, qcProceduresSchema, { signal });
}

export function fetchTriageNext(unitId: number, sessionId: number | null): Promise<TriageNext> {
  return qcRequest('/api/qc/triage/next', triageNextSchema, {
    method: 'POST',
    body: { serialUnitId: unitId, qcSessionId: sessionId },
  });
}

export function postTriageDecision(suggestionId: number, decision: 'ACCEPTED' | 'REJECTED') {
  return qcRequest('/api/qc/triage/decisions', triageDecisionWriteSchema, {
    method: 'POST',
    body: { suggestionId, decision },
  });
}

// ── Derivations ─────────────────────────────────────────────────────────────

/** Serial-unit statuses that mean the unit is on the bench from repair (serial-status-display.ts). */
const FROM_REPAIR_STATUS: Record<string, true> = { IN_REPAIR: true, REPAIR_DONE: true };

/** The session kind a Start opens by default: REPAIR when the unit came from repair, else TEST. */
export function defaultQcSessionKind(unitStatus: string | null | undefined): 'TEST' | 'REPAIR' {
  return unitStatus && FROM_REPAIR_STATUS[unitStatus.toUpperCase()] ? 'REPAIR' : 'TEST';
}

export const QC_SESSION_KIND_LABEL: Record<QcSessionKind, string> = {
  TEST: 'Test',
  REPAIR: 'Repair',
  REPAIR_SERVICE: 'Repair service',
};

export const QC_OUTCOME_LABEL: Record<QcSessionOutcome, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  RETEST: 'Retest',
  REPAIRED: 'Repaired',
  NOT_REPAIRED: 'Not repaired',
  ABANDONED: 'Abandoned',
};

/**
 * The hub a session belongs to: the one that started it, else the hub whose readings landed in it
 * (the agent attaches to the tech's open session). Null for a hand-run session.
 */
export function qcSessionHubId(session: QcSession, readings: readonly DiagnosticReading[]): string | null {
  if (session.hubDeviceId) return session.hubDeviceId;
  const attached = readings.find((r) => r.qcSessionId === session.id && r.source === 'HUB' && r.hubDeviceId);
  return attached?.hubDeviceId ?? null;
}

/** Elapsed ms of a session — `ended − started`, or `now − started` while open; never negative. */
export function qcSessionElapsedMs(session: Pick<QcSession, 'startedAt' | 'endedAt'>, serverNowMs: number): number {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : serverNowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/** The payload shape the hub agent (`{ label, value, unit?, passed?, … }`) and manual entry (`{ value, num? }`) write. */
const readingValueFaceSchema = z.object({
  label: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  unit: z.string().optional(),
  passed: z.boolean().optional(),
});

/**
 * What a reading row paints from its raw payload: the hub's label, the value (with unit) as one
 * line — anything off-shape prints as compact JSON, `{}` as nothing — and the hub's own pass/fail
 * when it stated one.
 */
export function qcReadingFace(value: unknown): { label: string | null; text: string; passed: boolean | null } {
  const parsed = readingValueFaceSchema.safeParse(value);
  const label = parsed.success ? parsed.data.label || null : null;
  const passed = parsed.success ? (parsed.data.passed ?? null) : null;
  if (parsed.success && parsed.data.value !== undefined) {
    const { value: v, unit } = parsed.data;
    return { label, passed, text: `${String(v ?? '')}${unit ? ` ${unit}` : ''}` };
  }
  const json = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const text = json === '{}' ? '' : json.length > 120 ? `${json.slice(0, 117)}…` : json;
  return { label, passed, text };
}

export const QC_SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

export const TRIAGE_KIND_LABEL: Record<TriageSuggestion['kind'], string> = {
  CHECK: 'Check',
  FIX: 'Fix',
  RETEST: 'Retest',
};

export function triageConfidenceText(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

/** Ids the checklist GET stamps per recorded step (`tech_verifications.procedure_version_id`, BIGINT → string). */
export function recordedProcedureVersionIds(
  steps: ReadonlyArray<{ procedure_version_id?: string | number | null }>,
): number[] {
  const ids = new Set<number>();
  for (const s of steps) {
    const id = s.procedure_version_id == null ? NaN : Number(s.procedure_version_id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

/**
 * The procedure-version line beside a unit's checklist. Recorded answers name the version(s) they
 * were answered against; with none recorded yet, the SKU's current version is what the next answer
 * runs on. Null when the SKU has no published procedure and nothing is recorded.
 */
export function procedureVersionLabel(recordedIds: readonly number[], procedures: QcProcedures | null): string | null {
  const byId = new Map((procedures?.versions ?? []).map((v) => [v.id, v.version]));
  if (recordedIds.length > 0) {
    const names = recordedIds
      .map((id) => (byId.has(id) ? { n: byId.get(id)!, text: `v${byId.get(id)}` } : { n: Infinity, text: `#${id}` }))
      .sort((a, b) => a.n - b.n)
      .map((x) => x.text);
    return `Procedure ${names.join(' · ')}`;
  }
  const current = procedures?.current;
  if (!current) return null;
  return `Procedure v${current.version}${procedures?.dirty ? ' · edits pending' : ''}`;
}
