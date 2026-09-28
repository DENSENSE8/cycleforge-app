/**
 * The import record's URL contract — ONE parser, read by the list APIs
 * (`/api/imports/runs`, `/api/imports/rows`), the facet counts
 * (`imports.runs` / `imports.rows`) and the page itself, so a sidebar filter
 * means the same predicate everywhere (handoff §6).
 *
 * Pure and client-safe (no DB, no server imports).
 *
 * Encoding: a multi-value facet is ONE param, comma-joined (`?source=a,b`, what
 * the sidebar's NavFilters writes); repeated keys are accepted too. Invalid
 * values are dropped, never an error — a stale link degrades to the default.
 */

import { z } from 'zod';
import {
  IMPORT_ROW_OUTCOMES,
  IMPORT_RUN_STATUSES,
  IMPORT_RUN_TRIGGERS,
  type ImportRowOutcome,
  type ImportRunStatus,
  type ImportRunTrigger,
} from '@/lib/imports/types';
import { addDaysToDateKey, getCurrentPSTDateKey, isDateKey, warehouseCivilTimeToInstant } from '@/utils/date';

/** The page (desktop) and its phone twin. */
export const IMPORTS_PATH = '/operations/imports';
export const IMPORTS_MOBILE_PATH = '/m/imports';

/** `?view=` — runs is the bare URL. */
export const IMPORT_VIEWS = ['runs', 'rows'] as const;
export type ImportView = (typeof IMPORT_VIEWS)[number];

export const IMPORT_RUN_SORTS = ['newest', 'inserted', 'failed'] as const;
export type ImportRunSort = (typeof IMPORT_RUN_SORTS)[number];
export const IMPORT_ROW_SORTS = ['newest', 'order'] as const;
export type ImportRowSort = (typeof IMPORT_ROW_SORTS)[number];
/** Every `?sort=` value any view takes (the route spec's vocabulary). */
export const IMPORT_SORTS = ['newest', 'inserted', 'failed', 'order'] as const;

/** URL param names (§6). */
export const IMPORT_PARAMS = {
  view: 'view',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  timeFrom: 'timeFrom',
  timeTo: 'timeTo',
  trigger: 'trigger',
  status: 'status',
  staff: 'staff',
  source: 'source',
  platform: 'platform',
  account: 'account',
  outcome: 'outcome',
  run: 'run',
  cronRun: 'cronRun',
  sort: 'sort',
  q: 'q',
  page: 'page',
  pageSize: 'pageSize',
} as const;

/** Unset window = the last 7 warehouse days, today included. */
export const IMPORT_DEFAULT_WINDOW_DAYS = 7;
export const IMPORT_DEFAULT_PAGE_SIZE = 50;
export const IMPORT_MAX_PAGE_SIZE = 200;
/** A free-text facet value / the Find text are capped like `paramText`. */
const MAX_TEXT = 200;
const MAX_VALUES = 50;

type ParamReader = Pick<URLSearchParams, 'get'> & Partial<Pick<URLSearchParams, 'getAll'>>;

export interface ImportWindow {
  /** Civil PT days, inclusive. */
  dateFrom: string;
  dateTo: string;
  /** The exact instant window `[fromIso, toIso)`. */
  fromIso: string;
  toIso: string;
  /** False = the 7-day default (no date in the URL). */
  explicit: boolean;
}

export interface ImportFilters {
  view: ImportView;
  /** `null` = no date bound (a pinned `run` / `cronRun` with no explicit dates). */
  window: ImportWindow | null;
  trigger: ImportRunTrigger | null;
  /** Runs view only. */
  status: ImportRunStatus | null;
  /** Runs view only — who triggered a manual run. */
  staffId: number | null;
  sources: string[];
  /** Rows view only. */
  platforms: string[];
  accounts: string[];
  outcomes: ImportRowOutcome[];
  /** Rows view: one run's rows. */
  runId: number | null;
  /** Runs view: the run a `cron_runs` row drove (Operations › Sync links). */
  cronRunId: number | null;
  sort: ImportRunSort | ImportRowSort;
  /** Find: order number, tracking number, run id, sheet tab. */
  q: string;
  page: number;
  pageSize: number;
}

function raw(params: ParamReader, key: string): string | undefined {
  const values = params.getAll ? params.getAll(key) : [params.get(key) ?? ''];
  const joined = values.filter((v) => v != null && v !== '').join(',');
  return joined === '' ? undefined : joined;
}

const text = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(MAX_TEXT));
const positiveInt = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^[1-9]\d{0,14}$/))
  .transform(Number);
const dateKey = z.string().trim().refine((v) => isDateKey(v));
const timeKey = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);
function enumOf<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.enum(values));
}
/** Comma list → distinct trimmed values; `allowed` narrows to a vocabulary. */
function csv<T extends string>(allowed?: readonly T[]) {
  return z.string().transform((v) => {
    const out: T[] = [];
    for (const part of v.split(',')) {
      const value = part.trim();
      if (!value || value.length > MAX_TEXT || out.includes(value as T)) continue;
      if (allowed && !allowed.includes(value as T)) continue;
      out.push(value as T);
      if (out.length >= MAX_VALUES) break;
    }
    return out;
  });
}

