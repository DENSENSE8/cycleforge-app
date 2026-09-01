import { chipLabel } from '@/design-system/tokens/typography/presets';
import { elevationClass } from '@/design-system/tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Shared drop-panel chrome for carton-bar + photo-toolbar menus
 * ({@link CopyChipHoverMenuPanel}, IdentityLinkChip, InlinePillPicker menu,
 * overflow). LedgerGrid {@link CopyChipHoverMenu} still uses this panel shell
 * with the roomier default item pad.
 */
export const CHIP_HOVER_MENU_PANEL_CLASS = cn(
  'min-w-35 max-w-[18rem] overflow-hidden border border-border-soft bg-surface-card p-0 text-text-default',
  DROPDOWN_SHELL_CORNER,
  elevationClass('overlay'),
);

/**
 * Carton / photo-toolbar row — same pad as the chip face (`px-1.5` `gap-1.5`)
 * and the same FACE as the chip that opened it ({@link chipLabel}).
 *
 * A menu is the expanded form of the control that spawned it: pick "Medium" off
 * the urgency dropdown and it becomes the urgency pill, so the two must read as
 * one thing. This row was `uppercase tracking-widest` while the pill it fills is
 * sentence case at +0.01em — the same word in two typographic voices depending
 * on whether it was open or closed.
 *
 * No `uppercase`: labels render in the case the catalog authored them
 * (`eBay` keeps its lowercase e). Tone still steps muted → default on hover via
 * {@link CHIP_HOVER_MENU_ITEM_TONE}, which matches the inactive-pill ink.
 */
export const CHIP_HOVER_MENU_ITEM_CLASS =
  `relative flex w-full cursor-default select-none items-center gap-1.5 rounded-none px-1.5 py-1.5 text-left ${chipLabel} outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-50`;

export const CHIP_HOVER_MENU_ITEM_SEAM_CLASS = 'border-t border-border-hairline';

export const CHIP_HOVER_MENU_ITEM_TONE = {
  default: 'text-text-muted hover:bg-surface-hover focus:bg-surface-hover',
  accent: 'text-blue-700 hover:bg-blue-50 focus:bg-blue-50',
  danger: 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50',
  active: 'bg-surface-sunken text-text-default hover:bg-surface-hover focus:bg-surface-hover',
} as const;

export const CHIP_HOVER_MENU_ICON_CLASS =
  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5';
