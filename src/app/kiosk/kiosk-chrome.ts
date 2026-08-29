/**
 * Kiosk V2 pane chrome — shared header hairline Y + far-left command spine +
 * persistent right cart ledger.
 *
 * Catalog and detail headers compose the same band so the top hairline reads
 * as one continuous seam across columns. Hosts stay `p-0`.
 *
 * Command selection is a two-state spine (`KioskModeSpine`): collapsed icon
 * rail (~56px) or expanded Search + named commands (~256px). Commands swap
 * the center work surface only — they never clear the cart session.
 * Live law: `AGENTS.md` + docs/todo/kiosk-pos-modernization-HANDOFF.md.
 */

import { cornerClass } from '@/design-system/tokens/radius';
import type { KioskServiceId } from '@/lib/kiosk/services';
import { cn } from '@/utils/_cn';

/** Expanded-rail short name — prefers `commandLabel` grammar (Repair / Retail…). */
export function kioskSpineShortLabel(id: KioskServiceId): string {
  if (id === 'repair') return 'Repair';
  if (id === 'sales') return 'Retail';
  if (id === 'buyback') return 'Buyback';
  return 'Pickup';
}

/**
 * Touch-friendly pane title row (~56px). Taller than desk
 * `PRIMARY_CHROME_ROW_FACE` (`h-7`) — tablet counter, not ops densify.
 * Upper band owns `border-b`; bodies never add a matching `border-t`.
 */
export const KIOSK_PANE_HEADER_BAND = cn(
  // Full-bleed host — title type owns its own in-band inset (px-3), never a page margin.
  'flex h-14 shrink-0 items-center gap-3 bg-surface-card pl-0 pr-0',
  'border-b border-border-soft',
);

/**
 * Touch-friendly pane action floor (~56px) — twin of {@link KIOSK_PANE_HEADER_BAND}.
 * Owns `border-t border-border-soft` so left (cart actions) and right (submit)
 * hairlines share one continuous Y with the same token as the header seam.
 * Never `border-border-hairline` here — that reads as a different weight from the top.
 */
export const KIOSK_PANE_FOOTER_BAND = cn(
  'flex h-14 shrink-0 items-stretch bg-surface-card p-0',
  'border-t border-border-soft',
);

/** Pane title face inside {@link KIOSK_PANE_HEADER_BAND}. */
export const KIOSK_PANE_HEADER_TITLE =
  // In-band type inset only — the host band stays edge-to-edge with column seams.
  'min-w-0 flex-1 px-3 text-lg font-semibold tracking-tight text-text-default';

/**
 * THE band search row — one face for every search that sits in a top band.
 *
 * Extracted 2026-08-20 because the two search rows on this screen had drifted
 * apart: the command spine's row carried `border-border-hairline` while the
 * pane bands beside it carried `border-border-soft`, and the repairs search
 * (ProductSelector, flush) was built at `h-11` — 44px in a 56px system, on a
 * `bg-surface-sunken` plane. Three different answers to "what does a row at the
 * top of this screen look like", visible side by side.
 *
 * Full-bleed like every other band: the host stays `px-0` and the content owns
 * its inset. Anything mounting a search in a top band composes THIS.
 */
export const KIOSK_BAND_SEARCH_ROW = cn(
  'flex h-14 shrink-0 items-stretch gap-0 bg-surface-card px-0',
  'border-b border-border-soft',
);

/**
 * In-body section label row — the `KIOSK_SECTION_LABEL` + divider + inset
 * triple, which was hand-composed at eight sites (one of them at `px-6`,
 * silently out of line with the other seven).
 *
 * The seam here is deliberately `border-border-hairline`, NOT the
 * `border-border-soft` of a band: a divider *inside* a body is a lighter fact
 * than the seam that closes a band. That distinction was the thing nothing
 * wrote down, which is why the two weights had been used interchangeably.
 */
export const KIOSK_SECTION_LABEL_ROW = cn(
  'border-b border-border-hairline px-4 py-2',
  'text-role-micro uppercase tracking-[0.16em] text-text-soft',
);

/**
 * The one horizontal inset for pane bodies.
 *
 * The surface carried four (`px-4` ×25, `px-6` ×7, `px-3` ×2, `px-8` ×1). Bands
 * are full-bleed and their titles inset themselves; bodies use this.
 */
export const KIOSK_BODY_INSET = 'px-4';

/**
 * Dense meta chrome — SKU, category row labels, quiet status (not form fields).
 * Keep body/input type at tablet-readable size so iOS does not zoom.
 */
export const KIOSK_META = 'text-role-micro font-semibold text-text-soft';

/** Product tile title — arm’s-length readable on iPad landscape. */
export const KIOSK_TILE_TITLE = 'text-sm font-semibold leading-tight text-text-default';

/**
 * Checkout section micro label (repair / sales panes).
 * Hairline border lives on the host when the section needs a divider.
 */
export const KIOSK_SECTION_LABEL =
  'text-role-micro uppercase tracking-[0.16em] text-text-soft';

/**
 * Selectable pill chrome (repair issue chips).
 * Only house use of `cornerClass('pill')` on the kiosk counter face.
 * Category nav is flush in `kiosk-pos-surface`. Compose with
 * {@link KIOSK_PILL_ACTIVE} / {@link KIOSK_PILL_IDLE}.
 */
export const KIOSK_PILL = cn(
  'ds-raw-button flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
  cornerClass('pill'),
);

/** Selected pill — accent wash (Square chip selected). Pair with a Check glyph. */
export const KIOSK_PILL_ACTIVE = 'bg-surface-accent text-text-default';

/** Idle pill — quiet sunken chip, hover wash. */
export const KIOSK_PILL_IDLE =
  'bg-surface-sunken text-text-default hover:bg-surface-hover active:bg-surface-hover';

