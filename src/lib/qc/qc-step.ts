/**
 * One QC checklist step's value rules — pass band, value kind, reading → POST
 * fields, verdict — shared by the desk runner, the phone runner and the
 * checklist route so they cannot disagree about what a step accepts or how
 * it is judged. Pure; no React, no DB.
 */

/** The template columns (`qc_check_templates`) that shape how a step is answered. */
export interface QcStepConfig {
  value_kind?: string | null;
  value_unit?: string | null;
  pass_min?: string | number | null;
  pass_max?: string | number | null;
}

/** Numeric value kinds capture a number (and may have a pass band). */
export function isNumericKind(kind?: string | null): boolean {
  return kind === 'PERCENT' || kind === 'NUMBER';
}

/** Steps whose answer is a structured value rather than a pass/fail tap. */
export function needsValueInput(kind?: string | null): boolean {
  return isNumericKind(kind) || kind === 'ENUM' || kind === 'TEXT';
}

/** Pg returns NUMERIC as a string; a malformed bound counts as no bound. */
function bound(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Inclusive pass band; either side may be open. */
export function passBand(step: QcStepConfig): { min: number | null; max: number | null } {
  return { min: bound(step.pass_min), max: bound(step.pass_max) };
}

/** The unit a reading is written in — PERCENT implies '%' when the template names none. */
export function stepValueUnit(step: QcStepConfig): string | null {
  return step.value_unit || (step.value_kind === 'PERCENT' ? '%' : null);
}

/** `12–15 V`, `≥ 80 %`, `≤ 3`, or null when the step has no band. */
export function passBandLabel(step: QcStepConfig): string | null {
  const { min, max } = passBand(step);
  const unit = stepValueUnit(step);
  const suffix = unit ? ` ${unit}` : '';
  if (min != null && max != null) return `${min}–${max}${suffix}`;
  if (min != null) return `≥ ${min}${suffix}`;
  if (max != null) return `≤ ${max}${suffix}`;
  return null;
}

/** A numeric step with a band is judged by the server from the reading alone. */
export function bandDecides(step: QcStepConfig): boolean {
  const { min, max } = passBand(step);
  return isNumericKind(step.value_kind) && (min != null || max != null);
}

export type StepValueFields = { valueNum: number } | { valueText: string | null };

/**
 * A typed reading → the checklist POST fields. Numeric kinds send `valueNum`
 * (blank is nothing to record; a non-number is refused); ENUM/TEXT send the
 * trimmed `valueText`, blank clearing it.
 */
export function stepValueFields(
  step: QcStepConfig,
  raw: string,
): { ok: true; fields: StepValueFields } | { ok: false; reason: 'empty' | 'invalid' } {
  if (!isNumericKind(step.value_kind)) return { ok: true, fields: { valueText: raw.trim() || null } };
  if (raw.trim() === '') return { ok: false, reason: 'empty' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, reason: 'invalid' };
  return { ok: true, fields: { valueNum: n } };
}

/**
 * Derive a step's pass/fail. When the step has a numeric pass band
 * (pass_min/pass_max), the recorded number decides it (inclusive bounds);
 * otherwise fall back to the explicit boolean the tester sent. Returns null
 * when nothing can be determined (no band + no explicit value).
 */
export function deriveStepPassed(
  step: QcStepConfig,
  recorded: { passed?: boolean; valueNum?: number | null },
): boolean | null {
  const { min, max } = passBand(step);
  if ((min != null || max != null) && recorded.valueNum != null) {
    if (min != null && recorded.valueNum < min) return false;
    if (max != null && recorded.valueNum > max) return false;
    return true;
  }
  if (recorded.passed !== undefined) return recorded.passed;
  return null;
}