const ImportParamsSchema = z.object({
  view: enumOf(IMPORT_VIEWS).catch('runs'),
  dateFrom: dateKey.optional().catch(undefined),
  dateTo: dateKey.optional().catch(undefined),
  timeFrom: timeKey.optional().catch(undefined),
  timeTo: timeKey.optional().catch(undefined),
  trigger: enumOf(IMPORT_RUN_TRIGGERS).optional().catch(undefined),
  status: enumOf(IMPORT_RUN_STATUSES).optional().catch(undefined),
  staff: positiveInt.optional().catch(undefined),
  source: csv<string>().optional().catch(undefined),
  platform: csv<string>().optional().catch(undefined),
  account: csv<string>().optional().catch(undefined),
  outcome: csv<ImportRowOutcome>(IMPORT_ROW_OUTCOMES).optional().catch(undefined),
  run: positiveInt.optional().catch(undefined),
  cronRun: positiveInt.optional().catch(undefined),
  sort: enumOf(IMPORT_SORTS).optional().catch(undefined),
  q: text.optional().catch(undefined),
  page: positiveInt.optional().catch(undefined),
  pageSize: positiveInt.optional().catch(undefined),
});

/**
 * The date window: explicit `dateFrom`/`dateTo` (either alone = that one day),
 * with `timeFrom`/`timeTo` (HH:mm PT) narrowing the ends; else the last 7 PT
 * days — unless a pinned run (`run` / `cronRun`) makes a date bound wrong.
 */
export function resolveImportWindow(
  input: { dateFrom?: string; dateTo?: string; timeFrom?: string; timeTo?: string; pinned: boolean },
  today: string = getCurrentPSTDateKey(),
): ImportWindow | null {
  let from = input.dateFrom ?? input.dateTo;
  let to = input.dateTo ?? input.dateFrom;
  const explicit = from !== undefined && to !== undefined;
  if (!explicit) {
    if (input.pinned) return null;
    to = today;
    from = addDaysToDateKey(today, -(IMPORT_DEFAULT_WINDOW_DAYS - 1));
  } else if (from! > to!) {
    [from, to] = [to, from];
  }
  const timeFrom = explicit ? input.timeFrom : undefined;
  const timeTo = explicit ? input.timeTo : undefined;
  const start = warehouseCivilTimeToInstant(from!, timeFrom ?? '00:00');
  const endBase = timeTo
    ? warehouseCivilTimeToInstant(to!, timeTo)
    : warehouseCivilTimeToInstant(addDaysToDateKey(to!, 1), '00:00');
  if (!start || !endBase) return null;
  // `timeTo` names a minute on the clock; the whole minute is inside.
  const end = timeTo ? new Date(endBase.getTime() + 60_000) : endBase;
  return { dateFrom: from!, dateTo: to!, fromIso: start.toISOString(), toIso: end.toISOString(), explicit };
}

/**
 * Parse the §6 params for one view. `view` wins over `?view=` (the API route
 * knows which list it serves); `null` reads it from the URL. Params that do
 * not apply to the view are ignored, so a param carried across a view switch
 * can never narrow a list that shows no control for it.
 */
export function parseImportParams(
  view: ImportView | null,
  params: ParamReader,
  today?: string,
): ImportFilters {
  const keys = Object.values(IMPORT_PARAMS);
  const input = Object.fromEntries(keys.flatMap((key) => {
    const value = raw(params, key);
    return value === undefined ? [] : [[key, value]];
  }));
  const p = ImportParamsSchema.parse(input);
  const v: ImportView = view ?? p.view;
  const isRuns = v === 'runs';
  const runId = isRuns ? null : (p.run ?? null);
  const cronRunId = isRuns ? (p.cronRun ?? null) : null;
  const sortVocabulary: readonly string[] = isRuns ? IMPORT_RUN_SORTS : IMPORT_ROW_SORTS;
  return {
    view: v,
    window: resolveImportWindow(
      { dateFrom: p.dateFrom, dateTo: p.dateTo, timeFrom: p.timeFrom, timeTo: p.timeTo, pinned: runId != null || cronRunId != null },
      today,
    ),
    trigger: p.trigger ?? null,
    status: isRuns ? (p.status ?? null) : null,
    staffId: isRuns ? (p.staff ?? null) : null,
    sources: p.source ?? [],
    platforms: isRuns ? [] : (p.platform ?? []),
    accounts: isRuns ? [] : (p.account ?? []),
    outcomes: isRuns ? [] : (p.outcome ?? []),
    runId,
    cronRunId,
    sort: (p.sort && sortVocabulary.includes(p.sort) ? p.sort : 'newest') as ImportRunSort | ImportRowSort,
    q: p.q ?? '',
    page: p.page ?? 1,
    pageSize: Math.min(p.pageSize ?? IMPORT_DEFAULT_PAGE_SIZE, IMPORT_MAX_PAGE_SIZE),
  };
}
