/** Kiosk V2 POS catalog surface — RAISED product cards on a ground plane. */

import { cornerClass } from '@/design-system/tokens/radius';
import { TACTILE_PRESS_TRAVEL_CLASS } from '@/design-system/tokens/shadows';
import { KIOSK_PILL_ACTIVE } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';
/** Tablet-measure mirrors of the token roles used below. */
export const KIOSK_POS_AT_MD = {
  cornerSurface: 'md:rounded-xl',
  elevSoft: 'md:shadow-elev-soft',
  elevRaisedHover: 'md:hover:shadow-elev-raised',
} as const;

/**
 * Shared plane behind catalog + stage.
 * The ONE SoT background (operator, 2026-09-14): `bg-surface-card` — the
 */
export const KIOSK_POS_CANVAS = 'bg-surface-card';

/**
 * Category nav item — flush row (no rounded-xl POS exception).
 */
export const KIOSK_POS_CATEGORY = cn(
  'ds-raw-button flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
);

export const KIOSK_POS_CATEGORY_ACTIVE = KIOSK_PILL_ACTIVE;

/** Idle category — hairline hover wash on the shared card plane. */
export const KIOSK_POS_CATEGORY_IDLE =
  'bg-surface-card text-text-default hover:bg-surface-hover active:bg-surface-hover';

/** Nested sibling stack — divide-y hairlines, not gap cards. */
export const KIOSK_POS_CATEGORY_STACK = 'flex flex-col divide-y divide-border-hairline';

/** Product tile CSS grid — seam-separated on a phone, gapped from `md` up. */
export const KIOSK_POS_GRID = 'grid w-full gap-0 md:gap-3';

/** How many catalog tiles load their photo EAGERLY, at high fetch priority. */
export const KIOSK_EAGER_TILE_COUNT = 8;

