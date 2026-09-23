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
 *
 * `leading-snug` OVERRIDES the preset's `leading-none`, and it is load-bearing.
 * {@link chipLabel} ships `leading-none` (line-height: 1) because a pill face is
 * a single centred line that may paint its descenders outside the line box —
 * nothing clips it. This row is different: its label span is `truncate`
 * (`overflow: hidden`) and is sized BY that line box, so at 12px the box is 12px
 * while Inter needs ~14.5px for ascender+descender (hhea 0.969 + 0.241 em).
 * Everything past 12px was cut, which sheared the tails off g/p/y/j — measured
 * on "Hide package pairing": clientHeight 12, scrollHeight 13. 1.375 × 12 =
 * 16.5px clears the descender with room.
 *
 * THE LAW, so this does not recur: `leading-none` and an overflow-clipped text
 * box are incompatible. Any face that composes a tight-leading preset AND
 * clips (`truncate`, `overflow-hidden`, a fixed `h-*` on the text box) must
 * restate a leading that contains the descender. Tight leading alone is safe;
 * clipping alone is safe; together they eat the bottom of the glyphs.
 */
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
