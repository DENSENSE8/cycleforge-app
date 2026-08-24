/**
 * Corner-radius scale + the semantic role layer.
 *
 * ## The scale
 *
 * These values now mirror Tailwind's **stock** `borderRadius` byte for byte —
 * i.e. what the `rounded-*` classes in the app actually render. They previously
 * sat one step ABOVE the classes of the same name (`radii.lg` was 12px while
 * `rounded-lg` renders 8px), so any comment that paired a token name with a
 * class name shipped ~4px wrong. Realigning them removes that trap; it changed
 * no pixels, because nothing consumed the old values.
 *
 * This scale is deliberately NOT wired into `tailwind.config.mjs` — pointing
 * `theme.extend.borderRadius` at it would remap every `rounded-*` call site in
 * the app at once. The classes stay Tailwind's; this module is the typed mirror
 * plus the role layer below.
 *
 * ## The role layer
 *
 * Prefer {@link cornerClass} over a bare `rounded-*` for new surfaces: a ROLE
 * ("this is a card", "this is a control") survives a scale change, a raw class
 * does not. Same shape as the other visual axes — `elevationClass(role)`
 * (shadows), `focusRing(archetype, tone)`, the `inset-*` spacing intents, and
 * `text-role-*`. Radius was the one axis with a token file but no role layer.
 *
 * Nothing adopts this yet by design: migrating call sites is a visual change and
 * is being staged surface by surface. Existing `rounded-*` classes are correct
 * and are not a bug to fix on sight.
 */

/** Tailwind's stock borderRadius values — the typed mirror of what classes render. */
export const radius = {
  /**
   * Flush — data rows, table cells, solid {@link Button} CTAs
   * (`cornerClass('flush')`), industrial instrument chrome.
   */
  none: '0px',
  /** 2px — hairline softening, rarely the right call */
  sm: '0.125rem',
  /** 4px — chips, badges */
  DEFAULT: '0.25rem',
  /** 6px — list rows, menu items */
  md: '0.375rem',
  /** 8px — soft menus / dropdown chrome (`control` role) */
  lg: '0.5rem',
  /** 12px — fields, ops tables, popovers */
  xl: '0.75rem',
  /** 16px — cards, panels, dialogs */
  '2xl': '1rem',
  /** 24px — full-bleed canvas / glass worksheets */
  '3xl': '1.5rem',
  /** Pills, circular buttons */
  full: '9999px',
} as const;

export type Radius = typeof radius;

/**
 * Interaction/containment role → corner. Pick by what the element IS, not by a
 * pixel value. Ordered smallest to largest; `pill` is outside the ladder.
 *
 * Prefer {@link cornerClass}(`'flush'`) for new industrial chrome (Kinetic
 * Ledger / Stitch zero-radius). Soft ladder steps remain for chips · legacy
 * card·canvas shells · true pills (avatars · switches) until those surfaces
 * migrate call-site by call-site — remapping `field`/`control` here would
 * silently rewrite `nestedCornerClass('card', …)` consumers.
 */
export type CornerRole =
  /** Flush with its container — grid cells, full-bleed rows, solid Button CTAs */
  | 'flush'
  /** Chips, badges, copy chips */
  | 'chip'
  /** List rows, menu items */
  | 'row'
  /** Soft menus / dropdown chrome (`rounded-lg`). Solid {@link Button} uses `flush`. */
  | 'control'
  /** Form fields, ops-table surfaces, popovers */
  | 'field'
  /** Cards, panels, dialogs, docks */
  | 'card'
  /** Glass worksheets / large canvas containers */
  | 'canvas'
  /** Pills, dots, avatars */
  | 'pill';

// Zero-radius industrial: ops chrome is flush-square. Every non-`pill` role
// renders `rounded-none` (Wave 0b/0c/0d/0e). `pill` is the ONE surviving radius
// — status dots · avatars · Switch tracks. CORNER_PX below is deliberately
// UNTOUCHED so `nestedCorner`'s concentric ROLE math is unchanged (only the
// rendered CLASS flushed); concentric nesting is a no-op under zero-radius.
const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded-none',
  row: 'rounded-none',
  control: 'rounded-none',
  field: 'rounded-none',
  card: 'rounded-none',
  canvas: 'rounded-none',
  pill: 'rounded-full',
};

/** Rendered px per role — the basis for the concentric math in {@link nestedCorner}. */
const CORNER_PX: Record<CornerRole, number> = {
  flush: 0,
  chip: 4,
  row: 6,
  control: 8,
  field: 12,
  card: 16,
  canvas: 24,
  pill: 9999,
};

/** Roles that participate in the size ladder, smallest first (`pill` excluded). */
const CORNER_LADDER: CornerRole[] = ['flush', 'chip', 'row', 'control', 'field', 'card', 'canvas'];

/** The `rounded-*` class for a role. `cn()`-ready. */
export function cornerClass(role: CornerRole): string {
  return CORNER_CLASS[role];
}

/**
 * The ONE soft corner on an ops surface: the composer-shell family.
 *
 * `OmnichannelComposerDock` is a declared carve-out from the zero-radius law —
 * it is the ChatGPT-style prompt dock, and its shell (`rounded-2xl`), its
 * commit control (`rounded-full`) and its footer track
 * (`SlicedActionDock`'s `COMPOSER_PILL_TRACK`) have always been soft. Three
 * places had that corner as a literal and nothing named it, so a fourth
 * surface welded to the same shell had no way to match it except by guessing.
 *
 * It is deliberately NOT a `CornerRole`. The role ladder is the ops scale and
 * every non-`pill` rung renders flush; adding a soft rung there would hand
 * every workbench CTA a way to round itself. This is a named exemption for one
 * shell family, and a call site that reaches for it is claiming membership in
 * that family — which is checkable in review, unlike `rounded-2xl`.
 *
 * Law: ops chrome is flush-square; the
 * composer dock and the kiosk counter face are the exemptions, and neither is
 * a licence to round anything else.
 */
export const COMPOSER_SHELL_CORNER = 'rounded-2xl';

/**
 * Concentric inner corner: **inner = outer − padding**.
 *
 * A box nested inside a rounded container looks wrong unless its radius is the
 * outer radius minus the gap between them; equal radii read as too round on the
 * inside, and a too-small inner radius leaves a visible sliver at each corner.
 *
 * `padStep` is the Tailwind spacing step the outer container pads by — pass `3`
 * for `p-3`, i.e. the number you already wrote in the class. (Steps are 4px at
 * the default density; the density multiplier scales both radii together, so the
 * relationship holds.)
 *
 * The result snaps DOWN to the nearest role on the ladder, so it is always a
 * real house corner rather than an arbitrary px value.
 *
 * The house already documents one instance of this by hand — a glass
 * `rounded-3xl` worksheet with `p-3` takes `rounded-xl` inner fields
 * (`station-workbench.md`). That is exactly `nestedCorner('canvas', 3)`.
 */
export function nestedCorner(outer: CornerRole, padStep: number): CornerRole {
  const outerPx = outer === 'pill' ? CORNER_PX.canvas : CORNER_PX[outer];
  const target = outerPx - Math.max(0, padStep) * 4;
  if (target <= 0) return 'flush';

  let best: CornerRole = 'flush';
  for (const role of CORNER_LADDER) {
    if (CORNER_PX[role] <= target) best = role;
  }
  return best;
}

/** Convenience: the class for a concentric inner corner. */
export function nestedCornerClass(outer: CornerRole, padStep: number): string {
  return cornerClass(nestedCorner(outer, padStep));
}
