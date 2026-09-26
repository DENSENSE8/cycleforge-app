/** TriageFocusResolver — pure "where should attention go after a triage scan resolves" function (docs/receiving-triage-redesign-plan.md §3.7). */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isReturnIntake } from './triage-intake-kind';

type TriageFocusTarget =
  | 'classify'
  | 'stage'
  | 'pair'
  | 'already-staged'
  | 'none';

export interface TriageFocusFacts {
  /** True once `receiving_lines.intake_type` (or the matched PO) resolves the kind. */
  isClassified: boolean;
  isReturn: boolean;
  /** `receiving.staging_location_id` set. */
  isStaged: boolean;
  /** `receiving.pairing_state !== 'UNFOUND'`, or the carton has a real PO link / claim. */
  isPaired: boolean;
  /** `receiving.triage_complete`. */
  isTriageComplete: boolean;
}

/** Resolve the next focus target for a just-resolved triage scan. */
export function resolveTriageFocus(facts: TriageFocusFacts): TriageFocusTarget {
  if (facts.isTriageComplete) return 'already-staged';
  if (!facts.isClassified) return 'classify';
  if (!facts.isStaged) return 'stage';
  if (!facts.isPaired) return 'pair';
  return 'none';
}

// NOTE: the old `triageFocusToTab` / `TriageFocusTab` mapped a focus target to a centre `SectionTabsSlider` tab.

// ── ReceivingLineRow → TriageFocusFacts ───────────────────────────────────── Per-step predicates for {@link deriveTriageFocusFacts} —…

/** Carton has an explicit classification (via `receiving_lines.intake_type`) or is already Zoho-matched. */
function isTriageClassified(row: ReceivingLineRow): boolean {
  if (row.receiving_source !== 'unmatched') return true;
  return !!(row.intake_type && row.intake_type.trim());
}

/** A1 — both a physical shelf AND a priority lane are required to count as staged. */
function isTriageStaged(row: ReceivingLineRow): boolean {
  return row.staging_location_id != null && !!row.priority_lane;
}

/** The `receiving_triage.pairing_state` values that ANSWER the pairing question. */
export const PAIRING_ANSWERED_STATES = ['MATCHED', 'WAIVED'] as const;

export function isPairingAnswered(pairingState: string | null | undefined): boolean {
  return (PAIRING_ANSWERED_STATES as readonly string[]).includes(pairingState ?? '');
}

/** PO matched, pairing acknowledged/waived, a claim is linked, or a return with no label hint (C6). */
function isTriagePaired(row: ReceivingLineRow): boolean {
  if (row.receiving_source !== 'unmatched') return true;
  if (isPairingAnswered(row.pairing_state)) return true;
  if (row.zendesk_ticket) return true;
  return isReturnIntake(row);
}

/** Compose a `ReceivingLineRow` into the facts `resolveTriageFocus` reads. */
export function deriveTriageFocusFacts(
  row: ReceivingLineRow,
  isTriageComplete: boolean,
): TriageFocusFacts {
  return {
    isClassified: isTriageClassified(row),
    isReturn: isReturnIntake(row),
    isStaged: isTriageStaged(row),
    isPaired: isTriagePaired(row),
    isTriageComplete,
  };
}
