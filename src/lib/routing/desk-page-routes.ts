/** Param ownership for single-surface desk pages outside the station/mode families. */

import type { StudioLens } from '@/components/studio/studio-types';
import { parseReportTab } from '@/lib/reports/report-tabs';
import {
  defineRouteParams,
  paramCanonical,
  paramDateKey,
  paramEnum,
  paramPositiveInt,
  paramRoundTrip,
  paramText,
  paramTimeKey,
  type RouteParamsSpec,
} from './route-params';
import { paramLocateBucket } from './locate-bucket-param';
import { z } from 'zod';
import { IMPORTS_PATH, IMPORT_SORTS, IMPORT_VIEWS } from '@/lib/imports/params';
import { IMPORT_RUN_STATUSES, IMPORT_RUN_TRIGGERS } from '@/lib/imports/types';
import {
  EXCEPTIONS_PATH,
  EXCEPTION_DOMAINS,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_KINDS,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_RECORD_PARAM,
  parseExceptionRowKey,
} from '@/lib/exceptions/types';
import {
  PRINT_STATION_CONDITION_PARAM,
  PRINT_STATION_CONDITION_VALUES,
  PRINT_STATION_FNSKU_PARAM,
  PRINT_STATION_FNSKU_VIEWS,
  PRINT_STATION_PATH,
  PRINT_STATION_VIEW_PARAM,
} from '@/lib/print-station/fnsku';
import { PRINT_STATIONS_PATH, PRINT_STATIONS_STATION_PARAM, PRINT_STATION_ID_RE } from '@/lib/print-station/stations';
import { CUSTOMER_PATHS, PRINT_STATION_PATHS, SEARCH_PATHS, SUPPORT_PATHS } from '@/lib/nav/route-tree';
import { NAV_LOCATE_SCOPES } from '@/lib/nav/context/schema';
import { SUPPORT_LOCATE_REFS_PARAM, SUPPORT_LOCATE_STATUS_PARAM } from '@/lib/nav/locate/support-params';
import { parseRefInParam, serializeRefIn } from '@/lib/receiving/reconcile';
import {
  SUPPORT_LIST_GROUPS,
  SUPPORT_LIST_SORTS,
  SUPPORT_LIST_VIEWS,
  parseSupportListAssignees,
  parseSupportListPlatformIds,
  parseSupportListStatuses,
} from '@/lib/support/list/support-list';

