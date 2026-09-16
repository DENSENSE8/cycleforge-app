/**
 * The kiosk cart's step units — ONE gate model for the stepper and the keys.
 *
 * The cart used to be one long screen (intake → line list → totals → Save/Pay)
 * under a titled band. Operator 2026-09-14, of that build: *"it should follow
 * that exact same principle [as the repair service intake form], displaying
 * without the header and then the X button top left to close the cart and
 * displaying a stepper on the top for the exact steps within the cart for the
 * user to take."*
 *
 * A stepper needs units, and the honest units were already in the tree:
 * {@link collectKioskTriage} attributes every open problem to a `target`
 * (`line` · `customer` · `cart`) with a `severity`, and the Pay/Save buttons
 * already gate on `firstKioskBlocker`. That taxonomy maps one-to-one onto the
 * steps, so this module DERIVES the gates from it rather than growing a second
 * opinion about what a complete visit is — the same discipline as
 * `repairStepGates`, which serves the repair flow's header and its Continue key
 * from one table.
 *
 * ## Only `block` counts
 *
 * `severity: 'warn'` items (no name, no email, no address, a $0 trade-in, a
 * repair with no symptom recorded) are advisories. A stepper that refuses to
 * advance on a warning is a stepper an operator learns to fight — and on a
 * counter tablet "fight the stepper" means "walk the customer back to the
 * desk". Warnings surface in the triage panel and under the total; they never
 * hold a segment hostage.
 *
 * ## The count is a COUNT (PG6)
 *
 * `cartStepGates` takes no step index, deliberately. A satisfied unit fills its
 * segment wherever the pointer is, and clearing an earlier unit takes the
 * segment back — so paging to the last step can never render 3/3.
 *
 * Pure over the session snapshot: no store, no network, no React.
 * Callers: `KioskCartLedger` (header count + per-step keys).
 * Affected API: none. Schemas: the session snapshot only.
 */

import {
  collectKioskTriage,
  type KioskTriageItem,
  type KioskTriageSession,
  type KioskTriageTarget,
} from '@/lib/kiosk/visit-triage';

/**
 * The step headers, in order — each the step's own question in plain words, the
 * way the repair flow asks its three. No eyebrow, no duplicate label inside the
 * body: ONE bold display header per step, top-left.
 *
 * The last one is "Review", not "Review & pay": a drop-off takes no money at
 * all (operator 2026-09-15 — it "just prints out a receipt"), so the verb
 * belongs on the key, which `cartMoneySplit` chooses, not on a fixed header
 * that would promise a payment half these visits never make.
 */
export const KIOSK_CART_STEPS = ['Items on the ticket', 'Contact information', 'Review'] as const;

export type KioskCartStep = 0 | 1 | 2;

/**
 * Which triage targets each step is answerable for.
 *
 * `cart` (the empty-ticket blocker) belongs to Items: "nothing on the ticket"
 * is a fact about the item list, and putting it on Pay would leave the first
 * segment filled on an empty visit. Pay carries it too — a step that submits
 * cannot be satisfied while any blocker stands anywhere.
 */
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

/**
 * Why THIS step cannot advance — the Continue key's title and the sentence
 * under the total. Null when the step is satisfied.
 *
 * Worst-first inside the step, because `collectKioskTriage` already partitions
 * blockers ahead of warnings and keeps cart order after that.
 */
export function cartStepBlockReason(
  session: KioskTriageSession,
  step: KioskCartStep,
): string | null {
  const hit = blockers(session).find((item) => STEP_TARGETS[step].includes(item.target));
  return hit?.message ?? null;
}
