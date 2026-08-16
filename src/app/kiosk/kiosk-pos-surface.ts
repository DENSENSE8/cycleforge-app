/**
 * Kiosk V2 POS catalog surface — Square / Shopify-style floating cards + pills.
 *
 * Isolated from ops Kinetic Ledger flush chrome (`kiosk-chrome.ts` bands stay
 * square). Compose only in `ProductSelector` `layout="kiosk-split"` — never
 * staff stacked intake.
 *
 * Category nav uses rounded-xl floating items (multi-line names — stadium
 * pills balloon). Issue chips still compose {@link KIOSK_PILL}* in kiosk-chrome.
 */

import { elevationClass } from '@/design-system/tokens/shadows';
import { cornerClass } from '@/design-system/tokens/radius';
import { KIOSK_PILL_ACTIVE } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


/** Canvas behind floating cards — gray ground plane for white tiles. */
export const KIOSK_POS_CANVAS = 'bg-surface-canvas';

/**
 * Landscape category column — fixed width, never flex leftover space.
 * Portrait stays full-bleed above the product stage.
 */
export const KIOSK_POS_SIDEBAR = cn(
  'max-h-[40vh] w-full border-b',
  'md:max-h-none md:w-64 md:shrink-0 md:border-b-0 md:border-r',
);

/**
 * Category accordion scroll body — inset pill stack, no hairline dividers.
 */
export const KIOSK_POS_SIDEBAR_BODY = cn(KIOSK_POS_CANVAS, 'p-4');

/**
 * Category nav item — floating rounded-xl chip (POS radius exception).
 * Multi-line names use {@link KIOSK_POS_CATEGORY_LABEL} `leading-snug`.
 */
export const KIOSK_POS_CATEGORY = cn(
  'ds-raw-button flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
  'rounded-xl',
);

export const KIOSK_POS_CATEGORY_ACTIVE = KIOSK_PILL_ACTIVE;

/** Idle category — white card on canvas so the pill floats, not a sunken row. */
export const KIOSK_POS_CATEGORY_IDLE =
  'bg-surface-card text-text-default hover:bg-surface-hover active:bg-surface-hover';

/** Wrapping category title — tight leading so long Bose names do not balloon. */
export const KIOSK_POS_CATEGORY_LABEL =
  'min-w-0 flex-1 text-sm font-semibold leading-snug text-text-default';

/** Nested sibling stack under an expanded category — gap, not divide-y. */
export const KIOSK_POS_CATEGORY_STACK = 'flex flex-col gap-1.5';

/**
 * Search host — padded field well, not a joined hairline bar.
 */
export const KIOSK_POS_SEARCH_HOST = 'flex items-stretch gap-2 px-0 pb-4';

/**
 * Filled search input override for TextField (default appearance + these).
 * Soft sunken fill + rounded-lg signals interactivity on tablet.
 */
export const KIOSK_POS_SEARCH_INPUT = cn(
  'rounded-lg border-0 bg-surface-sunken py-3 px-4',
  focusRing('field', 'accent'),
);

/** Browse stage scroll region — perimeter pad so cards do not bleed edges. */
export const KIOSK_POS_BROWSE_SCROLL = 'min-h-0 flex-1 overflow-y-auto p-6';

/** Product tile CSS grid — gap between independent cards. */
export const KIOSK_POS_GRID = 'grid gap-4';

/** Floating product card shell. */
export const KIOSK_POS_CARD = cn(
  'relative flex flex-col overflow-hidden text-left transition-all',
  'rounded-2xl bg-surface-card',
  elevationClass('raised', 'soft'),
  'hover:ring-1 hover:ring-border-soft',
);

/** Selected product card — ring only; caption stays on the white tile. */
export const KIOSK_POS_CARD_SELECTED = 'ring-2 ring-blue-500';

/** Caption band under the image well. */
export const KIOSK_POS_CARD_CAPTION =
  'flex flex-1 flex-col justify-between gap-1.5 bg-surface-card p-4';

/** Square image well — clips to card top radius via parent overflow-hidden. */
export const KIOSK_POS_IMAGE_WELL =
  'relative aspect-square w-full flex-shrink-0 overflow-hidden bg-surface-sunken';

/** Selected check badge on the photo — pill only (house radius exception). */
export const KIOSK_POS_CARD_CHECK = cn(
  'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-blue-600',
  cornerClass('pill'),
);
