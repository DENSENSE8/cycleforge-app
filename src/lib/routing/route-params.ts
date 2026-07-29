/**
 * Route param ownership — the URL isolation waist.
 *
 * Replaces the copy-then-hand-delete denylists (`MODE_SCOPED_PARAMS`,
 * `stripCrossSurfaceParams`, …) that a cross-surface navigation needed in order
 * not to leak. Those existed because navigation copied the WHOLE query string
 * forward and then tried to remember every key that should not have come along;
 * every new param was a new leak until someone added it to a list.
 *
 * Three rules (`docs/todo/nav-routing-refactor-EXECUTION-PROMPT.md` §2):
 *
 * 1. **Navigation never copies the current query string.** A target URL is
 *    constructed from a declared param set only — {@link buildRouteUrl}.
 * 2. **Every route declares the params it owns**, as a zod schema. Unknown keys
 *    are dropped at the boundary — {@link parseRouteParams}. A value that fails
 *    its schema is dropped too, so `?unboxview=garbage` can no longer reach a
 *    reader that would have to defend itself.
 * 3. **A param is owned by exactly one route.** Deliberate exceptions live in
 *    {@link SHARED_OWNED_KEYS} with a reason and only ever shrink.
 *
 * Route segments are NOT the isolation mechanism — Next.js strips nothing, and
 * `router.push('/unbox')` carries no query string only because nobody wrote one.
 * Isolation is this module.
 */

import { z } from 'zod';

/** A param's value contract. Output must be a string — URLs hold strings. */
export type ParamSchema = z.ZodType<string>;

/** Trim + lowercase, then match one of `values`. Drops anything else. */
export function paramEnum<const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodType<T[number]> {
  return z
    .string()
    .transform((raw) => raw.trim().toLowerCase())
    .pipe(z.enum(values));
}

/** Trim + UPPERCASE, then match one of `values` (server-state vocabularies). */
export function paramEnumUpper<const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodType<T[number]> {
  return z
    .string()
    .transform((raw) => raw.trim().toUpperCase())
    .pipe(z.enum(values));
}

/**
 * Accept exactly the values an existing house parser returns unchanged.
 *
 * Use this instead of re-typing a vocabulary that already has a source of truth
 * (`parseRepairTab`, `resolveTriageView`, `isRepairColumnSort`, …). A schema that
 * duplicates the list is a second SoT and drifts the first time someone adds a
 * tab; a round-trip check cannot.
 */
export function paramRoundTrip(
  parse: (raw: string) => string | null | undefined,
): ParamSchema {
  return z
    .string()
    .transform((raw) => raw.trim())
    .pipe(z.string().refine((value) => parse(value) === value));
}

/** A positive integer id, kept as its canonical string form. */
export const paramPositiveInt: ParamSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().regex(/^[1-9]\d*$/));

/** A `YYYY-MM-DD` civil date key (never a parsed `Date` — see utils/date.ts). */
export const paramDateKey: ParamSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/** Free text, trimmed, capped so a pasted essay can't ride in the URL. */
export const paramText: ParamSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().min(1).max(200));

/** Present-means-on flag (`?ticketView=1`). */
export const paramFlag: ParamSchema = paramEnum(['1', 'true'] as const);

/**
 * Ambient params — owned by this registry rather than by a route, because they
 * are the same question on every surface that asks it (which staff member, which
 * column is sorted, which carton is open). A route opts in via `carries`.
 *
 * Ambient does NOT mean "survives a mode switch": rule 1 means nothing survives
 * a navigation unless the navigation declares it. `carries` only governs what a
 * pasted deep-link or a back-button entry may keep when it LANDS on the route.
 */
