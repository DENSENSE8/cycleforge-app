/**
 * The kiosk cart's step units — ONE gate model for the stepper and the keys.
 * under a titled band. Operator 2026-09-14, of that build: *"it should follow
 */

import {
  collectKioskTriage,
  type KioskTriageItem,
  type KioskTriageSession,
  type KioskTriageTarget,
} from '@/lib/kiosk/visit-triage';

/**
 * The step headers, in order — each the step's own question in plain words, the way the repair flow asks its three.
 * The first is "Cart", not "Items on the ticket" (operator 2026-09-23). The
 * all (operator 2026-09-15 — it "just prints out a receipt"), so the verb
 */
export const KIOSK_CART_STEPS = ['Cart', 'Contact information', 'Review'] as const;

export type KioskCartStep = 0 | 1 | 2;

/** Which triage targets each step is answerable for. */
const STEP_TARGETS: Record<KioskCartStep, readonly KioskTriageTarget[]> = {
  0: ['line', 'cart'],
  1: ['customer'],
  2: ['line', 'cart', 'customer'],
};

function blockers(session: KioskTriageSession): KioskTriageItem[] {
  return collectKioskTriage(session).filter((i) => i.severity === 'block');
}

/**
 * One boolean per step, satisfied-or-not. Same shape and contract as
 * `repairStepGates`: index 0..2, never a pointer.
 */
export function cartStepGates(session: KioskTriageSession): readonly [boolean, boolean, boolean] {
  const open = blockers(session);
  const clear = (step: KioskCartStep) =>
    !open.some((item) => STEP_TARGETS[step].includes(item.target));
  return [clear(0), clear(1), clear(2)] as const;
}

/** Satisfied units — the header's `current`, never the step in view (PG6). */
export function cartCompletedSteps(session: KioskTriageSession): number {
  return cartStepGates(session).filter(Boolean).length;
}

/** Why THIS step cannot advance — the Continue key's title and the sentence under the total. */
export function cartStepBlockReason(
  session: KioskTriageSession,
  step: KioskCartStep,
): string | null {
  const hit = blockers(session).find((item) => STEP_TARGETS[step].includes(item.target));
  return hit?.message ?? null;
}
