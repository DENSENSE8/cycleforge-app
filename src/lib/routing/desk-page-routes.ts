/** Param ownership for single-surface desk pages outside the station/mode families. */

import type { StudioLens } from '@/components/studio/studio-types';
import { parseReportTab } from '@/lib/reports/report-tabs';
import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramPositiveInt,
  paramRoundTrip,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** `/reports` — Staff day · Packer day · Bin Utilization · Velocity · Dead Stock · Tasks · Task activity. */
const REPORTS_ROUTE_PARAMS = defineRouteParams({
  route: '/reports',
  owns: {
    /** Which report; `staff` is the default. */
    tab: paramRoundTrip(parseReportTab),
    /** The day the day-scoped tabs (Staff day, Packer day) report on. */
    date: paramDateKey,
  },
});

/** `/counter` — the desk side of the shared counter session. */
const COUNTER_ROUTE_PARAMS = defineRouteParams({
  route: '/counter',
  owns: {
    /** The counter session the desk joins. */
    session: paramPositiveInt,
  },
  /** The page is a mobile `RouteShell`. */
  carries: ['pane'],
});

/** `/studio` — the Operations Studio canvas (`useStudioViewState`). */
const STUDIO_ROUTE_PARAMS = defineRouteParams({
  route: '/studio',
  owns: {
    /** The open view. */
    v: paramText,
    /** The focused node within it. */
    focus: paramText,
    /** Zoom level; `1` is the default. */
    z: paramEnum(['0', '1', '2'] as const),
    /** Canvas lens; `build` is the default. */
    lens: paramEnum([
      'build',
      'static',
      'live',
      'gaps',
      'flow',
      'people',
      'procedure',
    ] as const satisfies readonly StudioLens[]),
  },
});

/** `/studio/catalog` — the template catalog (`CatalogWorkspace`). */
const STUDIO_CATALOG_ROUTE_PARAMS = defineRouteParams({
  route: '/studio/catalog',
  owns: {
    /** `browse` (default) · `review` (curators only). */
    mode: paramEnum(['browse', 'review'] as const),
    /** The selected community template (`CommunityCatalogWorkbench`). */
    selectedId: paramPositiveInt,
  },
});

export const DESK_PAGE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  REPORTS_ROUTE_PARAMS,
  COUNTER_ROUTE_PARAMS,
  STUDIO_ROUTE_PARAMS,
  STUDIO_CATALOG_ROUTE_PARAMS,
];
