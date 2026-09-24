import { LIFECYCLE, type LifecycleState, type StateName } from '@cycleforge/design-tokens';

/**
 * Web face of the cross-platform lifecycle + state-tone registry
 * (`packages/design-tokens/src/{lifecycle,state}.ts`).
 *
 * A status map that colours a lifecycle state (packed, shipped, …) reads it
 * from {@link LIFECYCLE_CLASSES} — or, when its vocabulary is not a class
 * string (timeline tones, chip-tone names), from `LIFECYCLE[state].tone` —
 * and never picks the colour itself. `lifecycle.guard.test.ts` enforces that
 * for packed / shipped keys across `src/`.
 *
 * Every class is a theme-registry alias (`--ds-color-*`), so every theme
 * repaints it. Tones without a pastel surface var (info, fulfillment) tint
 * with an alpha of their fill; the alphas are the largest that keep the
 * tone's text ≥ 4.5:1 on the tint over white and #fafafa (BRIEF §8):
 * info /5 → 4.82 / 4.61, fulfillment /10 → 4.76 / 4.59.
 */

export { LIFECYCLE, LIFECYCLE_STATES, type LifecycleState, type StateName } from '@cycleforge/design-tokens';

export interface StateToneClasses {
  /** Ink as text. */
  text: string;
  /** Solid dot / bar / swatch fill. */
  dot: string;
  /** Tinted pill: ground + ink. */
  pill: string;
  /** Pill border colour (pair with a `border` width). */
  border: string;
  /** Pill ring colour (pair with a `ring-1`). */
  ring: string;
  /** Solid spine colour — a row's left rail (pair with `border-l-*`). */
  spine: string;
  /** Whole-row wash — the one tinted fill an industrial row may carry. */
  tint: string;
}

export const STATE_TONE_CLASSES: Readonly<Record<StateName, StateToneClasses>> = {
  info: {
    text: 'text-text-info',
    dot: 'bg-fill-info',
    pill: 'bg-fill-info/5 text-text-info',
    border: 'border-fill-info/40',
    ring: 'ring-fill-info/40',
    spine: 'border-fill-info',
    tint: 'bg-fill-info/5',
  },
  warning: {
    text: 'text-text-warning',
    dot: 'bg-fill-warning',
    pill: 'bg-surface-warning text-text-warning',
    border: 'border-border-warning',
    ring: 'ring-border-warning',
    spine: 'border-fill-warning',
    tint: 'bg-surface-warning',
  },
  fulfillment: {
    text: 'text-text-fulfillment',
    dot: 'bg-fill-fulfillment',
    pill: 'bg-fill-fulfillment/10 text-text-fulfillment',
    border: 'border-fill-fulfillment/40',
    ring: 'ring-fill-fulfillment/40',
    spine: 'border-fill-fulfillment',
    tint: 'bg-fill-fulfillment/10',
  },
  danger: {
    text: 'text-text-danger',
    dot: 'bg-fill-danger',
    pill: 'bg-surface-danger text-text-danger',
    border: 'border-border-danger',
    ring: 'ring-border-danger',
    spine: 'border-fill-danger',
    tint: 'bg-surface-danger',
  },
  success: {
    text: 'text-text-success',
    dot: 'bg-fill-success',
    pill: 'bg-surface-success text-text-success',
    border: 'border-border-success',
    ring: 'ring-border-success',
    spine: 'border-fill-success',
    tint: 'bg-surface-success',
  },
};

/** Lifecycle state → its tone's classes. */
export const LIFECYCLE_CLASSES = Object.fromEntries(
  Object.entries(LIFECYCLE).map(([state, spec]) => [state, STATE_TONE_CLASSES[spec.tone]]),
) as Readonly<Record<LifecycleState, StateToneClasses>>;
