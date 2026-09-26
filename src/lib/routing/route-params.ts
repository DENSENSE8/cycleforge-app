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

/**
 * House parser that may rewrite aliases. Hygiene writes the canonical token
 * (`racks` → `bays`) so the address bar matches the UI.
 */
export function paramCanonical(
  parse: (raw: string) => string | null | undefined,
): ParamSchema {
  return z.string().transform((raw, ctx) => {
    const next = parse(raw.trim());
    if (next == null || next === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid' });
      return z.NEVER;
    }
    return next;
  });
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
 * A **bare** presence flag — `?shipped`, `?packed` — read with `.has()`, not
 * `.get()`. Normalizes every accepted spelling to the empty value, which is what
 * `URLSearchParams` yields for a valueless key and what `.has()` tests for.
 *
 * Distinct from {@link paramFlag}, which requires a value: `paramFlag` (and
 * `paramText`, which the dashboard lifecycle tabs used) both REJECT `''`, so a
 * declared-but-valueless key was silently dropped by the boundary parse and the
 * tab it selected reverted to the default. Use this whenever the surface asks
 * `params.has(key)` rather than comparing a value.
 */
export const paramPresence: ParamSchema = z
  .string()
  .transform((raw) => raw.trim().toLowerCase())
  .pipe(z.enum(['', '1', 'true']))
  .transform(() => '');

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
  /**
   * Which pane a MOBILE `RouteShell` is showing (`actions` | `history`).
   *
   * Ambient because a shared design-system shell owns it, not a route:
   * `RouteShell` (`@/design-system/components/RouteShell`) is mounted by
   * `/test`, `/shipping`, `/support`, `/sourcing`, `/walk-in` and the receiving
   * surfaces, and asks the identical question on each.
   *
   * **This was a live mobile defect, not a precaution.** `RouteShell` reads it
   * through a CONSTANT (`searchParams.get(PANE_PARAM)`) from a file outside every
   * surface tree, so neither the migration method's `.get('literal')` grep nor the
   * ownership guard's literal-only regex could see it — and no spec declared it.
   * On the two surfaces that already mounted `useSurfaceParamHygiene()` AND a
   * `RouteShell` (`/test`, receiving), tapping the mobile "Actions" tab wrote
   * `?pane=actions` and the hygiene hook stripped it on the next commit, snapping
   * the pane straight back to History.
   */
  pane: paramEnum(['actions', 'history'] as const),
  /**
   * The station-table URL contract (`@/lib/station/table-url-params`) — the same
   * three questions on every station/history table, so they are ambient for the
   * same reason `colsort`/`coldir` are.
   *
   * **These were dropped on arrival, which broke saved views outright.**
   * `SAVED_VIEW_PARAM_KEYS` captures `layout` / `weekOffset` for
   * `tech_history`, `testing_history`, `receiving_history` and
   * `receiving_incoming`; applying a saved view wrote them and the hygiene hook
   * on `/receiving/history`, `/incoming` and `/test` stripped every one, so the
   * view appeared to apply and then silently reverted. Like `pane`, all three are
   * read through CONSTANTS from modules outside any surface tree, so neither the
   * `.get('literal')` grep nor the ownership guard's regex could see them.
   *
   * Station `scope` is deliberately NOT here: `useStationStaffScope` has zero
   * consumers and `SCOPE_PARAM`/`parseScope` already sit in `knip-baseline.json`
   * as dead exports. `?scope=` stays owned by `/` (Home), whose vocabulary is a
   * different question with its own local parser.
   */
  layout: paramRoundTrip((raw) => (raw === 'board' || raw === 'all' ? raw : null)),
  /** Week navigation offset. Only positive values are ever written (0 = deleted). */
  weekOffset: paramPositiveInt,
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
  q: 'The surface\'s own list filter — one question ("narrow this list"), asked by every route that shows a list. Deliberately NOT the same key as History\'s namespaced `rh_q`, which searches a different feed with its own field/scope pair.',
  open: 'The focused record of the surface — an order id on the Shipping modes (labels / scan-out), the Inventory detail-panel key, and the Inventory › Stock pair key. Same question ("which record is open"); a mode switch drops it anyway, since navigation constructs rather than copies.',
  new: 'Opens the surface\'s own intake form. One question per surface; the routes that use it cannot both be current, so there is no ambiguity to resolve with a longer name.',
  mode: 'The L2 switch on a surface that has NOT graduated to segments. Shared by every such surface by definition; each entry disappears as its surface migrates, so this one shrinks on its own.',
  openOrderId: 'The focused order. Same id space (an order id) wherever it appears — Support and the To-ship desk (`/shipping/orders`) open the same record.',
  type: 'A type/kind facet over the surface\'s own list. Same question, different vocabularies, so each route validates its own values.',
  status: 'A status facet over the surface\'s own list. Same question; per-route values.',
  search: 'A second search box on surfaces that already spend `q` on a different field (Repair\'s queue, Support\'s orders).',
  attention: 'The needs-attention filter — one question ("only the rows that need me") on every queue that offers it.',
  ustatus: 'Unit-status facet, shared by the surfaces that show unit rows (To-ship desk, Support).',
  packStation: 'Packing-station location id filter — Ready to Pack (`/test`) and To-ship (`/shipping/orders`) share the same placement fact.',
  packPlaced: 'Any packing-station placement filter — same question on Ready to Pack and To-ship.',
  rtab: 'Right-pane / workbench facet tab. Same question; the tab vocabularies differ per surface (Labels Queue/Recent, FBA Ready disposition, …).',
  view: 'A saved/named view within the surface. One question ("which view of this list"), per-route vocabularies.',
  range: 'A time-range facet over the surface\'s own data. Same question; each route validates its own windows.',
  plan: 'A focused plan/shipment id on the FBA board. Sole owner since 2026-08-19 — the Home plans rail (Tasks mode) that shared it was deleted; the entry stays until FBA is the only name in this sentence for a release.',
  pending: 'A "pending" facet over the surface\'s own list — the To-ship desk\'s legacy outbound-tab alias (`/shipping/orders`), and the Products catalog\'s pending-action refine flag. The two routes cannot both be current and each validates its own value shape, so a longer name would buy nothing.',
  wstatus: 'Warranty-claim status. Owned by `/support`, which renders the warranty board, and by `/dashboard`, which reads it ONLY to forward a legacy `?warranty=` bookmark on to Support (`buildSupportWarrantyRedirectSearch`). A hand-off, not a second warranty surface — the entry leaves when that redirect is sunset.',
  wexp: 'Warranty-expiry filter; same `/support` + `/dashboard` hand-off as `wstatus`, and leaves with it.',
  serial: 'A scanned serial number. Same identifier space on Operations (the journey focus dimension) and Warehouse (the location lookup) — both answer "which unit", so a longer name would not disambiguate anything.',
  state: 'A state facet over the surface\'s own list — Incoming\'s carrier delivery state, Inventory\'s unit lifecycle states (a comma list). Same question, per-route vocabularies.',
  section: 'A named section of the surface — Operations\' analytics scroll anchor, and Inventory\'s `replenish` mode selector. Both name "which part of this page"; each validates its own values.',
  unit: 'A focused serial-unit. Same id space on Operations (journey focus) and Inventory (the by-unit viewport), so a longer name would not disambiguate anything.',
  sku: 'A focused SKU string — Products Pairing, the Inventory by-sku viewport and the SKU Exceptions record (`TMP-…`) address the same identifier. (Distinct from `skuId`, the sku_catalog row id.)',
  filter: 'The surface\'s own named filter set — Home Today\'s feed filter and Inventory\'s bucket multi-select. One question, per-route vocabularies.',
  openRepair: 'A focused repair order id. Same id space on `/repair`, which renders it, and on `/walk-in`, which only reads it to forward the legacy deep-link to `/pickup?job=repair` — the hand-off is the reason the key is deliberately identical on both sides.',
  tab: 'Sub-tab within the surface, shared by `/repair`, `/walk-in` (redirect shell), `/dashboard` (sales), and Inventory Locations / `/warehouse` orphans BY DESIGN. Vocabularies stay per-route.',
  room: 'Selected warehouse room. The same facet, over the same `locations.room` values, on `/inventory/locations`, `/inventory/stock` and legacy `/warehouse` orphan routes.',
  code: 'Focused bay / bin code. Same id space on Locations and `/warehouse` orphans.',
  showEmpty: 'Map empty-bin toggle. Same question on Locations and `/warehouse` orphans.',
  edit: 'Edit-form toggle for a location record. Same question on Locations and `/warehouse` orphans.',
  stage: 'A pipeline-stage facet over the surface\'s own list — Support\'s ticket stage and the To-ship desk\'s unshipped board stage. One question, per-route vocabularies.',
  rh_field: 'Receiving-history search field. Shared by `/receiving/history` and `/incoming?lane=docked` (Inbound desk Docked), which mount the same History search chrome over the activity feed.',
  rh_scope: 'Receiving-history search scope; shares its owner set with `rh_field`.',
  ticket: 'Focused ticket identity — Support\'s Zendesk ticket id and `/forge`\'s master-plan ticketId. Different id spaces, same question ("which ticket is selected"); the two routes cannot both be current.',
  clayout: 'Compare multi-pane layout (single|split|quad). Same question on Unbox History and To-ship Orders — independent surfaces that cannot both be current; pane recipes differ per route.',
  c0: 'Compare pane-0 recipe; shares its owner set with `clayout`.',
  c1: 'Compare pane-1 recipe; shares its owner set with `clayout`.',
  c2: 'Compare pane-2 recipe; shares its owner set with `clayout`.',
  c3: 'Compare pane-3 recipe; shares its owner set with `clayout`.',
  composerMode:
    'Station composer destination (unbox|ticket). Same question on Unbox, Arrival, and Testing — independent scan stations that cannot both be current. Legacy `label` aliases to unbox.',
  sel: 'FIND confirmation identity (`order:123`).',
  etype: 'FIND browse entity-type refine.',
  hstat: 'FIND browse status refine.',
  chan: 'FIND browse channel refine.',
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
