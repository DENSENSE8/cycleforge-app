import { LIFECYCLE, type LifecycleState, type StateName } from '@cycleforge/design-tokens';
import type { RecordStateFace } from './industrial-record';

/**
 * Web face of the cross-platform lifecycle + state-tone registry (`packages/design-tokens/src/{lifecycle,state}.ts`).
 * tone's text ≥ 4.5:1 on the tint over white and #fafafa (BRIEF §8):
 */

export { LIFECYCLE, LIFECYCLE_STATES, type LifecycleState, type StateName } from '@cycleforge/design-tokens';
export { INBOUND_LIFECYCLE, type InboundLifecycleState } from '@cycleforge/design-tokens';
export { PICKUP_LIFECYCLE, type PickupLifecycleState } from '@cycleforge/design-tokens';
export { QC_UNIT_LIFECYCLE, type QcUnitLifecycleState } from '@cycleforge/design-tokens';

export function lifecycleRecordState(state: LifecycleState): RecordStateFace {
  return { id: state, ...LIFECYCLE[state] };
}

interface StateToneClasses {
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
}

export const STATE_TONE_CLASSES: Readonly<Record<StateName, StateToneClasses>> = {
  neutral: {
    text: 'text-text-secondary',
    dot: 'bg-text-faint',
    pill: 'bg-surface-sunken text-text-secondary',
    border: 'border-border-default',
    ring: 'ring-border-default',
    spine: 'border-text-faint',
  },
  info: {
    text: 'text-text-info',
    dot: 'bg-fill-info',
    pill: 'bg-fill-info/5 text-text-info',
    border: 'border-fill-info/40',
    ring: 'ring-fill-info/40',
    spine: 'border-fill-info',
  },
  warning: {
    text: 'text-text-warning',
    dot: 'bg-fill-warning',
    pill: 'bg-surface-warning text-text-warning',
    border: 'border-border-warning',
    ring: 'ring-border-warning',
    spine: 'border-fill-warning',
  },
  fulfillment: {
    text: 'text-text-fulfillment',
    dot: 'bg-fill-fulfillment',
    pill: 'bg-fill-fulfillment/10 text-text-fulfillment',
    border: 'border-fill-fulfillment/40',
    ring: 'ring-fill-fulfillment/40',
    spine: 'border-fill-fulfillment',
  },
  danger: {
    text: 'text-text-danger',
    dot: 'bg-fill-danger',
    pill: 'bg-surface-danger text-text-danger',
    border: 'border-border-danger',
    ring: 'ring-border-danger',
    spine: 'border-fill-danger',
  },
  success: {
    text: 'text-text-success',
    dot: 'bg-fill-success',
    pill: 'bg-surface-success text-text-success',
    border: 'border-border-success',
    ring: 'ring-border-success',
    spine: 'border-fill-success',
  },
};

/**
 * Lifecycle state → its tone's classes. No state washes a whole row (owner
 * 2026-09-25): out of stock is carried by its hatched spine and code, so the
 * red reads on white instead of fading into a pink ground.
 */
export const LIFECYCLE_CLASSES = Object.fromEntries(
  Object.entries(LIFECYCLE).map(([state, spec]) => [state, STATE_TONE_CLASSES[spec.tone]]),
) as Readonly<Record<LifecycleState, StateToneClasses>>;
