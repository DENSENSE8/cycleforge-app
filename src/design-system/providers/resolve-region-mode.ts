/**
 * Route → region mode resolution for `ModeRegion` (owner 2026-09-28,
 * `docs/design-system/HANDOFF-remove-desk-floor.md`): the ROUTE declares the
 * mode on every device — no phone / touch-pointer collapse.
 */
import type { ModeName } from '@/design-system/modes/registry';

/**
 * The mode a region paints, given the mode the governing route declares
 * (`modeRouteFor`, null off the registry). A region asking for `triage` on an
 * `industrial` route — a sheet or dialog portalled out of an operation flow —
 * paints the route's `industrial`, unless the region is a `form` (it fills
 * something in), which keeps `triage`. Every other request is painted as asked:
 * `industrial` stays explicit, `counter` / `assistant` keep their identity.
 */
export function resolveRegionMode(requested: ModeName, routeMode: ModeName | null, opts: { form?: boolean } = {}): ModeName {
  return requested === 'triage' && routeMode === 'industrial' && !opts.form ? 'industrial' : requested;
}
