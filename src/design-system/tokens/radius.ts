/** Corner-radius scale + the semantic role layer. */

/** Tailwind's stock borderRadius values — the typed mirror of what classes render. */
export const radius = {
  /**
   * Flush — data rows, table cells, solid {@link Button} CTAs
   * (`cornerClass('flush')`).
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

type Radius = typeof radius;

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
   */
  | 'surface'
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
  surface: 'rounded-mode',
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
  surface: 10,
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

/**
 * The COUNTER family's card corner (kiosk / walk-in POS) — 12px.
 * its own identity (BRIEF §4c; `IDENTITY_EXEMPT_MODES` in the mode registry),
 */
export const COUNTER_CARD_CORNER = 'rounded-xl';

/** Menu rows inside a {@link COMPOSER_SHELL_CORNER} drop panel padded `p-1`. */
export const COMPOSER_MENU_ITEM_CORNER = 'rounded-xl';

/** Half the region's control corner — a row nested in a control-corner panel. */
const DROPDOWN_ROW_HALF_CONTROL = 'rounded-[calc(var(--mode-radius-control)/2)]';

/** A segmented control's track and its two faces — the concentric pair for a pick-one toggle sitting inside a SOFT shell ({@link… */
export const SEGMENTED_CONTROL_CORNER = 'rounded-mode-control';

/**
 * The pressed/unpressed faces inside {@link SEGMENTED_CONTROL_CORNER} padded
 * `p-0.5` — concentric: the region's control corner minus the 2px pad.
 */
export const SEGMENTED_CONTROL_FACE_CORNER = 'rounded-[max(0px,calc(var(--mode-radius-control)_-_2px))]';


/** MasterNav destination rows and the open-spine labelled Search face — the {@link DROPDOWN_ITEM_CORNER} rung. */
export const SPINE_ROW_CORNER = DROPDOWN_ROW_HALF_CONTROL;

/**
 * Floating menu / dropdown / popover panel — the region's control corner
 * (8px in triage).
 */
export const DROPDOWN_SHELL_CORNER = 'rounded-mode-control';

/** Rows inside a {@link DROPDOWN_SHELL_CORNER} panel padded `p-1` — half the control corner (triage 4px). */
export const DROPDOWN_ITEM_CORNER = DROPDOWN_ROW_HALF_CONTROL;

/**
 * Contextual sidebar controls — the action CTA, filter disclosure rows, the
 * boxed option list, the Reset pill. The region's control corner, so the ⌘K
 * well and the sidebar controls match the 8px header keys (was 6px).
 */
export const SIDEBAR_CONTROL_CORNER = 'rounded-mode-control';

/** Count chips and value chips inside a {@link SIDEBAR_CONTROL_CORNER} row — the {@link DROPDOWN_ITEM_CORNER} rung. */
export const SIDEBAR_CHIP_CORNER = DROPDOWN_ROW_HALF_CONTROL;

/**
 * The search well (FindField, the ⌘K face) — the one control that INVITES a
 * click: soft 12px at rest, then it firms up to the region's control corner
 * the moment it is pressed or holds focus, so the change of shape reads as
 * "you are in it now" (operator 2026-09-27).
 */
export const SEARCH_WELL_CORNER =
  'rounded-xl transition-[border-radius] duration-150 active:rounded-mode-control focus-within:rounded-mode-control';

/**
 * DataTable find-row tokens — search, filter, sort, views, date, fields,
 * zoom, fullscreen, the export glyph. The region's control corner (triage
 * 8px).
 */
export const DATA_TABLE_TOOLBAR_CORNER = 'rounded-mode-control';

/**
 * Chrome INSIDE a `cornerClass('surface')` triage panel — the alerts, pickers, fields and buttons an operator works in the exception editor.
 * Operator 2026-08-31, on the order-exceptions display: round it off. The
 */
// Follows the region's control corner.
export const TRIAGE_PANEL_INNER_CORNER = 'rounded-mode-control';

/** ── The mobile family (operator 2026-09-15) ────────────────────────────────── */
const MOBILE_CARD_CORNER = 'rounded-2xl';
/** A row inside a {@link MOBILE_CARD_CORNER} card — concentric one rung in. */
export const MOBILE_ROW_CORNER = 'rounded-xl';
/** Controls on a phone surface — fields, chips, segmented faces. */
export const MOBILE_CONTROL_CORNER = 'rounded-lg';

/** Handheld scan capture lip — square so overlay chrome shares a full-width rail. */
export const MOBILE_SCAN_WINDOW_CORNER = 'rounded-none';
/** Focus card on the mobile scan tape. */
export const MOBILE_SCAN_CARD_CORNER = MOBILE_CARD_CORNER;
/** History row on the mobile scan tape. */
export const MOBILE_SCAN_ROW_CORNER = MOBILE_ROW_CORNER;

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
