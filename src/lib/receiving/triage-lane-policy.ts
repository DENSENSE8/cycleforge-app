/** Triage lane policy — the auto-routing rule table for `receiving.priority_lane` (docs/receiving-triage-redesign-plan.md §4.2, decision D3). */

import { resolveDecision, type DecisionRule } from '@/lib/workflow/decision-eval';

/** The filing category triage-lane rules are tagged under (mirrors RECEIVING_PUTAWAY_CATEGORY). */
export const TRIAGE_LANE_CATEGORY = 'triage-lane';

/**
 * Lane values — v1 small fixed list (mirrors `RECEIVING_EXCEPTION_CODES`'s
 * precedent). Revisit only if a tenant asks for a custom lane (see the plan's
 * open sub-question under D3).
 */
export const TRIAGE_LANE_OPTS = [
  { value: 'PO_STOCKOUT', label: 'Purchase order — Stock-out' },
  { value: 'PO_STANDARD', label: 'Purchase order — Standard' },
  { value: 'RETURN', label: 'Return' },
  { value: 'HOLD', label: 'Hold / exception' },
] as const;

export type TriageLane = (typeof TRIAGE_LANE_OPTS)[number]['value'];

export function isTriageLane(v: unknown): v is TriageLane {
  return typeof v === 'string' && TRIAGE_LANE_OPTS.some((o) => o.value === v);
}

/** Wire tokens `?ulane=` may carry (route-param hygiene). Uppercases first. */
export function parseTriageLaneWire(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  return isTriageLane(v) ? v : null;
}

export function triageLaneLabel(lane: string | null | undefined): string {
  return TRIAGE_LANE_OPTS.find((o) => o.value === lane)?.label ?? 'Unassigned';
}

/** The carton facts the auto-routing rules read (pre-`channel`-encoding). */
export interface TriageLaneFacts {
  isReturn: boolean;
  /** receiving.is_priority — pending-order match or manual priority_tier 0 (see precedence.ts). */
  isPriority: boolean;
}

/** Fold the carton's return/priority facts into the `channel` fact `DecisionRule.when` already supports, so the triage policy needs no… */
export function triageLaneChannel(facts: TriageLaneFacts): 'return' | 'priority_po' | 'po' {
  if (facts.isReturn) return 'return';
  return facts.isPriority ? 'priority_po' : 'po';
}

/** The system-default lane policy: */
export function receivingTriageLanePolicy(): DecisionRule[] {
  return [
    {
      id: 'triage-lane-priority-po',
      when: { channel: 'priority_po' },
      thenPort: 'lane',
      then: { placement: 'PO_STOCKOUT', category: TRIAGE_LANE_CATEGORY },
    },
    {
      id: 'triage-lane-return',
      when: { channel: 'return' },
      thenPort: 'lane',
      then: { placement: 'RETURN', category: TRIAGE_LANE_CATEGORY },
    },
    {
      id: 'triage-lane-po-standard',
      when: { channel: 'po' },
      thenPort: 'lane',
      then: { placement: 'PO_STANDARD', category: TRIAGE_LANE_CATEGORY },
    },
  ];
}

/** Resolve the effective lane for a carton: */
export function resolveTriageLane(
  manualLane: string | null | undefined,
  facts: TriageLaneFacts,
  rules: DecisionRule[] = receivingTriageLanePolicy(),
): TriageLane | null {
  const manual = (manualLane ?? '').trim().toUpperCase();
  if (isTriageLane(manual)) return manual;

  const outcome = resolveDecision(rules, null, { channel: triageLaneChannel(facts) });
  const placement = outcome.placement?.placement;
  return isTriageLane(placement) ? placement : null;
}
