/**
 * Ops table / spreadsheet surface shell — two recipes, one module.
 *
 * **Framed card** ({@link TABLE_SURFACE_CLIP_CLASS}): rounded-xl + raised lift +
 * `overflow-hidden` so cell grid lines clip at the corners. Use for any
 * surface that still needs a raised island inside gutters.
 *
 * **Sheets plane** ({@link TABLE_SURFACE_SHEET_CLASS}): hairline perimeter only —
 * no `rounded-xl`, no raised lift. Use when a Workbench spreadsheet abuts a
 * context rail (or fills a flush workbench body) as one continuous plane.
 * Golden: Receiving / Unbox browse via `LedgerGridSurface` `surface="sheet"`.
 *
 * Frozen header is card-white ({@link TABLE_FROZEN_HEADER_CLASS}); airtable skin
 * draws BOTTOM-only row rules through header + body (no vertical column cage) —
 * borders carry hierarchy, not fill contrast.
 *
 * Never hand-roll `rounded-* border … shadow-*` / header fills for this job.
 */

import { elevationClass } from './shadows';

/** Outer frame — xl radius, perimeter, raised lift (work-card depth). */
export const TABLE_SURFACE_CLASS = [
  'relative',
  'rounded-xl',
  'border border-border-soft',
  'bg-surface-card',
  elevationClass('raised'),
].join(' ');

/**
 * Framed ops table — always clips to the radius so top/bottom corners stay
 * clean against the airtable cell grid.
 */
export const TABLE_SURFACE_CLIP_CLASS = `${TABLE_SURFACE_CLASS} overflow-hidden`;

/**
 * Sheets-class flush spreadsheet plane — hairline rules only, no card island.
 *
 * - No `rounded-xl` / no `elevationClass('raised')` — the grid is coplanar with
 *   the work frame, not a floating padded card.
 * - `border-y` only — side rails (context / inspector) own the vertical seams;
 *   a left/right border here would double them.
 * - `overflow-hidden` clips airtable paints at the sheet edge; sticky header
 *   still docks inside the LedgerGrid scrollport.
 *
 * Pair with `'relative flex min-h-0 min-w-0 flex-1 flex-col'` (`workbench-shell.tsx`) so the host does
 * not re-introduce side/bottom gutters around this shell.
 */
export const TABLE_SURFACE_SHEET_CLASS = [
  'relative',
  'border-y border-border-soft',
  'bg-surface-card',
  'overflow-hidden',
].join(' ');

/**
 * Frozen column-header band — card-white (same plane as body rows). Hierarchy
 * comes from airtable `border-default` rules, not a sunken fill. Pair with
 * opaque sticky stacking; do not use translucent / blur fills under
 * virtualized absolute rows. Never `surface-strong` here — in light it equals
 * `border-subtle` and erases the header grid.
 */
export const TABLE_FROZEN_HEADER_CLASS = 'bg-surface-card';
