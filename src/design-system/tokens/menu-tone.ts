/**
 * Shared menu-row tone map — the ONE paint for DropdownMenuItem,
 * ContextMenuItem, and Popover menuitems ({@link MorphingMenuRow}).
 *
 * Two jobs, one map:
 *
 * - **Status commits** (Done / In progress / Cancel) rest as theme pills:
 *   `bg-surface-*` + `text-text-*` + `ring-border-*`. They do not wait for
 *   hover to become a colour. Consecutive pills sit with a hair of air
 *   (`my-0.5`) so they read as chips, not one stacked flag.
 * - **Accent / ordinary / destructive verbs** rest as ink. Neutral wash
 *   (`bg-surface-hover`) only on hover, keyboard focus, and Radix
 *   `data-highlighted` (hold-key then mouse across rows). Danger keeps
 *   `text-text-danger`; it must not steal Cancel's pill fill.
 *
 * Theme tokens only. No hex, no rose/emerald/blue literals, no Button rows
 * for this job, no KeyboardKey paint. Hints belong under the verb
 * (`MENU_ITEM_HINT_CLASS`), not beside it. Caption ink is `text-current`
 * so a hint on a pill stays in that hue (never gray-on-fill). Size and
 * weight carry hierarchy — do not fade the caption under AA.
 */

import { DROPDOWN_ITEM_CORNER } from './radius';

export const MENU_ITEM_TONES = [
  'default',
  'accent',
  'danger',
  'success',
  'warning',
  'cancel',
] as const;

export type MenuItemTone = (typeof MENU_ITEM_TONES)[number];

/** Status commits — pill at rest. */
export const MENU_ITEM_STATUS_TONES = ['success', 'warning', 'cancel'] as const;
export type MenuItemStatusTone = (typeof MENU_ITEM_STATUS_TONES)[number];

/** Verbs — ink until hover / highlight. */
export const MENU_ITEM_VERB_TONES = ['default', 'accent', 'danger'] as const;
export type MenuItemVerbTone = (typeof MENU_ITEM_VERB_TONES)[number];

/**
 * Pointer + keyboard highlight wash. Radix Dropdown/Context set
 * `data-highlighted` when the pointer moves across rows (including hold-F
 * then mouse). Popover buttons have no Radix highlight — they still get
 * `hover:` / `focus:`.
 */
const POINTER_WASH =
  'hover:bg-surface-hover focus:bg-surface-hover data-[highlighted]:bg-surface-hover';

/** Pill already has fill — highlight is a thicker ring, not a second wash. */
const STATUS_PILL_REST = 'my-0.5 ring-1 ring-inset';
const STATUS_PILL_HIGHLIGHT =
  'hover:ring-2 focus:ring-2 data-[highlighted]:ring-2';

export const MENU_ITEM_TONE_CLASS: Record<MenuItemTone, string> = {
  default: `text-text-default ${POINTER_WASH}`,
  accent: `text-text-default ${POINTER_WASH} hover:text-text-accent focus:text-text-accent data-[highlighted]:text-text-accent`,
  // Ink at rest AND on highlight — fill belongs to status pills (cancel).
  // A danger wash of bg-surface-danger would make armed Delete look like idle Cancel.
  danger: `text-text-danger ${POINTER_WASH}`,
  success: `bg-surface-success text-text-success ${STATUS_PILL_REST} ring-border-success hover:bg-surface-success focus:bg-surface-success data-[highlighted]:bg-surface-success ${STATUS_PILL_HIGHLIGHT}`,
  warning: `bg-surface-warning text-text-warning ${STATUS_PILL_REST} ring-border-warning hover:bg-surface-warning focus:bg-surface-warning data-[highlighted]:bg-surface-warning ${STATUS_PILL_HIGHLIGHT}`,
  cancel: `bg-surface-danger text-text-danger ${STATUS_PILL_REST} ring-border-danger hover:bg-surface-danger focus:bg-surface-danger data-[highlighted]:bg-surface-danger ${STATUS_PILL_HIGHLIGHT}`,
};

/** Shared row chrome (pad, corner, disabled). Tone rides {@link MENU_ITEM_TONE_CLASS}. */
export const MENU_ITEM_ROW_CLASS = [
  'relative flex w-full min-w-0 cursor-default select-none items-start gap-2 px-2 py-1.5 text-left text-sm outline-none transition-colors',
  DROPDOWN_ITEM_CORNER,
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&>svg]:size-4 [&>svg]:shrink-0',
].join(' ');

export function menuItemClass(tone: MenuItemTone = 'default', className?: string): string {
  return [MENU_ITEM_ROW_CLASS, MENU_ITEM_TONE_CLASS[tone], className].filter(Boolean).join(' ');
}

/** Grouping rule between status commits and accent verbs. */
export const MENU_SEPARATOR_CLASS = '-mx-1 my-1 h-px bg-border-soft';

/**
 * Caption under the verb. Size is `text-role-caption`. Ink is current-color
 * so a hint on a status pill stays in that hue — never gray-on-fill.
 * Hierarchy is size + `font-normal` vs the verb's `font-medium`; do not
 * fade (`/70`) or the caption fails contrast on pastel pills.
 */
export const MENU_ITEM_HINT_CLASS =
  'mt-0.5 block text-role-caption font-normal text-current';

export function isMenuItemStatusTone(tone: MenuItemTone): tone is MenuItemStatusTone {
  return (MENU_ITEM_STATUS_TONES as readonly string[]).includes(tone);
}
