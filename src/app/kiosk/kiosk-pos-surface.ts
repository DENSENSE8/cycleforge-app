/**
 * Kiosk V2 POS catalog surface — flush Kinetic Ledger plane (cart-root shift).
 *
 * One continuous `bg-surface-card` plane; hairline dividers; no floating
 * rounded-xl cards. Compose only in `ProductSelector` `layout="kiosk-split"`.
 * Issue chips still compose {@link KIOSK_PILL}* in kiosk-chrome (`pill` only).
 */

import { cornerClass } from '@/design-system/tokens/radius';
import { KIOSK_PILL_ACTIVE } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** Shared plane behind catalog + stage — same card plane as chrome bands. */
export const KIOSK_POS_CANVAS = 'bg-surface-card';

/**
 * Landscape category column — fixed width, never flex leftover space.
 * Portrait stays full-bleed above the product stage.
 */
export const KIOSK_POS_SIDEBAR = cn(
  'max-h-[40vh] w-full border-b border-border-soft',
  'md:max-h-none md:w-64 md:shrink-0 md:border-b-0 md:border-r',
);

/**
 * Category accordion scroll body — flush list, no inset pill padding.
 */
export const KIOSK_POS_SIDEBAR_BODY = cn(KIOSK_POS_CANVAS, 'p-0');

/**
 * Category nav item — flush row (no rounded-xl POS exception).
 */
export const KIOSK_POS_CATEGORY = cn(
  'ds-raw-button flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
  cornerClass('flush'),
);

export const KIOSK_POS_CATEGORY_ACTIVE = KIOSK_PILL_ACTIVE;

/** Idle category — hairline hover wash on the shared card plane. */
export const KIOSK_POS_CATEGORY_IDLE =
  'bg-surface-card text-text-default hover:bg-surface-hover active:bg-surface-hover';

/** Wrapping category title — tight leading so long Bose names do not balloon. */
export const KIOSK_POS_CATEGORY_LABEL =
  'min-w-0 flex-1 text-sm font-semibold leading-snug text-text-default';

/** Nested sibling stack — divide-y hairlines, not gap cards. */
export const KIOSK_POS_CATEGORY_STACK = 'flex flex-col divide-y divide-border-hairline';

/**
 * Search host — flush under the header band.
 */
export const KIOSK_POS_SEARCH_HOST =
  'flex items-stretch gap-0 border-b border-border-hairline px-0';

/**
 * Search input — flush field, no rounded-lg sunken well.
 */
export const KIOSK_POS_SEARCH_INPUT = cn(
  'rounded-none border-0 bg-surface-card py-3 px-4',
  focusRing('field', 'accent'),
);

/** Browse stage scroll region — minimal perimeter (horizontal-only list feel). */
export const KIOSK_POS_BROWSE_SCROLL = 'min-h-0 flex-1 overflow-y-auto p-0';

/** Product tile CSS grid — hairline gutters via gap-px on a border host. */
export const KIOSK_POS_GRID = 'grid gap-px bg-border-hairline';

/** Flush product cell shell. */
export const KIOSK_POS_CARD = cn(
  'relative flex flex-col overflow-hidden text-left transition-colors',
  'bg-surface-card',
  cornerClass('flush'),
  'hover:bg-surface-hover',
);

/** Selected product cell — accent hairline, not pill wash. */
export const KIOSK_POS_CARD_SELECTED = 'ring-1 ring-inset ring-blue-500 bg-surface-accent';

/** Caption band under the image well — tight, no card padding balloon. */
export const KIOSK_POS_CARD_CAPTION =
  'flex flex-1 flex-col justify-between gap-1 bg-surface-card px-3 py-2';

/** Square image well. */
export const KIOSK_POS_IMAGE_WELL =
  'relative aspect-square w-full flex-shrink-0 overflow-hidden bg-surface-sunken';

/** Selected check badge on the photo — pill only (house radius exception). */
export const KIOSK_POS_CARD_CHECK = cn(
  'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-blue-600',
  cornerClass('pill'),
);
