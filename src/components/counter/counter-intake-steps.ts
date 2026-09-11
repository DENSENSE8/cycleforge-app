/**
 * Counter-intake step machine — the pure half of `CounterIntakeForm`.
 *
 * Kept DB-free and React-free so the step gating (what can advance, what a step
 * requires, whether a signature is owed) is unit-testable without mounting a
 * form. The component owns rendering; this owns the rules.
 */

import type {
  CounterRetailLine,
  CounterServiceLine,
} from '@/lib/counter/counter-transaction-types';

export const COUNTER_STEPS = ['identity', 'cart', 'review', 'payment'] as const;

export type CounterStep = (typeof COUNTER_STEPS)[number];

interface CounterStepMeta {
  id: CounterStep;
  /** Operator-facing label. Capability nouns only — never a vendor name. */
  label: string;
}

export const COUNTER_STEP_META: ReadonlyArray<CounterStepMeta> = [
  { id: 'identity', label: 'Customer' },
  { id: 'cart', label: 'Items' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Payment' },
];

export interface CounterDraft {
  phone: string;
  name: string;
  email: string;
  /** Street / mailing address for the visit (optional on retail-only). */
  address: string;
  /** Optional prior-order reveal. Requires the phone too — two keys or nothing. */
  priorOrderNumber: string;
  retailLines: CounterRetailLine[];
  service: CounterServiceLine | null;
  /** Set once the customer has signed. Only ever required for a service line. */
  signatureDataUrl: string | null;
  signatureStrokes: unknown;
}

export function emptyCounterDraft(): CounterDraft {
  return {
    phone: '',
    name: '',
    email: '',
    address: '',
    priorOrderNumber: '',
    retailLines: [],
    service: null,
    signatureDataUrl: null,
    signatureStrokes: null,
  };
}

/** Trailing N digits of a phone, formatting-insensitive. */
export function phoneDigits(value: string, n = 10): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

/**
 * A service line only counts once it names a real product.
 *
 * A picker mid-drill reports a PARTIAL selection with a blank model. Honoring
 * that as a service made the Continue gate pass on an empty visit and demanded a
 * signature for a product nobody had chosen yet, so the gate refuses a blank
 * service independently of whatever the component hands it.
 */
export function activeServiceLine(draft: CounterDraft): CounterServiceLine | null {
  return draft.service?.productModel?.trim() ? draft.service : null;
}

export function hasServiceLine(draft: CounterDraft): boolean {
  return activeServiceLine(draft) !== null;
}

/**
 * A visit with a service line needs a signed intake agreement. A retail-only
 * sale must NOT demand one — asking a customer to sign a repair agreement for a
 * pack of earbud tips is both wrong and a reason to abandon the counter.
 */
export function needsSignature(draft: CounterDraft): boolean {
  return hasServiceLine(draft);
}

export function hasAnyLine(draft: CounterDraft): boolean {
  return draft.retailLines.some((l) => l.quantity > 0) || hasServiceLine(draft);
}

/**
 * Why a step cannot be left, or null when it can.
 *
 * Returns a REASON rather than a boolean so the UI can say what is missing
 * instead of just disabling a button — a dead Next with no explanation is the
 * single most common way a counter form stalls.
 */
export function blockingReason(step: CounterStep, draft: CounterDraft): string | null {
  switch (step) {
    case 'identity': {
      if (!draft.phone.trim()) return 'Enter a phone number to continue.';
      if (phoneDigits(draft.phone).length < 7) return 'That phone number looks incomplete.';
      // An order number alone is a guessable key; the phone is the second key,
      // and it is already required above, so nothing extra is needed here.
      return null;
    }
    case 'cart':
      return hasAnyLine(draft) ? null : 'Add a service or an item to continue.';
    case 'review':
      if (needsSignature(draft) && !draft.signatureDataUrl) {
        return 'A signature is required for a service drop-off.';
      }
      return null;
    case 'payment':
      return null;
  }
}

export function canAdvance(step: CounterStep, draft: CounterDraft): boolean {
  return blockingReason(step, draft) === null;
}

export function stepIndex(step: CounterStep): number {
  return COUNTER_STEPS.indexOf(step);
}

export function nextStep(step: CounterStep): CounterStep {
  const i = stepIndex(step);
  return COUNTER_STEPS[Math.min(i + 1, COUNTER_STEPS.length - 1)];
}

export function prevStep(step: CounterStep): CounterStep {
  const i = stepIndex(step);
  return COUNTER_STEPS[Math.max(i - 1, 0)];
}

// NOTE: there is deliberately no `nameIsRequired()` gate. The orchestrator
// resolves identity on phone DIGITS and falls back to the name already on file,
// so a returning customer must never be made to re-type it — and the form cannot
// know whether a match exists. The server has the final say and returns a
// validation error naming the field if it genuinely needs one.
