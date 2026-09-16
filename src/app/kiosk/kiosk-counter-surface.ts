/**
 * Kiosk counter scale — radius · touch · rhythm for the customer-facing face.
 *
 * @domain-job Resolve the counter face's geometry from one place.
 * @hardware-target Station (mounted counter tablet)
 * @density floor
 * @justification `/kiosk/**` is the only surface a CUSTOMER touches — untrained,
 *   once, standing at a counter — and its region contract already called it
 *   "a form, not a scanner station". Ops chrome is zero-radius industrial
 *   because an operator lives in it all day; a customer form is not that job.
 * Ratified 2026-08-20 in `kinetic-ledger.md` + 2a.
 *
 * ## Why this is not a change to `cornerClass()`
 *
 * `cornerClass` renders `rounded-none` for every industrial ladder role
 * (flush…canvas). `pill` and `surface` sit off that ladder (`surface` is the
 * triage-panel exemption). Remapping a ladder role there would silently re-round
 * every ops surface in the product and break `radius.test.ts`. This module is a **sibling
 * scale over the same role vocabulary** — same colors, same type roles, same
 * motion, different geometry. It is scoped to `/kiosk/**` by convention and by
 * the guard test beside it; importing it into a desk surface is the fork.
 *
 * ## Adoption
 *
 * P1 is this module ONLY (`docs/todo/kiosk-customer-form-face-PLAN.md`). Nothing
 * consumes it yet, so an existing `rounded-none` on a kiosk surface is not a bug
 * — it is un-migrated. P2 migrates the fields, P3 the sections, P4 the CTAs.
 */

import { type CornerRole, nestedCorner } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * The ops role vocabulary plus `cta` — a primary counter action (Save · Pay ·
 * Look up), which has no ops twin because ops CTAs are deliberately flush.
 */
export type CounterCornerRole = CornerRole | 'cta';

/**
 * Role → rendered class on the counter face.
 *
 * `flush` stays flush ON PURPOSE: the seams where shell columns meet (command
 * spine ↔ centre stage ↔ utility rail) are structure, not components. Rounding
 * them would float the columns and re-introduce the banned "floating column
 * islands". Softness belongs to the content, never to the frame.
 */
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

/**
 * Concentric inner corner on the counter face — **inner = outer − padding**.
 *
 * Under the flushed ops ladder `nestedCorner` is a no-op (every role is 0). Here
 * it is load-bearing again: a `card` section with `p-3` wants `chip`-radius
 * fields, or the inner corners read too round.
 *
 * Delegates to the house `nestedCorner` so the ROLE math stays in one place;
 * only the rendered class differs.
 */
export function counterNestedCorner(outer: CornerRole, padStep: number): string {
  return counterCorner(nestedCorner(outer, padStep));
}

/**
 * Minimum touch heights. Thumb targets at arm's length, not mouse targets.
 *
 * 48px is the floor every interactive element clears (WCAG 2.5.5 target size is
 * 44; a mounted tablet used standing wants more). 56px for the primary action so
 * it is unmissable, and 40px only for a chip the customer is *choosing among*,
 * never for a commit.
 */
export const COUNTER_TOUCH = {
  /** Selectable chip / pill in a group — the one sub-48 case. */
  chip: 'min-h-10',
  /** Every field, row, tile and rail cell. */
  control: 'min-h-12',
  /** Save · Pay · Look up. */
  cta: 'min-h-14',
} as const;

/**
 * Type sizes for the counter face.
 *
 * `field` is ≥16px for a hard technical reason, not taste: below 16px, iOS
 * Safari zooms the whole page when an input takes focus and the customer has to
 * pinch back out. It is the single most "not-native" thing a web form can do,
 * and the kiosk ships `text-sm` (14px) everywhere today.
 */
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

/**
 * Signature pad box — WIDER THAN TALL, at {@link SIGNATURE_CAPTURE_ASPECT}.
 *
 * This replaced a bare `PAD_HEIGHT = 200` literal inside `SignaturePad`
 * (2026-09-15). Operator: *"It should display the signature at a half height …
 * the customer will sign their signature with their finger and they will move
 * the signature up to the most above the second half of the signature and then
 * it will display off the page when printed out. It should be half height and
 * so it has a more centered more width than height."*
 *
 * A RATIO, not a height, because the pad is mounted at four measures (the
 * 512px form measure, the customer face, the counter form, a full-viewport
 * Dialog) and a fixed height means a different aspect at each one. The ratio
 * is the print band's own — see `src/lib/repair/signature-geometry.ts` for why
 * that is the number that matters. `max-h-full` is a ceiling for the
 * fullscreen mount only: it can flatten the pad on a short-wide viewport,
 * never make it taller than wide.
 *
 * The `aspect-[5/1]` literal is what Tailwind can see at build time;
 * `kiosk-signature-pad.test.ts` pins it to `SIGNATURE_CAPTURE_ASPECT` so the
 * class and the geometry law cannot drift (same pattern as KIOSK_POS_AT_MD).
 */
export const COUNTER_SIGNATURE_PAD = 'aspect-[5/1] w-full max-h-full';

/**
 * The ruled guide inside the pad — the "sign on this line" cue.
 *
 * PROPORTIONAL (`bottom-[18%]`), not the old `bottom-10`. 40px of a 200px pad
 * was a fifth; on the fixed geometry it would be nearly half, and the customer
 * would be signing in a third of the box — the reported defect one altitude
 * down. At 18% the SIGNABLE band is always most of the pad, at any measure.
 *
 * There is deliberately no second caption inside the canvas: the pad's label
 * row already names the act and the unsigned state paints "Touch to sign", so
 * the old in-canvas "Sign above" span was buying nothing and costing the band.
 */
export const COUNTER_SIGNATURE_GUIDE =
  'pointer-events-none absolute inset-x-6 bottom-[18%] border-b-2 border-dashed border-border-soft';
