/** Corner-radius scale + the semantic role layer. */

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

/** Interaction/containment role → corner. */
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
  /**
   * Grok-style triage panels — TriageScrollLayout right-pane cards only.
   * Off the industrial ladder on purpose: remapping `card` would re-round every
   * ops surface. Agents retrieve `cornerClass('surface')`, never a raw `rounded-*`.
   */
  | 'surface'
  /** Pills, dots, avatars */
  | 'pill';

// Zero-radius industrial:
const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded-none',
  row: 'rounded-none',
  control: 'rounded-none',
  field: 'rounded-none',
  card: 'rounded-none',
  canvas: 'rounded-none',
  surface: 'rounded-xl',
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
  surface: 12,
  pill: 9999,
};

/** Roles that participate in the size ladder, smallest first (`pill` + `surface` excluded). */
const CORNER_LADDER: CornerRole[] = ['flush', 'chip', 'row', 'control', 'field', 'card', 'canvas'];

/** The `rounded-*` class for a role. `cn()`-ready. */
export function cornerClass(role: CornerRole): string {
  return CORNER_CLASS[role];
}

/** The ONE soft corner on an ops surface: */
export const COMPOSER_SHELL_CORNER = 'rounded-2xl';

/** Concentric inner corner: */
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
