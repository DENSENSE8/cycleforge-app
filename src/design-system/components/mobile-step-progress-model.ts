/**
 * Pure state for {@link MobileStepProgress}: which step is done, which is in
 * hand, which is still ahead, and which may be pressed. Kept out of the
 * component so the one rule with logic in it — only a COMPLETED step jumps
 * back — is tested without rendering.
 */

export type MobileStepState = 'done' | 'current' | 'todo';

export interface MobileStepView {
  state: MobileStepState;
  /** A completed step with a press handler — the only jump the bar offers. */
  pressable: boolean;
}

/** Clamp the caller's index into the step range (an empty flow has no current step). */
export function clampStepIndex(currentIndex: number, stepCount: number): number {
  if (stepCount <= 0) return -1;
  if (!Number.isFinite(currentIndex)) return 0;
  return Math.min(Math.max(Math.trunc(currentIndex), 0), stepCount - 1);
}

export function mobileStepViews(stepCount: number, currentIndex: number, canPress: boolean): MobileStepView[] {
  const current = clampStepIndex(currentIndex, stepCount);
  return Array.from({ length: Math.max(stepCount, 0) }, (_, index) => {
    const state: MobileStepState = index < current ? 'done' : index === current ? 'current' : 'todo';
    return { state, pressable: canPress && state === 'done' };
  });
}

/** The caption under the bar: `Step 2 of 4 · Match items`. */
export function mobileStepCaption(labels: readonly string[], currentIndex: number): string {
  const current = clampStepIndex(currentIndex, labels.length);
  if (current < 0) return '';
  return `Step ${current + 1} of ${labels.length} · ${labels[current]}`;
}