/** Product card — edge-separated cell on a phone, raised object from `md` up. */
export const KIOSK_POS_CARD = cn(
  'group relative flex flex-col overflow-hidden text-left',
  'bg-surface-card border-b border-r border-border-hairline',
  'md:border',
  KIOSK_POS_AT_MD.cornerSurface,
  KIOSK_POS_AT_MD.elevSoft,
  'transition-[box-shadow,transform,background-color,border-color] duration-150 ease-out',
  KIOSK_POS_AT_MD.elevRaisedHover,
  'md:hover:-translate-y-0.5',
  TACTILE_PRESS_TRAVEL_CLASS,
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/** Selected product cell — accent wash only. */
export const KIOSK_POS_CARD_SELECTED = 'bg-surface-accent border-blue-500';

/** Selection frame — inset ring following the card's own corner AT EACH MEASURE. */
export const KIOSK_POS_CARD_SELECTED_FRAME = cn(
  'pointer-events-none absolute inset-0 z-10 border-2 border-blue-500',
  cornerClass('flush'),
  KIOSK_POS_AT_MD.cornerSurface,
);

/** Circular selection dot — top-LEFT of the cell, rendered ONLY once picked. */
export const KIOSK_POS_CARD_SELECT_DOT = cn(
  'absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center',
  cornerClass('pill'),
);

export const KIOSK_POS_CARD_SELECT_DOT_ON = 'bg-blue-600 text-white';

/** Grid CELL — the wrapper that holds a card and its corner controls. */
export const KIOSK_POS_CARD_CELL = 'relative isolate h-full';

/** Favorite pip — top-RIGHT of the cell, opposite the selection dot. */
export const KIOSK_POS_CARD_FAVORITE_PIP = cn(
  'ds-raw-button absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center',
  cornerClass('pill'),
  'transition-colors duration-150 ease-out',
);

/** Pinned — amber, the house favorite ink (`Star` in the admin catalog). */
export const KIOSK_POS_CARD_FAVORITE_PIP_ON = 'bg-amber-500 text-white';

/** Unpinned — present but recessive; the photo stays the loudest thing. */
export const KIOSK_POS_CARD_FAVORITE_PIP_OFF = cn(
  'bg-surface-card/70 text-text-faint',
  'hover:bg-surface-card hover:text-amber-600 active:bg-surface-card',
);

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

/** Browse stage scroll region. */
export const KIOSK_POS_BROWSE_SCROLL = 'min-h-0 flex-1 overflow-y-auto px-0 md:px-3 pb-0 md:pb-3';
/** Action footer that hosts {@link KIOSK_POS_CTA} — a TRANSPARENT float. */
export const KIOSK_POS_ACTION_BAR = cn(
  'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center',
  'bg-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
);

/** Scroll clearance under a floating {@link KIOSK_POS_CTA}. */
export const KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE = 'pb-24 md:pb-24';

/** Floating header dock — trail + search bands as ONE glass unit over the grid. */
export const KIOSK_POS_TOP_DOCK = cn(
  'pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col',
  // Same surface token as the canvas beneath, in the codebase's glass form
  // (`bg-surface-card/…` — the StaffPickerList / SwimlaneBoard vocabulary).
  'bg-surface-card/70 backdrop-blur-lg',
);
export const KIOSK_POS_TOP_DOCK_INTERACTIVE = 'pointer-events-auto';

/** The trail band as it renders INSIDE {@link KIOSK_POS_TOP_DOCK}. */
export const KIOSK_POS_TRAIL_BAND = 'flex h-14 shrink-0 items-center gap-2 bg-transparent';

/** Word-control chip — the modern form for the row's ghost comboboxes (command · All products · stance). */
export const KIOSK_POS_TRAIL_CONTROL =
  'flex h-9 items-center rounded-full border border-border-soft bg-surface-card px-3 transition-colors hover:bg-surface-sunken';

/** Glyph chip — icon buttons (search · close · back · paperwork · cart) wear the SAME container as the word chips: */
export const KIOSK_POS_TRAIL_ICON =
  'flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-surface-card transition-colors hover:bg-surface-sunken';

/** Entry field — the kiosk form control (mobile-native step path). */
export const KIOSK_POS_ENTRY =
  'flex h-12 w-full rounded-xl border border-border-soft bg-surface-card px-4 text-sm text-text-default outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-surface-canvas';

/** Multiline twin — notes and anything that wraps. */
export const KIOSK_POS_ENTRY_AREA =
  'flex min-h-28 w-full rounded-xl border border-border-soft bg-surface-card px-4 py-3 text-sm text-text-default outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-surface-canvas resize-none';

/**
 * Leading-glyph slot for an entry — the money mark on the price field.
 * Operator 2026-09-15 asked for "a green price icon" on the repair form's
 */
export const KIOSK_POS_ENTRY_ICON_HOST = 'relative';
export const KIOSK_POS_ENTRY_ICON =
  'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-success';
export const KIOSK_POS_ENTRY_ICON_INSET = 'pl-11';
/**
 * The same slot in soft ink — for glyphs that name a field's KIND without
 * being money (the contact step's phone / person / mail / pin). Green is the
 * money ink; a phone number is not a price.
 *
 * This is also what lets an entry field keep its name once it is filled: the
 * placeholder vanishes on the first keystroke, and a second TEXT label above
 * the field is exactly the "Phone number twice above the keypad" failure
 * (operator 2026-09-30). The glyph stays, so the field still says what it is.
 */
export const KIOSK_POS_ENTRY_ICON_NEUTRAL =
  'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-soft';
/**
 * Form measure — the fixed-width column every ENTRY surface renders in.
 * Operator ruling 2026-09-13: the product field is full-bleed (it is a
 */
export const KIOSK_POS_FORM_MEASURE = 'mx-auto w-full max-w-lg';

/**
 * Scroll clearance under the floating header (one 56px band + breathing
 * room). Applied unconditionally (the dock is always mounted, unlike the CTA).
 */
export const KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE = 'pt-20';
/** The primary kiosk CTA — centred key, no cast of any kind. */
export const KIOSK_POS_CTA = cn(
  // The dock is `pointer-events-none` so the catalog stays scrollable through
  // it; the key is the one thing in that strip that can be hit.
  'pointer-events-auto w-full md:max-w-sm',
  'shadow-none',
  TACTILE_PRESS_TRAVEL_CLASS,
  'enabled:active:scale-100',
  'transition-[transform,background-color] duration-100 ease-out',
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/** The secondary partner of {@link KIOSK_POS_CTA} — bounded and centred like the key, just narrower and quieter. */
export const KIOSK_POS_CTA_SECONDARY = cn(
  'pointer-events-auto w-full max-w-40',
  'shadow-none',
  TACTILE_PRESS_TRAVEL_CLASS,
  'enabled:active:scale-100',
  'transition-[transform,background-color,border-color] duration-100 ease-out',
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/** The History face's master rail — a fixed-width left column from `md`. */
export const KIOSK_POS_HISTORY_RAIL = cn(
  'flex min-h-0 w-full flex-col border-b border-border-soft',
  'md:w-80 md:shrink-0 md:border-b-0 md:border-r',
);
