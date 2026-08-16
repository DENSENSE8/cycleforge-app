import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

/**
 * Shared drop-panel chrome for carton-bar + photo-toolbar menus
 * ({@link CopyChipHoverMenuPanel}, IdentityLinkChip, InlinePillPicker menu,
 * overflow). LedgerGrid {@link CopyChipHoverMenu} still uses this panel shell
 * with the roomier default item pad.
 */
export const CHIP_HOVER_MENU_PANEL_CLASS = cn(
  'min-w-35 max-w-[18rem] overflow-hidden border border-border-soft bg-surface-card p-0 text-text-default',
  elevationClass('overlay'),
  cornerClass('flush'),
);

/** Carton / photo-toolbar row — same pad as the chip face (`px-1.5` `gap-1.5`). */
export const CHIP_HOVER_MENU_ITEM_CLASS =
  'relative flex w-full cursor-default select-none items-center gap-1.5 rounded-none px-1.5 py-1.5 text-left text-role-caption font-semibold uppercase tracking-widest outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export const CHIP_HOVER_MENU_ITEM_SEAM_CLASS = 'border-t border-border-hairline';

export const CHIP_HOVER_MENU_ITEM_TONE = {
  default: 'text-text-muted hover:bg-surface-hover focus:bg-surface-hover',
  accent: 'text-blue-700 hover:bg-blue-50 focus:bg-blue-50',
  danger: 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50',
  active: 'bg-surface-sunken text-text-default hover:bg-surface-hover focus:bg-surface-hover',
} as const;

export const CHIP_HOVER_MENU_ICON_CLASS =
  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5';
