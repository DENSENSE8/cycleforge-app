/**
 * Open door for `GridColumnDetailsPanel` when the ▦ trigger is not painted
 * on Band 3.
 *
 * Band-3 no longer hosts column display (2026-08-12). Show inspector is the
 * door: {@link WorkbenchInspectorToggle} dispatches this event when nothing is
 * on the rail, and {@link GridColumnGutter} opens the panel. Inspector-hosted
 * ▦ (Unbox · To-ship View cluster) stays a portal trigger and does not use
 * this event.
 *
 * Tiny module on purpose — the inspector toggle must not import the gutter /
 * panel graph.
 */

export const GRID_COLUMN_DETAILS_RAIL_ID = 'detail:grid-column-details';

export const GRID_COLUMN_DETAILS_OPEN_EVENT = 'cf:grid-column-details-open';
export const GRID_COLUMN_DETAILS_CLOSE_EVENT = 'cf:grid-column-details-close';

/** Ask the mounted grid gutter to push Column display onto the right rail. */
export function requestOpenGridColumnDetails(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GRID_COLUMN_DETAILS_OPEN_EVENT));
}

/** Drop Column display when a desk occupant claims the right edge. */
export function requestCloseGridColumnDetails(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GRID_COLUMN_DETAILS_CLOSE_EVENT));
}
