/**
 * Industrial record ledger — the To-ship row geometry, in ONE place.
 *
 * BRIEF §4 industrial (desk): 5px state spine · square photo · three record
 * bands, 1px rules, radius 0. Row zoom is per list, per staff (S / M / L):
 *
 * | Zoom | Photo | Bands            | Row (incl. 1px rule) |
 * |------|-------|------------------|----------------------|
 * | S    | 32    | one 32px line    | 33                   |
 * | M    | 96    | 3 × 32px         | 97  (default)        |
 * | L    | 108   | 3 × 36px         | 109                  |
 *
 * Heights are FIXED per zoom so the virtualizer never measures — the same
 * numbers drive the first-paint stand-in, which is what keeps the SSR → client
 * swap from shifting a pixel. Band rules live INSIDE each band's box
 * (border-box), so three 32px bands are 96px, not 98.
 *
 * Classes, not colours: every colour a row paints comes from the mode
 * (`bg-mode-*`, `text-mode-*`, `border-mode-*`) or from `LIFECYCLE_CLASSES`.
 */

import type { CSSProperties } from 'react';

export type LedgerRowZoom = 'S' | 'M' | 'L';

export const LEDGER_ROW_ZOOMS: readonly LedgerRowZoom[] = ['S', 'M', 'L'];

export const LEDGER_DEFAULT_ZOOM: LedgerRowZoom = 'M';

export const LEDGER_ZOOM_LABEL: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'Small rows',
  M: 'Medium rows',
  L: 'Large rows',
};

export function isLedgerRowZoom(value: unknown): value is LedgerRowZoom {
  return value === 'S' || value === 'M' || value === 'L';
}

/** Full virtual-item height of one record, bottom rule included. */
export const LEDGER_ROW_PX: Readonly<Record<LedgerRowZoom, number>> = { S: 33, M: 97, L: 109 };

/**
 * A seed-group parent record: one band tall at every zoom (it carries the
 * order's identity and totals, never a second copy of a child's bands).
 */
export const LEDGER_GROUP_PX: Readonly<Record<LedgerRowZoom, number>> = { S: 33, M: 33, L: 37 };

/** One band's box (rule included). */
export const LEDGER_BAND_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-8',
  M: 'h-8',
  L: 'h-9',
};

/** Row box heights — must equal {@link LEDGER_ROW_PX}. */
export const LEDGER_ROW_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-[33px]',
  M: 'h-[97px]',
  L: 'h-[109px]',
};

/** Group parent box heights — must equal {@link LEDGER_GROUP_PX}. */
export const LEDGER_GROUP_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-[33px]',
  M: 'h-[33px]',
  L: 'h-[37px]',
};

/** Photo lane: a full-bleed square, no inset. */
export const LEDGER_PHOTO_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'w-8 h-8',
  M: 'w-24 h-24',
  L: 'w-[108px] h-[108px]',
};

/** The 5px state spine. */
export const LEDGER_SPINE_CLASS = 'w-[5px] shrink-0 self-stretch';

/**
 * Out-of-stock spine: the tone's fill under a diagonal hatch in the row
 * plane's colour — the non-colour carrier for the one state that stops work.
 */
export const LEDGER_SPINE_HATCH_CLASS =
  '[background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--mode-panel)_3px_5px)]';

/**
 * Location lane in the context band — between the state code and the
 * platform, because the first thing a floor hand needs is WHERE the item is.
 * Wide enough for a `ZONE-F // BIN-TECH-PARTS` breadcrumb before it clips.
 */
export const LEDGER_LOCATION_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'w-44 shrink-0',
  M: 'w-60 shrink-0',
  L: 'w-60 shrink-0',
};

/**
 * The evidence column beside the ledger — the desktop terminal's
 * `.evidence-panel` (`minmax(288px, 24vw)`), always mounted so selecting a
 * record never reflows the rows.
 */
export const LEDGER_EVIDENCE_CLASS =
  'flex w-[max(18rem,24vw)] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-mode-ink bg-mode-bar';

/**
 * Toolbar strip. Shared with the SSR stand-in so the first data row lands on
 * the same pixel before and after hydration.
 */
export const LEDGER_TOOLBAR_CLASS =
  'flex min-h-mode-hit min-w-0 shrink-0 items-center gap-1 border-b border-mode-ink bg-mode-bar pr-0';

/**
 * Lifts nested shared controls (toolbar menus drawn at the slot table's 28px
 * chrome face, the order-number chip) to the desk's 32px hit floor on this page
 * only, without forking them.
 */
export const LEDGER_NESTED_HIT_CLASS = '[&_button]:min-h-mode-hit';

/** Desk hit floor for every in-row control (32px). */
export const LEDGER_HIT_CLASS = 'min-h-mode-hit';

/**
 * Pins the type scale inside the ledger. Row heights are fixed for the
 * virtualizer, so the viewer's grid density (`--cf-density`, the slot table's
 * 100% zoom) must not grow text past its band; S / M / L is this list's zoom.
 */
export const LEDGER_DENSITY_STYLE = { '--cf-density': '1' } as CSSProperties;
