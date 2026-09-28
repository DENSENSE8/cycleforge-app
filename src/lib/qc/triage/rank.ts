/**
 * Deterministic QC triage ranker — pure, no I/O.
 *
 * Candidates come from three places:
 *  - the unit's own failing signals (checklist steps, readings, device codes,
 *    open failure tags) → CHECK steps;
 *  - repairs that resolved the same failure mode on the same SKU (weight 1) or
 *    the same family (weight ½) → FIX steps, one per part / repair summary;
 *  - a completed repair or a TEST_AGAIN verdict after the last failure → RETEST.
 *
 * Every candidate's confidence is a smoothed hit rate:
 *   (base·PRIOR + hits) / (PRIOR + hits + misses)
 * where hits = weighted repairs that used this fix + weighted accepted triage
 * decisions for this step key, and misses = weighted repairs of the same mode
 * that used something else (or failed with this fix) + weighted rejections.
 * Human accept/reject therefore moves the ranking on the next call.
 */

export type TriageStepKind = 'CHECK' | 'FIX' | 'RETEST';
export type TriageScope = 'sku' | 'family';
export type TriageDecision = 'ACCEPTED' | 'REJECTED';

export interface TriageEvidenceRef {
  type: 'reading' | 'code' | 'failure_tag' | 'checklist' | 'repair' | 'decision' | 'verdict';
  id: string;
  label: string;
}

export interface TriageFailureMode {
  id: number;
  code: string;
  label: string;
}

export interface TriageReadingSignal {
  id: string;
  key: string;
  label: string;
  value: string;
  /** false = outside its pass band; null = informational. */
  passed: boolean | null;
  failureModeId: number | null;
}

export interface TriageCodeSignal {
  id: string;
  code: string;
  label: string;
  failureModeId: number | null;
}

export interface TriageChecklistSignal {
  stepId: number;
  label: string;
  passed: boolean | null;
  value: string | null;
  failureModeId: number | null;
}

export interface TriageFailureTagSignal {
  id: number;
  failureModeId: number;
  status: 'open' | 'resolved' | 'scrapped' | 'wontfix';
}

export interface TriageVerdictSignal {
  id: number;
  verdict: 'PASS' | 'TEST_AGAIN' | 'TESTING_FAILED';
  at: string;
  notes: string | null;
}

export interface TriageRepairSignal {
  id: number;
  summary: string;
  completedAt: string;
}

export interface TriageSignals {
  readings: TriageReadingSignal[];
  codes: TriageCodeSignal[];
  checklist: TriageChecklistSignal[];
  failureTags: TriageFailureTagSignal[];
  latestVerdict: TriageVerdictSignal | null;
  /** This unit's completed repairs, newest first. */
  repairs: TriageRepairSignal[];
}

/** One repair of another unit (same SKU or family) that addressed a failure mode. */
export interface TriageResolution {
  repairId: number;
  failureModeId: number;
  scope: TriageScope;
  /** 'completed' counts as a hit for its fixes; 'failed' as a miss. */
  status: 'completed' | 'failed';
  /** Parts used (sku or description). Empty → the summary names the fix. */
  parts: string[];
  summary: string;
}

/** One past human decision on a suggested step (same SKU or family). */
export interface TriagePastDecision {
  stepKey: string;
  step: string;
  kind: TriageStepKind;
  failureModeId: number | null;
  scope: TriageScope;
  decision: TriageDecision;
}

export interface TriageRankInput {
  signals: TriageSignals;
  failureModes: TriageFailureMode[];
  resolutions: TriageResolution[];
  decisions: TriagePastDecision[];
}

export interface TriageRankedStep {
  key: string;
  step: string;
  kind: TriageStepKind;
  why: string;
  evidence: TriageEvidenceRef[];
  /** 0..1, 3 decimals. */
  confidence: number;
  failureModeId: number | null;
}

const SCOPE_WEIGHT: Record<TriageScope, number> = { sku: 1, family: 0.5 };
/** Pseudo-observations pulling a small sample toward its base rate. */
const PRIOR = 2;
/** Base rates before any history. */
const BASE = { signalCheck: 0.5, modeCheck: 0.35, historyFix: 0, retestAfterRepair: 0.85, retestVerdict: 0.6 };
const KIND_ORDER: Record<TriageStepKind, number> = { RETEST: 0, FIX: 1, CHECK: 2 };
const MAX_STEPS = 12;

interface Candidate extends Omit<TriageRankedStep, 'confidence'> {
  base: number;
  hits: number;
  misses: number;
}

/** Fix labels for one resolution: each part, else the repair summary. */
function resolutionFixes(r: TriageResolution): string[] {
  const parts = r.parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length > 0) return [...new Set(parts.map((p) => `Replace ${p}`))];
  const summary = r.summary.trim();
  return summary ? [summary] : [];
}

