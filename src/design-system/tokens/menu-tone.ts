/**
 * Semantic paint for dropdown / Morphing menu rows.
 *
 * One map so {@link Popover} Morphing rows and {@link DropdownMenuItem} cannot
 * drift. Status commits (success / warning / danger) rest as the theme pill
 * trio (`bg-surface-*` + `text-text-*` + `ring-border-*`). Accent and default
 * stay ink-only until hover so Done / Cancel can lead the eye. Never hex.
 */

export type MenuItemTone = 'default' | 'success' | 'warning' | 'accent' | 'danger';

const RESTING_PILL = {
  success:
    'bg-surface-success text-text-success ring-1 ring-inset ring-border-success hover:bg-surface-success hover:text-text-success focus:bg-surface-success focus:text-text-success data-[highlighted]:bg-surface-success data-[highlighted]:text-text-success',
  warning:
    'bg-surface-warning text-text-warning ring-1 ring-inset ring-border-warning hover:bg-surface-warning hover:text-text-warning focus:bg-surface-warning focus:text-text-warning data-[highlighted]:bg-surface-warning data-[highlighted]:text-text-warning',
  danger:
    'bg-surface-danger text-text-danger ring-1 ring-inset ring-border-danger hover:bg-surface-danger hover:text-text-danger focus:bg-surface-danger focus:text-text-danger data-[highlighted]:bg-surface-danger data-[highlighted]:text-text-danger',
} as const;

const HOVER_FILL =
  'hover:bg-surface-accent hover:text-text-accent focus:bg-surface-accent focus:text-text-accent data-[highlighted]:bg-surface-accent data-[highlighted]:text-text-accent';

export const MENU_ITEM_TONE_CLASS: Record<MenuItemTone, string> = {
  default: `text-text-default ${HOVER_FILL}`,
  accent: `text-text-accent ${HOVER_FILL}`,
  ...RESTING_PILL,
};
