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

/** Browse stage scroll region — minimal perimeter (horizontal-only list feel). */
export const KIOSK_POS_BROWSE_SCROLL = 'min-h-0 flex-1 overflow-y-auto p-0';

/**
 * Product tile CSS grid — white host, full stage width. Seams are per-cell
 * hairlines ({@link KIOSK_POS_CARD}), never a gap-px reveal of a colored host:
 * an unfilled trailing row would paint that host color as a gray block.
 */
export const KIOSK_POS_GRID = 'grid w-full gap-0 bg-surface-card';

/** Flush product cell shell. */
export const KIOSK_POS_CARD = cn(
  'relative flex flex-col overflow-hidden text-left transition-colors',
  'bg-surface-card border-b border-r border-border-hairline',
  cornerClass('flush'),
  'hover:bg-surface-hover',
);

/**
 * Selected product cell — accent wash only.
 *
 * The wash lives on the CELL, so the image well and caption below must stay
 * transparent; painting either `bg-surface-card` covers the wash. The blue
 * perimeter is {@link KIOSK_POS_CARD_SELECTED_FRAME} (last child) — an inset
 * ring is covered by the photo and only shows on the caption.
 */
export const KIOSK_POS_CARD_SELECTED = 'bg-surface-accent';

/**
 * Full-cell squared selection frame — last child of the tile so it sits on
 * top of image + caption. Flush, no radius; never `ring-inset` (photo covers it).
 */
export const KIOSK_POS_CARD_SELECTED_FRAME = cn(
  'pointer-events-none absolute inset-0 z-10 border-2 border-blue-500',
  cornerClass('flush'),
);

/**
 * Circular selection dot — top-LEFT of the cell. Outline at rest (the tile
 * reads as selectable), solid accent with a check once picked. Above the
 * selection frame so the check stays visible.
 */
export const KIOSK_POS_CARD_SELECT_DOT = cn(
  'absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center',
  cornerClass('pill'),
);

export const KIOSK_POS_CARD_SELECT_DOT_ON = 'bg-blue-600 text-white';
export const KIOSK_POS_CARD_SELECT_DOT_OFF =
  'border border-border-default bg-surface-card text-transparent';

/**
 * Caption band under the image well — tight, no card padding balloon.
 * Transparent so {@link KIOSK_POS_CARD_SELECTED} shows through (see there).
 */
export const KIOSK_POS_CARD_CAPTION =
  'flex flex-1 flex-col justify-between gap-1 bg-transparent px-3 py-2';

/**
 * Square image well — transparent, so the cell plane (white at rest, accent
 * when selected) is what shows. Never a sunken grey box.
 */
export const KIOSK_POS_IMAGE_WELL =
  'relative aspect-square w-full flex-shrink-0 overflow-hidden bg-transparent';