/** `/reports` — Staff day · Packer day · Bin Utilization · Velocity · Dead Stock · Tasks · Task activity. */
const REPORTS_ROUTE_PARAMS = defineRouteParams({
  route: '/reports',
  owns: {
    /** Which report; `staff` is the default. */
    tab: paramRoundTrip(parseReportTab),
    /** Header Find within the active report. */
    q: paramText,
    /** The day the day-scoped tabs (Staff day, Packer day) report on. */
    date: paramDateKey,
    /** Optional staff member for staff/packer report rows and KPI totals. */
    staffId: paramPositiveInt,
    /** Task time: record kind (task / checklist); unset = both. */
    type: paramEnum(['task', 'checklist'] as const),
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

/** `/customers` — the shared customer book; Find plus the open desktop record. */
const CUSTOMERS_ROUTE_PARAMS = defineRouteParams({
  route: CUSTOMER_PATHS.desktop,
  owns: {
    /** Name, phone, email or customer identity. */
    q: paramText,
    /** The customer open in the desk record plane. */
    customer: paramPositiveInt,
  },
});

/**
 * `/support` — the Support workspace (owner 2026-10-04): the sidebar view,
 * the status chips, the Platform · Account · Assignee facets, sort and
 * group-by (`parseSupportListFilter`, the list's own parser), Find and its
 * pasted list and the open Support item. The table is unpaged.
 */
const SUPPORT_ROUTE_PARAMS = defineRouteParams({
  route: SUPPORT_PATHS.desktop,
  owns: {
    view: paramEnum(SUPPORT_LIST_VIEWS),
    /** The status chips — local statuses, comma-joined in canonical order. */
    status: paramCanonical((raw) => parseSupportListStatuses(raw).join(',') || null),
    platform: paramCanonical((raw) => parseSupportListPlatformIds(raw).join(',') || null),
    /** Account labels, comma-joined. */
    account: paramText,
    /** Staff ids and `none` (unowned), comma-joined. */
    assignee: paramCanonical((raw) => parseSupportListAssignees(raw).join(',') || null),
    sort: paramEnum(SUPPORT_LIST_SORTS),
    group: paramEnum(SUPPORT_LIST_GROUPS),
    /** Find: Support #, order, ticket number, contact, tracking, SKU, subject… */
    q: paramText,
    /** The pasted list and its bucket filter (`SUPPORT_LOCATE`). */
    [SUPPORT_LOCATE_REFS_PARAM]: paramCanonical((raw) => serializeRefIn(parseRefInParam(raw).refs) || null),
    [SUPPORT_LOCATE_STATUS_PARAM]: paramLocateBucket('support'),
    /** The open Support item (support_tickets.id, never the task id). */
    item: paramPositiveInt,
  },
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

/** `/stations/live` — additive phone-origin activity feed V2. */
const STATION_LIVE_ROUTE_PARAMS = defineRouteParams({
  route: '/stations/live',
  owns: {
    job: paramCsv,
    outcome: paramCsv,
    from: paramDateKey,
    to: paramDateKey,
    sort: paramEnum(['newest', 'oldest'] as const),
  },
  carries: ['staff'],
});
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

/**
 * The open exception — its row key `<kind>:<sourceId>` — on the hub and on
 * every lane door that renders the hub list locked (`ExceptionsDesk`).
 */
export const EXCEPTION_RECORD_ROUTE_PARAMS = {
  [EXCEPTION_RECORD_PARAM]: paramRoundTrip((raw) => (parseExceptionRowKey(raw) ? raw : null)),
} as const;

/**
 * `/exceptions` — the global Exceptions hub (owner 2026-09-28,
 * `src/lib/exceptions/types.ts`): every kind, or one domain / one kind, and
 * the open exception's record.
 */
const EXCEPTIONS_ROUTE_PARAMS = defineRouteParams({
  route: EXCEPTIONS_PATH,
  owns: {
    [EXCEPTION_DOMAIN_PARAM]: paramEnum(EXCEPTION_DOMAINS),
    [EXCEPTION_KIND_PARAM]: paramEnum(EXCEPTION_KINDS),
    /** Find: entity id / label, title, tag. */
    q: paramText,
    ...EXCEPTION_RECORD_ROUTE_PARAMS,
    /** The card list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
});

/** `/print-station/stations` — Print station › Stations: Find over station names and the open station. */
const PRINT_STATIONS_ROUTE_PARAMS = defineRouteParams({
  route: PRINT_STATIONS_PATH,
  owns: {
    /** Find: a station's name. */
    q: paramText,
    /** The open station (registry id). */
    [PRINT_STATIONS_STATION_PARAM]: paramRoundTrip((raw) => (PRINT_STATION_ID_RE.test(raw) ? raw : null)),
    /** The row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
});

/** `/print-station` — Print station › FNSKU labels: the view, Find over the FBA catalog and the open FNSKU. */
const PRINT_STATION_ROUTE_PARAMS = defineRouteParams({
  route: PRINT_STATION_PATH,
  owns: {
    /** All FNSKUs (bare) · Reprinted. */
    [PRINT_STATION_VIEW_PARAM]: paramEnum(PRINT_STATION_FNSKU_VIEWS),
    /** Find: FNSKU, ASIN, SKU or title — server-side. */
    q: paramText,
    /** One Amazon condition (`very-good`); unset is every condition. */
    [PRINT_STATION_CONDITION_PARAM]: paramEnum(PRINT_STATION_CONDITION_VALUES),
    /** The open FNSKU (catalog key, upper-case). */
    [PRINT_STATION_FNSKU_PARAM]: paramRoundTrip((raw) => (/^[A-Z0-9]{1,40}$/.test(raw) ? raw : null)),
    /** The row list's 1-based page (`useTriageCut`). */
    page: paramPositiveInt,
  },
});

/** `/print-station/device` — the enrolled print station's own page: `?code=` (the QR) pairs it on arrival. */
const PRINT_STATION_DEVICE_ROUTE_PARAMS = defineRouteParams({
  route: PRINT_STATION_PATHS.device,
  owns: {
    /** The single-use pairing code (url-safe, as enrolling mints it). */
    code: paramRoundTrip((raw) => (/^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null)),
  },
});

/** `/search/list` — the pasted list, full screen (route-tree `pasted-list`). */
const PASTED_LIST_ROUTE_PARAMS = defineRouteParams({
  route: SEARCH_PATHS.pastedList,
  owns: {
    /** The pasted numbers (the bar's parse and cap). */
    refs: paramCanonical((raw) => serializeRefIn(parseRefInParam(raw).refs) || null),
    /** Whose buckets answer the paste. */
    locator: paramRoundTrip((raw) => ((NAV_LOCATE_SCOPES as readonly string[]).includes(raw) ? raw : null)),
    /** One located bucket — the sidebar's Status facet (a live bucket id, `<locator>:<id>` when found elsewhere). */
    status: paramText,
    /** Paste repeats (`parsePastedListRepeats`). */
    rep: paramText,
    /** The sidebar's Sort (`pasted` default unset · `id` · `status`, `-desc` reversed). */
    sort: paramEnum(['id', 'id-desc', 'status', 'status-desc'] as const),
    /** Where Esc returns. */
    back: paramText,
  },
});

export const DESK_PAGE_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  REPORTS_ROUTE_PARAMS,
  COUNTER_ROUTE_PARAMS,
  CUSTOMERS_ROUTE_PARAMS,
  SUPPORT_ROUTE_PARAMS,
  STUDIO_ROUTE_PARAMS,
  STUDIO_CATALOG_ROUTE_PARAMS,
  STATION_LIVE_ROUTE_PARAMS,
  IMPORTS_ROUTE_PARAMS,
  EXCEPTIONS_ROUTE_PARAMS,
  PRINT_STATIONS_ROUTE_PARAMS,
  PRINT_STATION_ROUTE_PARAMS,
  PRINT_STATION_DEVICE_ROUTE_PARAMS,
  PASTED_LIST_ROUTE_PARAMS,
];
