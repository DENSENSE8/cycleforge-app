/**
 * Operator-surface registry (Studio-driven operator surfaces, Phase 0).
 *
 * A **surface** is a first-class operator "website page" — the job an operator
 * performs ("Unbox", "Triage", "Incoming") — addressed by a stable, semantic,
 * human-readable key (`unbox`, `triage`), NOT a numeric hash. Each surface maps
 * to a semantic route (`/unbox`), an archetype (Station / Workbench / …), and —
 * per §5.3 Option A of the plan — one or more `station_definitions` rows keyed
 * by `page_key` (+ `mode_key` for sub-variants). We do NOT birth a sibling
 * `page_definitions` table: `station_definitions` already carries
 * `page_key`/`mode_key`/`version`/`is_active` + the `'legacy'` slots hatch.
 *
 * This file is CODE (the capability declaration, PR-reviewed). What surfaces
 * exist and how they are composed *for a given org* is DATA
 * (`station_definitions` rows, published from the Studio). The registry below
 * is the closed set of surface capabilities the app knows how to render; a new
 * surface must be added here (guarded by `surface-keys.test.ts`).
 *
 * See docs/todo/studio-driven-operator-surfaces-refactor-plan.md.
 */

import type { ArchetypeId } from './archetype';
import type { SurfaceSessionBinding } from '@/lib/sessions/types';

/**
 * Workbench Layer C recipe / branch ids. Declared on every
 * `archetype: 'workbench'` surface; null on Station / Monitor / Canvas.
 * Law: `.claude/rules/display/workbench.md` + child recipe files.
 * Never a fifth ARCHETYPE_IDS value.
 */
export const WORKBENCH_BRANCH_IDS = [
  'ops-queue',
  'master-detail',
  'board',
  'fact-stack',
  'service-workspace',
] as const;

export type WorkbenchBranchId = (typeof WORKBENCH_BRANCH_IDS)[number];

export function isWorkbenchBranchId(
  value: string | null | undefined,
): value is WorkbenchBranchId {
  return value != null && (WORKBENCH_BRANCH_IDS as readonly string[]).includes(value);
}

/**
 * Every operator surface the app knows about. Stable string keys — human
 * readable, conventional, and durable across renames (Notion page types /
 * Linear concepts). NEVER a numeric hash for a primary operator surface.
 *
 * Adding a key here is a deliberate act: it must get a `SURFACE_REGISTRY`
 * entry (compile-time enforced by the `Record<SurfaceKey, …>` below) and is
 * checked structurally by the guard test.
 */
export const SURFACE_KEYS = [
  'unbox',
  'triage',
  'incoming',
  'pickup',
  'repair',
  'history',
  'pack',
  'test',
  'outbound',
  'support',
] as const;

export type SurfaceKey = (typeof SURFACE_KEYS)[number];

/** A search-param delta a legacy alias applies to reconstruct the old URL. */
export type SurfaceParamDelta = Record<string, string | null>;

/**
 * How today's app still renders this surface — the source the migration alias
 * redirects *from*. `pathname` + optional `params` describe the legacy URL(s)
 * that must keep resolving to the surface (e.g. `/receiving?mode=receive`).
 * `bareResolves` = true when the legacy pathname with NO params also lands on
 * this surface (bare `/receiving` → Unbox today).
 */
export interface SurfaceLegacyLocation {
  pathname: string;
  /** The `?mode=`/`?view=`-style params that select this surface at the legacy path. */
  params?: SurfaceParamDelta;
  /** True when the bare legacy pathname (no params) also resolves here. */
  bareResolves?: boolean;
}

