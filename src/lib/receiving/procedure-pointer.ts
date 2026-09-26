/** The procedure POINTER — which step the operator is on. */

/** The minimum a step must carry for the pointer to place itself. */
interface PointerStep {
  key: string;
  /**
   * Derived completion — the step's own gate passed. Skips are NOT folded in
   * here: a waiver is a decision, not evidence, and merging the two at the input
   * would destroy the distinction downstream.
   */
  done: boolean;
}

interface ResolveActiveStepOptions {
  /**
   * Step keys the operator has waived. Settled for pointer purposes, never done.
   */
  skipped?: readonly string[];
  /** The operator clicked a settled row to go back to it. */
  focusedKey?: string | null;
}

/** The step the operator is on, or `null` when every step is settled. */
export function resolveActiveStep(
  steps: readonly PointerStep[],
  options: ResolveActiveStepOptions = {},
): string | null {
  const { skipped, focusedKey } = options;

  if (focusedKey && steps.some((step) => step.key === focusedKey)) {
    return focusedKey;
  }

  const waived = skipped && skipped.length > 0 ? new Set(skipped) : null;
  const next = steps.find((step) => !step.done && !waived?.has(step.key));
  return next?.key ?? null;
}

/** The step a skip would advance TO — what the active card's peek names. */
export function resolveNextStepAfter(
  steps: readonly PointerStep[],
  key: string,
  options: ResolveActiveStepOptions = {},
): string | null {
  const index = steps.findIndex((step) => step.key === key);
  if (index < 0) return null;

  const waived = options.skipped && options.skipped.length > 0 ? new Set(options.skipped) : null;
  const next = steps
    .slice(index + 1)
    .find((step) => !step.done && !waived?.has(step.key));
  return next?.key ?? null;
}

/** Whether evidence just settled a focused step that was pending when focus was set — release the override so the natural pointer advances. */
export function shouldReleaseFocusAfterEvidence(input: {
  focusedKey: string | null | undefined;
  steps: readonly PointerStep[];
  /** Whether the focused step was already done when focus was set. */
  wasDoneAtFocus: boolean | null | undefined;
}): boolean {
  const { focusedKey, steps, wasDoneAtFocus } = input;
  if (!focusedKey || wasDoneAtFocus !== false) return false;
  const step = steps.find((s) => s.key === focusedKey);
  return !!step?.done;
}
