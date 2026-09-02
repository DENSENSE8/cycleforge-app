/**
 * Inline feedback tone map — the four-state machine the staff mouth reaction
 * ({@link WeldedFeedbackPanel}) and dockless InlineActionFeedbackCard share.
 *
 * FOUR STATES, plus `context` for a hinged accessory with no verdict
 * (seller refine / claim type):
 *
 *   loading  → request in flight…
 *   success  → settled and clean.
 *   warning  → committed, but carrying something.
 *   error    → it did not go through.
 *   context  → refining a job on the mouth (no receive verdict).
 */

import type { ButtonVariant } from '@/design-system/primitives/button-variants';

export type InlineActionFeedbackTone = 'loading' | 'success' | 'warning' | 'error' | 'context';

export type InlineActionFeedbackPalette = {
  /** Panel / card border. */
  border: string;
  /** Background tint. */
  bg: string;
  /** The 3px accent rail on the card face. */
  bar: string;
  /** Headline / status text. */
  title: string;
  /** State glyph (check, alert, spinner). */
  icon: string;
  /** Checklist item text. */
  body: string;
  /** Tabular meta (elapsed, commit time). */
  meta: string;
  /**
   * The CTA's Button intent — a {@link ButtonVariant} NAME, never a class
   * string. The fill resolves through `button-variants.ts`, so a warning panel
   * gets an amber button without anyone reaching for a `className` hue
   * override on `<Button>` (see *Do not paint over primitives*). `loading`
   * maps to `secondary`: a state with no verdict yet must not offer a colored
   * commit.
   */
  cta: ButtonVariant;
};

export const INLINE_ACTION_FEEDBACK_TONE = {
  loading: {
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    bar: 'bg-blue-500',
    title: 'text-blue-900',
    icon: 'text-blue-500',
    body: 'text-blue-900',
    meta: 'text-blue-500',
    cta: 'secondary',
  },
  success: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    bar: 'bg-emerald-500',
    title: 'text-emerald-900',
    icon: 'text-emerald-500',
    body: 'text-emerald-900',
    meta: 'text-emerald-600',
    cta: 'success',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    bar: 'bg-amber-500',
    title: 'text-amber-900',
    icon: 'text-amber-500',
    body: 'text-amber-900',
    meta: 'text-amber-600',
    cta: 'warning',
  },
  error: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    bar: 'bg-rose-500',
    title: 'text-rose-900',
    icon: 'text-rose-500',
    body: 'text-rose-900',
    meta: 'text-rose-600',
    cta: 'danger',
  },
  context: {
    border: 'border-border-soft',
    bg: 'bg-surface-sunken',
    bar: 'bg-surface-strong',
    title: 'text-text-default',
    icon: 'text-text-muted',
    body: 'text-text-muted',
    meta: 'text-text-faint',
    cta: 'secondary',
  },
} as const satisfies Record<InlineActionFeedbackTone, InlineActionFeedbackPalette>;

/**
 * The verdict SoT (`classifyReceiveResponse`) speaks in hues because it
 * predates this vocabulary and is shared with non-React callers. One adapter,
 * here, so the mapping exists once instead of at every consumer.
 */
export function toneFromVerdictHue(
  hue: 'emerald' | 'amber' | 'rose',
): InlineActionFeedbackTone {
  return hue === 'emerald' ? 'success' : hue === 'amber' ? 'warning' : 'error';
}