export interface SurfaceDefinition {
  key: SurfaceKey;
  /** Human label shown in nav/title — the operator's job, not the feature bucket. */
  label: string;
  /** Canonical semantic route (preferred, human-readable). No numeric paths. */
  route: string;
  /** Display archetype hint. `pickArchetype()` returns this unless overridden per-region. */
  archetype: ArchetypeId;
  /**
   * Workbench recipe / branch when `archetype === 'workbench'`.
   * Required (non-null) for Workbench surfaces; must be `null` otherwise.
   */
  workbenchBranch: WorkbenchBranchId | null;
  /** Permission gate (mirrors ROUTE_PERMISSIONS / the surface's data APIs). */
  permission: string;
  /**
   * `station_definitions.page_key` this surface resolves its composition from
   * (Option A). Defaults to `key`; during the receiving split several surfaces
   * still share the legacy `receiving` page_key + a distinct `mode_key`.
   */
  pageKey: string;
  /** `station_definitions.mode_key` — the sub-variant within `pageKey`. */
  modeKey: string;
  /**
   * WHICH SESSION THIS SURFACE STARTS — required, with **no default**.
   *
   * `kind: 'scan'` carries a `scanType` and competes for the ONE armed scan
   * session app-wide (`work_sessions`, `ux_work_sessions_armed_scan`).
   * `kind: 'task'` carries none, and N may be open at once. That two-value
   * discriminator is the whole scan-ownership model — tiles never compete for
   * a barcode, so there is no per-tile scan focus.
   *
   * It is required *because* the registry is a closed `Record<SurfaceKey, …>`:
   * the compiler enumerates every surface that has not answered, so a new
   * surface cannot inherit a session kind by omission. A default here would be
   * a silent opt-out taken by every site nobody visited.
   *
   * Vocabulary: `@/lib/sessions/types`. Table: `work_sessions`.
   */
  session: SurfaceSessionBinding;
  /**
   * Scan policy: which focus-locked scan classifier this Station surface owns.
   * `null` = not a scan surface (Workbench/Monitor). Consumed by the
   * surface-aware scan classifier (Phase 3a). Pickup opens/matches LCPU orders
   * (no serial reclassification — that stays Unbox-only).
   */
  scan: 'unbox' | 'triage' | 'pickup' | null;
  /** Default `?view=`/sub-view for the surface, if it has one. */
  defaultView?: string;
  /** Workflow node type this surface binds to (Studio node → surface binding). */
  workflowNodeType?: string;
  /** Where today's app still serves this surface (drives the legacy alias layer). */
  legacy?: SurfaceLegacyLocation;
}

/**
 * The closed registry. `Record<SurfaceKey, …>` makes a missing entry a compile
 * error, so a new key in `SURFACE_KEYS` cannot ship without a definition.
 *
 * The receiving-page family — `unbox`/`triage`/`incoming`/`pickup`/`repair`/
 * `history` — shares the `receiving` page_key with distinct mode_keys, so a
 * per-org `station_definitions` row resolves per surface without a schema
 * change. Each is a mode on the receiving rail with its own graduated route.
 * `pack`/`test` keep their own future page_keys.
 */
