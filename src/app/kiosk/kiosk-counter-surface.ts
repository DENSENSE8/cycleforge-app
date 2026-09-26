/** Kiosk counter scale — radius · touch · rhythm for the customer-facing face. */

import { type CornerRole, nestedCorner } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * The ops role vocabulary plus `cta` — a primary counter action (Save · Pay ·
 * Look up), which has no ops twin because ops CTAs are deliberately flush.
 */
export type CounterCornerRole = CornerRole | 'cta';

/** Role → rendered class on the counter face. */
const COUNTER_CORNER_CLASS: Record<CounterCornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded-lg',
  row: 'rounded-lg',
  control: 'rounded-xl',
  field: 'rounded-xl',
  cta: 'rounded-2xl',
  card: 'rounded-2xl',
  canvas: 'rounded-3xl',
  surface: 'rounded-xl',
  pill: 'rounded-full',
};

/** Rendered px per counter role — the basis for concentric nesting below. */
const COUNTER_CORNER_PX: Record<CounterCornerRole, number> = {
  flush: 0,
  chip: 8,
  row: 8,
  control: 12,
  field: 12,
  cta: 16,
  card: 16,
  canvas: 24,
  surface: 12,
  pill: 9999,
};

/** The `rounded-*` class for a counter role. `cn()`-ready. */
export function counterCorner(role: CounterCornerRole): string {
  return COUNTER_CORNER_CLASS[role];
}

/** Rendered px for a counter role — for tests and geometry math, not styling. */
export function counterCornerPx(role: CounterCornerRole): number {
  return COUNTER_CORNER_PX[role];
}

/** Concentric inner corner on the counter face — **inner = outer − padding**. */
export function counterNestedCorner(outer: CornerRole, padStep: number): string {
  return counterCorner(nestedCorner(outer, padStep));
}

/** Minimum touch heights. */
export const COUNTER_TOUCH = {
  /** Selectable chip / pill in a group — the one sub-48 case. */
  chip: 'min-h-10',
  /** Every field, row, tile and rail cell. */
  control: 'min-h-12',
  /** Save · Pay · Look up. */
  cta: 'min-h-14',
} as const;

/** Type sizes for the counter face. */
export const COUNTER_TEXT = {
  /** Input + textarea value text. Never smaller. */
  field: 'text-base',
  /** Field label / section eyebrow. */
  label: 'text-sm',
  /** Primary action label. */
  cta: 'text-base font-semibold',
} as const;

/**
 * Vertical + horizontal rhythm. Sections are separated by GAP, never by a
 * hairline on a full-bleed band — that is the ops density grammar, and it is
 * what makes the current counter read as a spreadsheet.
 */
export const COUNTER_RHYTHM = {
  /** Between form sections / cards. */
  section: 'gap-4',
  /** Between fields inside one section. */
  field: 'gap-3',
  /** Inside a panel shell. */
  panel: 'p-4',
  /** Inside a section card. */
  card: 'p-4',
} as const;

/** The Tailwind step `COUNTER_RHYTHM.card` pads by — feeds concentric nesting. */
export const COUNTER_CARD_PAD_STEP = 4;

/**
 * Composed faces. Compose these rather than re-deriving the parts, so a scale
 * change lands everywhere at once.
 */

/** A form section: soft card, own padding, its own rhythm inside. */
export const COUNTER_SECTION = cn(
  'flex flex-col bg-surface-card',
  counterCorner('card'),
  COUNTER_RHYTHM.card,
  COUNTER_RHYTHM.field,
);

/** A text field's shell — radius + touch + 16px value text. */
export const COUNTER_FIELD = cn(
  counterCorner('field'),
  COUNTER_TOUCH.control,
  COUNTER_TEXT.field,
);

/** A primary action. */
export const COUNTER_CTA = cn(
  'flex items-center justify-center',
  counterCorner('cta'),
  COUNTER_TOUCH.cta,
  COUNTER_TEXT.cta,
);

/** A tappable list row / category row / cart line. */
export const COUNTER_ROW = cn(
  'flex w-full items-center text-left',
  counterCorner('row'),
  COUNTER_TOUCH.control,
);

/** A panel or stage shell — the sheet the content sits on. */
export const COUNTER_PANEL = cn(
  'flex min-h-0 flex-col bg-surface-card',
  counterCorner('canvas'),
  COUNTER_RHYTHM.panel,
  COUNTER_RHYTHM.section,
);

/**
 * The px floor a counter target must clear, for tests that measure the rendered
 * box rather than the class string (a class is not a pixel).
 */
export const COUNTER_MIN_TARGET_PX = 48;
/** The px floor for input text — the iOS zoom threshold. */
export const COUNTER_MIN_FIELD_TEXT_PX = 16;
