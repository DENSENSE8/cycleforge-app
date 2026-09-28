import { formatMonthDayTimePST } from '@/utils/date';

/** One unit's QC checklist as `GET /api/serial-units/[id]/checklist` returns it: */
export interface UnitQcStep {
  step_id: number;
  step_label: string;
  step_type: string;
  sort_order: number;
  value_kind: string | null;
  value_unit: string | null;
  value_enum: string[] | null;
  pass_min: string | number | null;
  pass_max: string | number | null;
  passed: boolean | null;
  value_num: string | number | null;
  value_text: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  verified_at: string | null;
  notes: string | null;
  /** `qc_procedure_versions.id` the answer was recorded against (BIGINT → string); null before versioning. */
  procedure_version_id: string | number | null;
}

interface UnitQcSummary {
  passed: number;
  failed: number;
  /** No verdict yet — never recorded, or recorded as a reading without one. */
  open: number;
  total: number;
  /** The most recent recording on any step, by server time. */
  last: { name: string | null; at: string } | null;
}

export function summarizeUnitQc(steps: readonly UnitQcStep[]): UnitQcSummary {
  let passed = 0;
  let failed = 0;
  let last: UnitQcSummary['last'] = null;
  let lastMs = -Infinity;
  for (const step of steps) {
    if (step.passed === true) passed += 1;
    else if (step.passed === false) failed += 1;
    if (step.verified_at) {
      const ms = Date.parse(step.verified_at);
      if (ms > lastMs) {
        lastMs = ms;
        last = { name: step.verified_by_name, at: step.verified_at };
      }
    }
  }
  return { passed, failed, open: steps.length - passed - failed, total: steps.length, last };
}

/** `2 passed · 1 failed · 1 open` */
export function unitQcTally(summary: UnitQcSummary): string {
  return `${summary.passed} passed · ${summary.failed} failed · ${summary.open} open`;
}

/** `Michael, Sep 24, 4:41 PM` — who recorded last and when, on the server clock. */
export function unitQcStamp(last: NonNullable<UnitQcSummary['last']>): string {
  const at = formatMonthDayTimePST(last.at);
  return last.name ? `${last.name}, ${at}` : at;
}

/**
 * The unit's QC verdict so far: one failed step fails the unit, and it passes
 * only once every step has passed; anything short of that is still open.
 */
export function unitQcVerdict(summary: UnitQcSummary): 'failed' | 'passed' | 'open' {
  if (summary.failed > 0) return 'failed';
  return summary.open === 0 && summary.passed > 0 ? 'passed' : 'open';
}

/**
 * Why a unit has nothing to check, or null when it has a checklist. The route
 * returns an empty list for all three cases, so the unit's own SKU fields
 * tell them apart.
 */
export function unitQcEmptyReason(
  unit: { sku: string | null; sku_catalog_id: number | null },
  steps: readonly UnitQcStep[],
): string | null {
  if (unit.sku_catalog_id == null) {
    return unit.sku ? `SKU ${unit.sku} is not in the catalog` : 'Unit has no SKU — nothing to check';
  }
  if (steps.length === 0) return `No checklist published for ${unit.sku ?? 'this SKU'}`;
  return null;
}

/** The unit hub's QC door line: tally and last stamp, or why there is nothing to run. */
export function unitQcMeta(
  unit: { sku: string | null; sku_catalog_id: number | null },
  steps: readonly UnitQcStep[],
): string {
  const empty = unitQcEmptyReason(unit, steps);
  if (empty) return empty;
  const summary = summarizeUnitQc(steps);
  const tally = unitQcTally(summary);
  return summary.last ? `${tally} · ${unitQcStamp(summary.last)}` : tally;
}
