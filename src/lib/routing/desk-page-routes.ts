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
  paramTimeKey,
  type RouteParamsSpec,
} from './route-params';
import { z } from 'zod';
import { IMPORTS_PATH, IMPORT_SORTS, IMPORT_VIEWS } from '@/lib/imports/params';
import { IMPORT_RUN_STATUSES, IMPORT_RUN_TRIGGERS } from '@/lib/imports/types';

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

/**
 * A multi-value facet — one comma-joined param (`?source=a,b`, what the
 * sidebar's NavFilters writes). Longer than `paramText`: an account list is
 * operator data, not a pasted essay.
 */
const paramCsv = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().min(1).max(2000));

/**
 * `/operations/imports` — the import record (`src/lib/imports/params.ts`, handoff
 * import-history §6). Runs is the bare URL, Orders `?view=rows`.
 */
const IMPORTS_ROUTE_PARAMS = defineRouteParams({
  route: IMPORTS_PATH,
  owns: {
    view: paramEnum(IMPORT_VIEWS),
    /** Window (PT civil days + HH:mm at each end); unset = the last 7 days. */
    dateFrom: paramDateKey,
    dateTo: paramDateKey,
    timeFrom: paramTimeKey,
    timeTo: paramTimeKey,
    trigger: paramEnum(IMPORT_RUN_TRIGGERS),
    /** Runs view. */
    status: paramEnum(IMPORT_RUN_STATUSES),
    source: paramCsv,
    /** Orders view. */
    platform: paramCsv,
    account: paramCsv,
    outcome: paramCsv,
    /** The open run's record (either view); on Orders it also narrows the list to that run. */
    run: paramPositiveInt,
    /** Runs driven by one `cron_runs` row (Operations › Sync links). */
    cronRun: paramPositiveInt,
    /** The open row's record (Orders view). */
    row: paramPositiveInt,
    sort: paramEnum(IMPORT_SORTS),
    /** Find: order number, tracking number, run id, sheet tab. */
    q: paramText,
    page: paramPositiveInt,
    pageSize: paramPositiveInt,
  },
  /** Run by (`?staff=`, runs view). */
  carries: ['staff'],
});

export const DESK_PAGE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  REPORTS_ROUTE_PARAMS,
  COUNTER_ROUTE_PARAMS,
  STUDIO_ROUTE_PARAMS,
  STUDIO_CATALOG_ROUTE_PARAMS,
  IMPORTS_ROUTE_PARAMS,
];
