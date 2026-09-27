import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * The contextual sidebar's one pressable block — back row, view rows, filter
 * rows. Flat at rest so a column of them reads as a list; on hover it lifts
 * onto a card (fill + hairline ring + soft shadow); on press it sinks 1px into
 * the well and loses the shadow — a physical key, not a colour swap.
 * Height and type size are the caller's.
 */
export const NAV_BLOCK_CLASS = cn(
  'ds-raw-button relative isolate flex w-full min-w-0 items-center gap-2 px-2 text-left text-text-default',
  'transition-[background-color,box-shadow,transform] duration-100 ease-out',
  'hover:bg-surface-card hover:shadow-sm hover:ring-1 hover:ring-border-soft',
  'active:translate-y-px active:bg-surface-sunken active:shadow-none active:ring-border-hairline',
  SIDEBAR_CONTROL_CORNER,
  focusRing('control', 'accent'),
);

/** The lit plate under the current view — the block's hover face, held. */
export const NAV_BLOCK_PLATE_CLASS = cn(
  'absolute inset-0 -z-10 bg-surface-card shadow-sm ring-1 ring-border-soft',
  SIDEBAR_CONTROL_CORNER,
);

/**
 * The CHOSEN one of a single-choice list (a view, a mode, a sort order) — a
 * key held down, not a black outline and not a check (a check reads as
 * multi-select): the sunken well of the Find field (inset shade + hairline),
 * so the choice reads as pressed into the surface. Unchosen rows sink the
 * same way while pressed, so the click feels like the state it lands in.
 */
export const NAV_CHOICE_SELECTED_CLASS =
  'bg-surface-sunken font-medium text-text-default shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-border-hairline';

/** Press depth for a choice row: sinks 1px into the same well while held. */
export const NAV_CHOICE_PRESS_CLASS =
  'transition-[background-color,box-shadow,transform] duration-100 active:translate-y-px active:bg-surface-sunken active:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]';