/**
 * Issue/reason selected pill — warning wash so selected issues pop on intake.
 * Still a {@link KIOSK_PILL} compose; categories keep {@link KIOSK_PILL_ACTIVE}.
 */
export const KIOSK_PILL_ACTIVE_ISSUE =
  'bg-amber-50 text-amber-900 ring-1 ring-amber-200';

/**
 * Collapsed icon rail — icons stay on-screen (~56px / `w-14`).
 * Never 0 (off-screen) and never a locked labeled 96/`w-24` column.
 */
export const KIOSK_MODE_SPINE_COLLAPSED_W = 'w-14';

/** Numeric twin of {@link KIOSK_MODE_SPINE_COLLAPSED_W}. */
export const KIOSK_MODE_SPINE_COLLAPSED_W_PX = 56;

/**
 * Expanded named rail — Search row + icon-leading labels (~256px / `w-64`).
 * Width is animated on the host via `motionRole.push.rail`; do not snap
 * Tailwind width classes on the column.
 */
export const KIOSK_MODE_SPINE_EXPANDED_W = 'w-64';

/** Numeric twin of {@link KIOSK_MODE_SPINE_EXPANDED_W}. */
export const KIOSK_MODE_SPINE_EXPANDED_W_PX = 256;

/** Outer face of the command spine column (card plane + trailing hairline). */
export const KIOSK_MODE_SPINE_FACE = cn(
  'flex h-full flex-col bg-surface-card',
  'border-r border-border-soft',
);

/**
 * Shared command-cell chrome — touch-tall, flush (no rounded-xl).
 */
export const KIOSK_MODE_SPINE_ROW = cn(
  'ds-raw-button flex w-full shrink-0 transition-colors duration-150',
  'min-h-14',
);

/** Collapsed cell — centered glyph, no visible label. */
export const KIOSK_MODE_SPINE_ROW_COLLAPSED =
  'flex-col items-center justify-center px-1 py-3';

/** Expanded cell — icon-leading + short name. */
export const KIOSK_MODE_SPINE_ROW_EXPANDED =
  'flex-row items-center gap-3 px-3 py-3 text-left';

export const KIOSK_MODE_SPINE_ROW_ACTIVE = 'bg-surface-accent text-text-default';
export const KIOSK_MODE_SPINE_ROW_IDLE =
  'text-text-soft hover:bg-surface-hover hover:text-text-default';

/** Short name next to the spine icon (expanded only). */
export const KIOSK_MODE_SPINE_LABEL = 'min-w-0 truncate text-sm font-semibold leading-tight';

/** Spine glyph — smaller than the old 24px MasterNav-scale icon. */
export const KIOSK_MODE_SPINE_ICON = 'h-5 w-5 shrink-0';

/**
 * Expanded Search row — first row of the named rail (edge-to-edge, no gutter).
 *
 * Composes {@link KIOSK_BAND_SEARCH_ROW} as of 2026-08-20. It used to carry its
 * own `border-border-hairline`, which put a lighter seam on the rail than the
 * pane band it sits flush against — the two read as different weights across
 * one continuous Y.
 */
export const KIOSK_MODE_SPINE_SEARCH_ROW = cn(KIOSK_BAND_SEARCH_ROW, 'items-center');

/**
 * Right cart ledger panel — ~320px / `w-80` so the center work surface stays
 * the elastic absorber. It opens LEFT of the utility spine, which is what
 * toggles it (the spine's cart glyph is the one control).
 */
export const KIOSK_CART_COL = 'w-80';
export const KIOSK_CART_COL_PX = 320;

/** Live line-count badge riding the cart glyph. */
export const KIOSK_CART_COUNT_BADGE = cn(
  'absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center px-1',
  'bg-blue-600 text-role-micro leading-none text-white tabular-nums',
  cornerClass('pill'),
);

/**
 * Right utility spine — the mirror of the left command spine.
 *
 * Always-visible ~56px glyph column at the FAR RIGHT: cart on top, paperwork
 * under it, and room for further checkout-context slots below. Selecting a
 * glyph pushes its panel open to the LEFT of the rail; selecting it again
 * closes it. The rail itself never collapses — it is how the operator gets
 * back to the cart.
 */
export const KIOSK_UTILITY_SPINE_FACE = cn(
  'flex h-full w-14 shrink-0 flex-col items-center gap-0 bg-surface-card py-0',
  'border-l border-border-soft',
);

/** Utility glyph cell — same touch height + states as the command spine row. */
export const KIOSK_UTILITY_SPINE_ROW = cn(
  'ds-raw-button relative flex h-14 w-14 shrink-0 items-center justify-center',
  'transition-colors duration-150',
);

/**
 * Utility panel face — cart / paperwork / triage mounted in the CENTER stage.
 *
 * These are NOT a drawer and NOT a slide-out column: selecting a rail glyph
 * swaps the center work surface, exactly like the left command spine swaps it.
 * Full width of the center, no `border-l` (the rail already owns that seam) and
 * no fixed `w-80` — a floating panel over the work is the shape this replaces.
 */
export const KIOSK_UTILITY_PANEL_FACE = cn(
  'flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card',
);

export const KIOSK_CART_FACE = cn(
  'flex h-full w-80 shrink-0 flex-col bg-surface-card',
  'border-l border-border-soft',
);

/** Cart line row — horizontal hairline only, no inner card padding balloon. */
export const KIOSK_CART_LINE_ROW =
  'flex items-baseline justify-between gap-3 px-4 py-2.5';

/** Customer-face shell — same card plane, no operational chrome. */
export const KIOSK_CUSTOMER_FACE = cn(
  'flex h-full w-full flex-col bg-surface-card text-text-default',
);