export const AMBIENT_PARAMS = {
  /** Canonical staff filter (`useStaffFilter`). */
  staff: paramPositiveInt,
  /** Legacy receiving-only spelling of `staff`; still read, never written. */
  staffId: paramPositiveInt,
  /** Spreadsheet COLUMN sort — which header the operator clicked. */
  colsort: paramText,
  /** Direction for `colsort`. Deliberately not `dir` (server ordering owns that). */
  coldir: paramEnum(['asc', 'desc'] as const),
  /** Carton selected on a scan surface. */
  recvId: paramPositiveInt,
  /** Line selected within the open carton. */
  lineId: paramPositiveInt,
  /** Carton whose workspace pane is open (restored across a reload). */
  openReceivingId: paramPositiveInt,
} as const satisfies Record<string, ParamSchema>;

export type AmbientParamKey = keyof typeof AMBIENT_PARAMS;

/**
 * Keys legitimately owned by more than one route, with the reason. The
 * param-ownership guard fails on any OTHER duplicate. **This list only shrinks**
 * — same ratchet discipline as the DS guards in `npm run verify`.
 */
export const SHARED_OWNED_KEYS: Readonly<Record<string, string>> = {
  sort: 'Server ORDER BY vocabulary — a different value set per surface (Incoming zoho_newest… vs History unboxed_newest…). One key, one question, per-route values.',
  dir: 'Direction for `sort`; shares its owner set. Stripping one without the other left a dangling direction (the 2026-06 bug).',
  rh_q: 'Receiving search box — Incoming and History mount the same search chrome over their own feed.',
  page: '1-based server pagination. Same question on every paged feed; the page number carries no feed identity, so one key is correct.',
};

/** One route's param contract. */
export interface RouteParamsSpec {
  /** Canonical pathname this spec governs, e.g. `/unbox`. */
  readonly route: string;
  /** Params owned exclusively by this route (or shared per {@link SHARED_OWNED_KEYS}). */
  readonly owns: Readonly<Record<string, ParamSchema>>;
  /** Ambient params this route accepts on arrival. */
  readonly carries?: readonly AmbientParamKey[];
}

/** Identity helper — keeps `owns` keys literal for the ownership guard. */
export function defineRouteParams<const S extends RouteParamsSpec>(spec: S): S {
  return spec;
}

/** Every key this route may hold, owned or carried. */
export function declaredKeys(spec: RouteParamsSpec): string[] {
  return [...Object.keys(spec.owns), ...(spec.carries ?? [])];
}

function schemaFor(spec: RouteParamsSpec, key: string): ParamSchema | null {
  if (key in spec.owns) return spec.owns[key]!;
  if ((spec.carries ?? []).includes(key as AmbientParamKey)) {
    return AMBIENT_PARAMS[key as AmbientParamKey];
  }
  return null;
}

/**
 * Boundary parse: keep only params this route declares, with values that pass
 * their schema. Everything else is dropped — that is rule 2, and it is what
 * makes a stale deep-link or a back-button entry safe without a denylist.
 *
 * Returns a NEW `URLSearchParams`; the input is never mutated.
 */
export function parseRouteParams(
  spec: RouteParamsSpec,
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of declaredKeys(spec)) {
    const raw = params.get(key);
    if (raw === null) continue;
    const parsed = schemaFor(spec, key)?.safeParse(raw);
    if (parsed?.success) next.set(key, parsed.data);
  }
  return next;
}

/** True when `params` already holds exactly what this route declares. */
export function isRouteParamsClean(
  spec: RouteParamsSpec,
  params: URLSearchParams,
): boolean {
  return parseRouteParams(spec, params).toString() === params.toString();
}

/** A declared param assignment. `null` / `undefined` omits the key. */
type RouteParamValues = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Construct a URL for `spec` from a declared value set. **Never reads the
 * current location** — that is rule 1, and it is the whole reason the denylists
 * can be deleted. A value that fails its schema is dropped rather than emitted,
 * so a caller cannot smuggle an unvalidated string into the URL.
 */
export function buildRouteUrl(spec: RouteParamsSpec, values: RouteParamValues = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = schemaFor(spec, key)?.safeParse(String(value));
    if (parsed?.success) params.set(key, parsed.data);
  }
  const qs = params.toString();
  return qs ? `${spec.route}?${qs}` : spec.route;
}
