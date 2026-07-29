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
 * This scale is deliberately NOT wired into `tailwind.config.ts` — pointing
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
  /** Flush — data rows, table cells, inline values */
  none: '0px',
  /** 2px — hairline softening, rarely the right call */
  sm: '0.125rem',
  /** 4px — chips, badges */
  DEFAULT: '0.25rem',
  /** 6px — list rows, menu items */
  md: '0.375rem',
  /** 8px — buttons, inputs, menus */
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
 */
export type CornerRole =
  /** Flush with its container — grid cells, full-bleed rows */
  | 'flush'
  /** Chips, badges, copy chips */
  | 'chip'
  /** List rows, menu items */
  | 'row'
  /** Buttons, inputs, dropdown/context menus */
  | 'control'
  /** Form fields, ops-table surfaces, popovers */
  | 'field'
  /** Cards, panels, dialogs, docks */
  | 'card'
  /** Glass worksheets / large canvas containers */
  | 'canvas'
  /** Pills, dots, avatars */
  | 'pill';

const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded',
  row: 'rounded-md',
  control: 'rounded-lg',
  field: 'rounded-xl',
  card: 'rounded-2xl',
  canvas: 'rounded-3xl',
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
