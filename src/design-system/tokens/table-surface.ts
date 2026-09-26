/** Ops table / spreadsheet surface shell — two recipes, one module. */

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

/** Sheets-class flush spreadsheet plane — hairline rules only, no card island. */
export const TABLE_SURFACE_SHEET_CLASS = [
  'relative',
  'border-y border-border-soft',
  'bg-surface-card',
  'overflow-hidden',
].join(' ');

/** Frozen column-header band — card-white (same plane as body rows). */
export const TABLE_FROZEN_HEADER_CLASS = 'bg-surface-card';
