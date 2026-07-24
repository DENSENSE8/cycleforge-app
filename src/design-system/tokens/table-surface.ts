/**
 * Ops table / spreadsheet surface shell — the one framed recipe for Workbench
 * collection tables (`DataTable`, `LedgerGridSurface`, Pending / Packed
 * `OrdersGridView`).
 *
 * **One recipe:** rounded-xl card + raised lift + `overflow-hidden` so cell grid
 * lines and fills clip cleanly at the corners. Frozen header is a quiet sunken
 * band ({@link TABLE_FROZEN_HEADER_CLASS}); airtable skin draws continuous column
 * rules through header + body.
 *
 * Pending / Packed both use {@link TABLE_SURFACE_CLIP_CLASS}. Page-scroll sticky
 * + rounded clip fought each other — the card clips; the column header sticks
 * inside self-scroll surfaces when the grid owns Y.
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
 * Frozen column-header band — quiet sunken fill over white body rows so
 * airtable column rules (`border-default`) stay visible. Pair with opaque
 * sticky stacking; do not use translucent / blur fills under virtualized
 * absolute rows. Never `surface-strong` here — in light it equals
 * `border-subtle` and erases the header grid.
 */
export const TABLE_FROZEN_HEADER_CLASS = 'bg-surface-sunken';
