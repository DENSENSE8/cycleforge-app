/**
 * The procedure POINTER — which step the operator is on.
 *
 * ## Why this is a module and not three lines in a component
 *
 * Two surfaces answer "where am I on this carton": the bench stack and the
 * closed-carton receipt. They must never disagree. "The first pending step" is
 * simple enough to re-type at each call site, which is exactly the problem — the
 * moment skips exist, the rule is no longer "first pending" (a skipped step is
 * settled but not done), and a second reader that still scans for `pending`
 * would park the operator on a step they already waived. One answer, two
 * readers; the same discipline `procedure-receipt-derivation.guard.test.ts`
 * enforces for completion.
 *
 * Pure by construction: no fetch, no DB, no React. Everything arrives as
 * arguments so both a server read model and a client component can call it.
 *
 * ## `null` means the carton is settled, not that something failed
 *
 * When every step is done or skipped there is no active step, and that is the
 * signal the receipt takes the surface. A caller that treats `null` as an error
 * has inverted the end state.
 */

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
  /**
   * The operator clicked a settled row to go back to it. Wins over the natural
   * pointer — re-entering a finished step is the whole reopen affordance, and a
   * pointer that immediately walked forward again would make it impossible.
   *
   * Ignored when it names a step that is not in `steps`, so a stale key from a
   * previous carton (or a variant that dropped the step) degrades to the natural
   * pointer instead of parking the bench on a step that does not exist.
   */
  focusedKey?: string | null;
}

/**
 * The step the operator is on, or `null` when every step is settled.
 *
 * Order of precedence, and each rung is load-bearing:
 *  1. an explicitly focused step that still exists — the reopen affordance;
 *  2. the first step that is neither done nor skipped;
 *  3. `null` — settled; the receipt owns the surface.
 */
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

/**
 * The step a skip would advance TO — what the active card's peek names.
 *
 * Resolved from the same list and the same settled-ness rule as
 * {@link resolveActiveStep}, so the label on the button and the step the
 * operator actually lands on cannot drift. A peek computed as "the next array
 * element" would name an already-waived step.
 *
 * `null` when skipping this step settles the carton — the caller says so
 * ("Looks good → done") rather than naming a step that does not follow.
 */
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

/**
 * Whether evidence just settled a focused step that was pending when focus was
 * set — release the override so the natural pointer advances.
 *
 * Reopening an already-done step (`wasDoneAtFocus === true`) keeps the override;
 * clearing it immediately would make checklist / meta reopen impossible.
 * Paging › onto a pending step then capturing evidence must clear, or the dock
 * stays parked on a green step forever.
 */
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
