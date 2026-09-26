import { chipLabel } from '@/design-system/tokens/typography/presets';
import { elevationClass } from '@/design-system/tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Shared drop-panel chrome for carton-bar + photo-toolbar menus ({@link CopyChipHoverMenuPanel}, IdentityLinkChip, InlinePillPicker menu,… */
export const CHIP_HOVER_MENU_PANEL_CLASS = cn(
  'min-w-35 max-w-[18rem] overflow-hidden border border-border-soft bg-surface-card p-0 text-text-default',
  DROPDOWN_SHELL_CORNER,
  elevationClass('overlay'),
);

/** Carton / photo-toolbar row — same pad as the chip face (`px-1.5` `gap-1.5`) and the same FACE as the chip that opened it ({@link… */
export const CHIP_HOVER_MENU_ITEM_CLASS = cn(
  'relative flex w-full cursor-default select-none items-center gap-1.5 rounded-none px-1.5 py-1.5 text-left',
  chipLabel,
  // Through `cn` (tailwind-merge), so this deterministically REPLACES the
  // preset's `leading-none` instead of racing it in stylesheet order — two
  // live `leading-*` classes would let the emitted CSS order decide silently.
  'leading-snug',
  'outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
);

export const CHIP_HOVER_MENU_ITEM_SEAM_CLASS = 'border-t border-border-hairline';

export const CHIP_HOVER_MENU_ITEM_TONE = {
  default: 'text-text-muted hover:bg-surface-hover focus:bg-surface-hover',
  accent: 'text-blue-700 hover:bg-blue-50 focus:bg-blue-50',
  danger: 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50',
  active: 'bg-surface-sunken text-text-default hover:bg-surface-hover focus:bg-surface-hover',
} as const;

export const CHIP_HOVER_MENU_ICON_CLASS =
  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5';
