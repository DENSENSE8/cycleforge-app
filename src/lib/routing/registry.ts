/**
 * The route → param-spec registry.
 *
 * One lookup for every navigation site that needs to know what a destination
 * owns. Today only the six receiving surfaces are migrated; each later slice
 * registers its family here and inherits the boundary parse for free — no
 * navigation site changes again.
 *
 * A route with no spec keeps the legacy copy-forward behaviour, so migrating is
 * additive and one surface at a time.
 */

import { OUTBOUND_ROUTE_PARAMS } from './outbound-routes';
import { RECEIVING_ROUTE_PARAMS } from './receiving-routes';
import type { RouteParamsSpec } from './route-params';

/**
 * Every migrated spec, longest route first so a nested path resolves to its own
 * surface (`/receiving/history` must beat any `/receiving` prefix).
 */
const ROUTE_PARAM_SPECS: readonly RouteParamsSpec[] = [
  ...RECEIVING_ROUTE_PARAMS,
  ...OUTBOUND_ROUTE_PARAMS,
].sort((a, b) => b.route.length - a.route.length);

/** The spec governing `pathname`, or `null` when that route has not migrated. */
export function routeParamsFor(pathname: string | null | undefined): RouteParamsSpec | null {
  if (!pathname) return null;
  for (const spec of ROUTE_PARAM_SPECS) {
    if (pathname === spec.route || pathname.startsWith(`${spec.route}/`)) return spec;
  }
  return null;
}
