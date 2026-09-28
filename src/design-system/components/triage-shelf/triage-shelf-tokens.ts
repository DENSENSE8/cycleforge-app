/**
 * The TRIAGE product shelf — the counter's shelf recipe (`KIOSK_POS_*` in
 * `src/app/kiosk/kiosk-pos-surface.ts`: square photo well, two-line title,
 * price + SKU, availability, ×N pip) ported onto the task-mode utilities, so it
 * paints in the region's mode instead of the counter's raised POS plane.
 *
 * Clean split (operator 2026-09-27): the counter's shelf is the counter's —
 * its sales display is the kiosk's alone. A staff surface that sells
 * (`/orders/new`, `/m/orders/new`) mounts THESE; it never imports
 * `KIOSK_POS_*` or `ProductSelector`.
 */

import { cn } from '@/utils/_cn';

/** Tile track: two columns on a phone, the counter's 148px floor wider. */
export const TRIAGE_SHELF_TRACK = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(148px, calc(50% - 0.25rem)), 1fr))',
} as const;

/** The tile grid — gapped cells on the region's canvas. */
export const TRIAGE_SHELF_GRID = 'grid w-full gap-2 p-2';

/** How many tiles load their photo eagerly, at high fetch priority (first two rows on a desk). */
export const TRIAGE_SHELF_EAGER_TILES = 8;

/** A grid cell — holds the card and its corner marks. */
export const TRIAGE_SHELF_CELL = 'relative isolate h-full';

/** The card: the whole tile is the add target. */
export const TRIAGE_SHELF_CARD = cn(
  'group relative flex h-full w-full flex-col overflow-hidden text-left',
  'rounded-mode border border-mode-rule bg-mode-panel',
  'transition-[border-color,background-color] duration-mode-feedback',
  'hover:border-mode-edge hover:bg-mode-hover',
);

/** On the cart: the accent wash (the counter's "selected"). */
export const TRIAGE_SHELF_CARD_IN_CART = 'border-border-accent bg-surface-accent hover:bg-surface-accent';

/** The keyboard highlight (↑/↓ in a find list) — an inset accent ring, never a layout change. */
export const TRIAGE_SHELF_CARD_ACTIVE = 'ring-2 ring-inset ring-border-accent';

/** Square photo well on the mode's well tone. */
export const TRIAGE_SHELF_IMAGE_WELL = 'relative aspect-square w-full shrink-0 overflow-hidden bg-mode-well';

/** Caption band under the well. */
export const TRIAGE_SHELF_CAPTION = 'flex flex-1 flex-col justify-between gap-1 px-2.5 py-2';

/** Two-line title — the name a caller reads back. */
export const TRIAGE_SHELF_TITLE = 'line-clamp-2 break-words text-role-caption font-semibold leading-tight text-mode-ink';

/** SKU / availability — the quiet facts. */
export const TRIAGE_SHELF_META = 'text-role-micro font-medium text-mode-muted';

/** Price — money reads green (operator 2026-09-27). */
export const TRIAGE_SHELF_PRICE = 'text-role-caption font-semibold tabular-nums text-text-success';

/** ×N on the cart — top-left of the well. */
export const TRIAGE_SHELF_COUNT_PIP =
  'absolute left-1.5 top-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-mode-pill bg-mode-ink px-1.5 text-role-micro font-bold tabular-nums text-mode-panel';

/** A kind mark on the tile / cart line ("Repair service"). */
export const TRIAGE_SHELF_TAG = 'inline-flex shrink-0 items-center rounded-mode-pill bg-surface-info px-1.5 text-role-micro font-medium text-text-info';

/** The trail band over the grid: find · back · crumbs · scope — shelf switch at the right end. */
export const TRIAGE_SHELF_TRAIL = 'flex min-h-12 shrink-0 items-center gap-2 border-b border-mode-rule bg-mode-panel px-2 py-1.5';

/** A glyph chip in the trail (search, back). */
export const TRIAGE_SHELF_TRAIL_ICON = cn(
  'flex size-9 shrink-0 items-center justify-center rounded-mode-control border border-mode-rule bg-mode-panel text-mode-muted',
  'transition-colors duration-mode-feedback hover:bg-mode-hover hover:text-mode-ink',
);