export function rankTriageSteps(input: TriageRankInput): TriageRankedStep[] {
  const { signals } = input;
  const modeById = new Map(input.failureModes.map((m) => [m.id, m]));
  const modeLabel = (id: number) => modeById.get(id)?.label ?? `failure mode #${id}`;
  const candidates = new Map<string, Candidate>();

  const add = (c: Candidate) => {
    const existing = candidates.get(c.key);
    if (existing) {
      existing.evidence.push(...c.evidence);
      return;
    }
    candidates.set(c.key, c);
  };

  // ── Suspected failure modes, with the evidence that raised each ──
  const suspected = new Map<number, TriageEvidenceRef[]>();
  const suspect = (modeId: number | null, ref: TriageEvidenceRef) => {
    if (modeId == null) return;
    const refs = suspected.get(modeId) ?? [];
    refs.push(ref);
    suspected.set(modeId, refs);
  };

  for (const tag of signals.failureTags) {
    if (tag.status !== 'open') continue;
    suspect(tag.failureModeId, { type: 'failure_tag', id: String(tag.id), label: modeLabel(tag.failureModeId) });
  }

  for (const step of signals.checklist) {
    if (step.passed !== false) continue;
    const ref: TriageEvidenceRef = {
      type: 'checklist',
      id: String(step.stepId),
      label: step.value ? `${step.label}: ${step.value}` : step.label,
    };
    suspect(step.failureModeId, ref);
    add({
      key: `CHECK:step:${step.stepId}`,
      step: `Re-check "${step.label}"`,
      kind: 'CHECK',
      why: step.value
        ? `Checklist step failed with ${step.value}.`
        : 'Checklist step recorded as failed.',
      evidence: [ref],
      failureModeId: step.failureModeId,
      base: BASE.signalCheck,
      hits: 0,
      misses: 0,
    });
  }

  for (const reading of signals.readings) {
    if (reading.passed !== false) continue;
    const ref: TriageEvidenceRef = { type: 'reading', id: reading.id, label: `${reading.label}: ${reading.value}` };
    suspect(reading.failureModeId, ref);
    add({
      key: `CHECK:reading:${reading.key}`,
      step: `Verify ${reading.label}`,
      kind: 'CHECK',
      why: `Device reading ${reading.label} = ${reading.value} is outside its pass band.`,
      evidence: [ref],
      failureModeId: reading.failureModeId,
      base: BASE.signalCheck,
      hits: 0,
      misses: 0,
    });
  }

  for (const code of signals.codes) {
    const ref: TriageEvidenceRef = { type: 'code', id: code.id, label: code.label ? `${code.code} ${code.label}` : code.code };
    suspect(code.failureModeId, ref);
    add({
      key: `CHECK:code:${code.code}`,
      step: `Diagnose code ${code.code}`,
      kind: 'CHECK',
      why: code.label ? `Device reported ${code.code} (${code.label}).` : `Device reported ${code.code}.`,
      evidence: [ref],
      failureModeId: code.failureModeId,
      base: BASE.signalCheck,
      hits: 0,
      misses: 0,
    });
  }

  // ── FIX candidates from resolution history, per suspected mode ──
  for (const [modeId, refs] of suspected) {
    const history = input.resolutions.filter((r) => r.failureModeId === modeId);
    // Total weighted resolution attempts of this mode — the denominator.
    let modeTotal = 0;
    const fixHits = new Map<string, { label: string; hits: number; misses: number; refs: TriageEvidenceRef[] }>();
    for (const r of history) {
      const w = SCOPE_WEIGHT[r.scope];
      if (r.status === 'completed') modeTotal += w;
      for (const fix of resolutionFixes(r)) {
        const key = `FIX:m${modeId}:${fix.trim().toLowerCase().replace(/\s+/g, ' ')}`;
        const entry = fixHits.get(key) ?? { label: fix, hits: 0, misses: 0, refs: [] };
        if (r.status === 'completed') entry.hits += w;
        else entry.misses += w;
        entry.refs.push({ type: 'repair', id: String(r.repairId), label: `${r.scope === 'sku' ? 'same SKU' : 'same family'} repair #${r.repairId}` });
        fixHits.set(key, entry);
      }
    }
    for (const [key, f] of fixHits) {
      add({
        key,
        step: f.label,
        kind: 'FIX',
        why: `Resolved ${modeLabel(modeId)} in ${+f.hits.toFixed(1)} of ${+modeTotal.toFixed(1)} weighted past repairs.`,
        evidence: [...refs, ...f.refs],
        failureModeId: modeId,
        base: BASE.historyFix,
        hits: f.hits,
        // Every other completed resolution of this mode is a vote for a different fix.
        misses: Math.max(0, modeTotal - f.hits) + f.misses,
      });
    }
    add({
      key: `CHECK:m${modeId}`,
      step: `Inspect for ${modeLabel(modeId)}`,
      kind: 'CHECK',
      why: fixHits.size > 0
        ? `Confirm ${modeLabel(modeId)} before choosing a fix.`
        : `${modeLabel(modeId)} is suspected and no past repair of this SKU or family resolved it.`,
      evidence: [...refs],
      failureModeId: modeId,
      base: BASE.modeCheck,
      hits: 0,
      misses: 0,
    });
  }

  // ── RETEST ──
  const verdict = signals.latestVerdict;
  const verdictMs = verdict ? Date.parse(verdict.at) : -Infinity;
  const repairAfter = signals.repairs.find((r) => Date.parse(r.completedAt) > verdictMs);
  if (repairAfter) {
    add({
      key: 'RETEST:after_repair',
      step: 'Retest the unit end to end',
      kind: 'RETEST',
      why: verdict
        ? `Repair #${repairAfter.id} completed after the last ${verdict.verdict} verdict.`
        : `Repair #${repairAfter.id} completed and no verdict has been recorded since.`,
      evidence: [
        { type: 'repair', id: String(repairAfter.id), label: repairAfter.summary || `repair #${repairAfter.id}` },
        ...(verdict ? [{ type: 'verdict' as const, id: String(verdict.id), label: verdict.verdict }] : []),
      ],
      failureModeId: null,
      base: BASE.retestAfterRepair,
      hits: 0,
      misses: 0,
    });
  } else if (verdict?.verdict === 'TEST_AGAIN') {
    add({
      key: 'RETEST:verdict',
      step: 'Re-run the failed checks',
      kind: 'RETEST',
      why: 'Last verdict was TEST_AGAIN.',
      evidence: [{ type: 'verdict', id: String(verdict.id), label: verdict.verdict }],
      failureModeId: null,
      base: BASE.retestVerdict,
      hits: 0,
      misses: 0,
    });
  }

  // A failing verdict with nothing tagged: the first step is naming the fault,
  // which is what lets resolution history rank fixes on the next call.
  if (verdict?.verdict === 'TESTING_FAILED' && !repairAfter && suspected.size === 0) {
    add({
      key: 'CHECK:verdict_failed',
      step: 'Find and tag the failure behind the last failed test',
      kind: 'CHECK',
      why: verdict.notes
        ? `Last verdict TESTING_FAILED ("${verdict.notes}") with no failure mode tagged.`
        : 'Last verdict TESTING_FAILED with no failure mode tagged.',
      evidence: [{ type: 'verdict', id: String(verdict.id), label: verdict.notes ? `${verdict.verdict}: ${verdict.notes}` : verdict.verdict }],
      failureModeId: null,
      base: BASE.signalCheck,
      hits: 0,
      misses: 0,
    });
  }

  // ── Past decisions: feedback on existing candidates; accepted steps for a
  //    suspected mode come back even without a repair row behind them. ──
  for (const d of input.decisions) {
    const w = SCOPE_WEIGHT[d.scope];
    let c = candidates.get(d.stepKey);
    if (!c && d.decision === 'ACCEPTED' && d.failureModeId != null && suspected.has(d.failureModeId)) {
      c = {
        key: d.stepKey,
        step: d.step,
        kind: d.kind,
        why: `Accepted before for ${modeLabel(d.failureModeId)} on this ${d.scope === 'sku' ? 'SKU' : 'family'}.`,
        evidence: [...(suspected.get(d.failureModeId) ?? [])],
        failureModeId: d.failureModeId,
        base: d.kind === 'FIX' ? BASE.historyFix : BASE.modeCheck,
        hits: 0,
        misses: 0,
      };
      candidates.set(c.key, c);
    }
    if (!c) continue;
    if (d.decision === 'ACCEPTED') c.hits += w;
    else c.misses += w;
  }

  const ranked = [...candidates.values()].map((c) => {
    const confidence = (c.base * PRIOR + c.hits) / (PRIOR + c.hits + c.misses);
    const decided = input.decisions.filter((d) => d.stepKey === c.key);
    const accepted = decided.filter((d) => d.decision === 'ACCEPTED').length;
    const rejected = decided.length - accepted;
    return {
      key: c.key,
      step: c.step,
      kind: c.kind,
      why: decided.length > 0 ? `${c.why} Techs accepted ${accepted}, rejected ${rejected} before.` : c.why,
      evidence: c.evidence,
      confidence: Math.round(confidence * 1000) / 1000,
      failureModeId: c.failureModeId,
    } satisfies TriageRankedStep;
  });

  ranked.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  return ranked.slice(0, MAX_STEPS);
}