export const SURFACE_REGISTRY: Record<SurfaceKey, SurfaceDefinition> = {
  unbox: {
    key: 'unbox',
    session: { kind: 'scan', scanType: 'unbox' },
    label: 'Unbox',
    route: '/unbox',
    archetype: 'station',
    workbenchBranch: null,
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'receive',
    scan: 'unbox',
    defaultView: 'recent',
    workflowNodeType: 'receiving',
    // Both bare `/receiving` and `/receiving?mode=receive` resolve to Unbox today.
    legacy: { pathname: '/receiving', params: { mode: 'receive' }, bareResolves: true },
  },
  triage: {
    key: 'triage',
    session: { kind: 'scan', scanType: 'triage' },
    label: 'Arrival',
    route: '/triage',
    archetype: 'station',
    workbenchBranch: null,
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'triage',
    scan: 'triage',
    defaultView: 'triage',
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'triage' } },
  },
  incoming: {
    key: 'incoming',
    // Inbound queue: a Workbench worklist, nothing to scan into.
    session: { kind: 'task' },
    label: 'Inbound',
    route: '/incoming',
    archetype: 'workbench',
    workbenchBranch: 'ops-queue',
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'incoming',
    scan: null,
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'incoming' } },
  },
  // Local Pickup — a Receiving MODE with its own graduated route, exactly like
  // Unbox/Triage/Incoming. (It is not a separate "Walk-In station": front-desk
  // pickup is receiving work, and the operator switches to it from the receiving
  // mode rail.) Sales history lives on Dashboard (`?mode=sales` / `?mode=pickup`),
  // not here; counter intake for sales still opens from `/pickup?job=sales`.
  // Local Pickup — hybrid Station scan loop (open/match LCPU) + Workbench
  // ops-queue map. Create stays on the workbench New Pickup CTA; kiosk intake
  // (later) shares the same POST /api/local-pickup-orders contract.
  pickup: {
    key: 'pickup',
    session: { kind: 'scan', scanType: 'pickup' },
    label: 'Local Pickup',
    route: '/pickup',
    archetype: 'workbench',
    workbenchBranch: 'ops-queue',
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'pickup',
    scan: 'pickup',
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'pickup' } },
  },
  // Repair intake — the sibling Receiving mode. `/repair` is now a first-class
  // surface route (it used to redirect to `/pickup?job=repair`, the job-switcher
  // model that this refactor drops). Gated by `receiving.view` like the rest of
  // the rail; `repair.*` still gates the repair APIs.
  repair: {
    key: 'repair',
    // Repair intake is a queue, not a bench — `scan` is already null.
    session: { kind: 'task' },
    label: 'Repair',
    route: '/repair',
    archetype: 'workbench',
    workbenchBranch: 'ops-queue',
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'repair',
    scan: null,
    workflowNodeType: 'receiving',
    // The job-param URL the station model used — kept resolving via a proxy redirect.
    legacy: { pathname: '/pickup', params: { job: 'repair' } },
  },
  history: {
    key: 'history',
    // A Monitor read. Never owns the wedge.
    session: { kind: 'task' },
    label: 'Receiving History',
    route: '/receiving/history',
    archetype: 'monitor',
    workbenchBranch: null,
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'history',
    scan: null,
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'history' } },
  },
  pack: {
    key: 'pack',
    // A packing bench IS a scan bench; the legacy `scan` field never grew
    // a 'pack' classifier, which is exactly the gap the session kind closes.
    session: { kind: 'scan', scanType: 'pack' },
    label: 'Packing',
    route: '/pack',
    archetype: 'station',
    workbenchBranch: null,
    permission: 'packing.view',
    pageKey: 'packer',
    modeKey: 'standard',
    scan: null,
    // Engine node type (src/lib/workflow/nodes/pack.node.ts). Must match a real
    // registered node so a template with a `pack` step seeds the pack surface.
    workflowNodeType: 'pack',
    legacy: { pathname: '/packer', bareResolves: true },
  },
  test: {
    key: 'test',
    // Same as pack: a real scan bench the legacy `scan` field could not name.
    session: { kind: 'scan', scanType: 'test' },
    label: 'Testing',
    route: '/test',
    archetype: 'station',
    workbenchBranch: null,
    permission: 'tech.view',
    pageKey: 'tech',
    modeKey: 'testing',
    scan: null,
    // Engine node type (src/lib/workflow/nodes/inspection.node.ts) — the test/QC
    // step. Was the synthetic 'testing'; a template names it `inspection`.
    workflowNodeType: 'inspection',
    legacy: { pathname: '/tech', params: { view: 'testing' } },
  },
  outbound: {
    key: 'outbound',
    // Scan-out is a bench (`/shipping/scan-out`), so this is a scan session.
    session: { kind: 'scan', scanType: 'outbound' },
    label: 'Shipping',
    // ⚠️ THIS ROUTE 404s TODAY. Left pointing at the deleted page on purpose —
    // every way of "fixing" it is an operator decision, not a wiring one.
    //
    // The Labels, Scan out and Packing Review PAGES were all deleted on
    // 2026-08-21; `src/app/shipping` now holds only `fba/` and `orders/`.
    // `sidebar-navigation.ts` took that on the chin the same day: it dropped
    // the child rows ("a child that 404s is worse than an absent one") and
    // pointed the domain `href` at `SHIPPING_ORDERS_PATH`. This registry entry
    // never caught up, so anything resolving the canonical route for this
    // surface — nav, the launch index, the legacy `/outbound` redirect, and
    // now the canvas session tile — lands on a 404.
    //
    // Repointing it at `/shipping/orders` was TRIED and is wrong as a silent
    // edit: that path is deliberately gated `orders.view`, not `shipping.view`
    // (see ROUTE_PERMISSIONS — the longer prefix is there specifically to beat
    // `/shipping`), so the move would hand the Shipping surface a different
    // permission boundary and send `shipping.view`-only staff to a desk they
    // cannot open. `surface-routing.test.ts` catches exactly that and is right
    // to. The To-ship desk is also a different JOB from Labels, so pointing
    // here would rename the surface rather than restore it.
    //
    // The two coherent fixes, both needing a decision:
    //   1. Restore `src/app/shipping/labels/page.tsx` (the surface comes back).
    //   2. Retire the `outbound` surface, or redefine it AS the To-ship desk —
    //      which means moving `permission` to `orders.view` and `modeKey` to
    //      `orders` together, and accepting the access change.
    //
    // `modeKey` is NOT a URL either way: it is half of the `pageKey::modeKey`
    // pair `surface-resolver` looks a studio surface-definition ROW up by, so
    // it moves only as part of decision 2, never on its own.
    route: '/shipping/labels',
    archetype: 'station',
    workbenchBranch: null,
    permission: 'shipping.view',
    pageKey: 'outbound',
    modeKey: 'labels',
    scan: null,
    // Engine node type (src/lib/workflow/nodes/ship.node.ts) — the ship-out step.
    // Was the synthetic 'fulfillment'; pack + outbound now bind to distinct
    // engine nodes (`pack` vs `ship`) so both station drafts seed.
    workflowNodeType: 'ship',
    // Key stays `outbound` for composition stability; URL graduated to `/shipping`.
    legacy: { pathname: '/outbound', bareResolves: true },
  },
  // Support — the helpdesk/ticket console. **Workbench, branch
  // `service-workspace`** (ratified 2026-08-01, `docs/todo/
  // support-service-workspace-PLAN.md`): an agent workspace composed
  // list | thread + composer | context, on Workbench pick+persist physics —
  // durable URL ticket selection, CRUD (reply / assign / resolve), density
  // `ops`, pointer-driven.
  //
  // It read `archetype: 'station'` until 2026-08-01. That was a CATEGORY ERROR,
  // not a nuance: `scan` was already `null`, so nothing about the surface was
  // scanner-driven, and Q1 of the `pickArchetype` discriminator — the only
  // question that returns Station — never applied. What the row actually
  // recorded was the nav promotion (More → Stations); a spine SECTION is a
  // domain, and a domain is not a region contract.
  //
  // The branch is a Layer C composition on Workbench, NOT a fifth archetype:
  // `ARCHETYPE_IDS` stays four (`archetype.ts`). Branch law:
  // `.claude/rules/display/workbench-service.md`.
  //
  // Desktop console (mobile-restricted), no `workflowNodeType` (Support isn't
  // an engine step). Gated by `integrations.zendesk` — same as the
  // /api/zendesk/* routes it calls.
  support: {
    key: 'support',
    // An agent workspace — pointer-driven, never scanner-driven.
    session: { kind: 'task' },
    label: 'Support',
    route: '/support',
    archetype: 'workbench',
    workbenchBranch: 'service-workspace',
    permission: 'integrations.zendesk',
    pageKey: 'support',
    modeKey: 'tickets',
    scan: null,
    // `/support` is already the canonical URL — no legacy alias to redirect from.
  },
};

/** Type guard: is an arbitrary string a known surface key? */
export function isSurfaceKey(value: string | null | undefined): value is SurfaceKey {
  return value != null && (SURFACE_KEYS as readonly string[]).includes(value);
}

/** Lookup a surface's capability definition by key. */
export function getSurface(key: SurfaceKey): SurfaceDefinition {
  return SURFACE_REGISTRY[key];
}

/** All registered surfaces (registry order). */
export function listSurfaces(): SurfaceDefinition[] {
  return SURFACE_KEYS.map((k) => SURFACE_REGISTRY[k]);
}

/**
 * Resolve a surface from a semantic route pathname (exact or `${route}/…`).
 * Returns null for a path that isn't a surface route. Longest route wins so a
 * nested surface (`/receiving/history`) beats a shorter prefix.
 */
export function surfaceForRoute(pathname: string | null | undefined): SurfaceDefinition | null {
  if (!pathname) return null;
  let best: SurfaceDefinition | null = null;
  for (const def of listSurfaces()) {
    if (pathname === def.route || pathname.startsWith(`${def.route}/`)) {
      if (!best || def.route.length > best.route.length) best = def;
    }
  }
  return best;
}
