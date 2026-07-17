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
   * Scan policy: which focus-locked scan classifier this Station surface owns.
   * `null` = not a scan surface (Workbench/Monitor). Consumed by the
   * surface-aware scan classifier (Phase 3a).
   */
  scan: 'unbox' | 'triage' | null;
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
    label: 'Unbox',
    route: '/unbox',
    archetype: 'station',
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
    label: 'Receiving',
    route: '/triage',
    archetype: 'station',
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
    label: 'Incoming',
    route: '/incoming',
    archetype: 'workbench',
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
  // mode rail.) Sales lives on the `/walk-in` Sales page, not here.
  pickup: {
    key: 'pickup',
    label: 'Local Pickup',
    route: '/pickup',
    archetype: 'workbench',
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'pickup',
    scan: null,
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'pickup' } },
  },
  // Repair intake — the sibling Receiving mode. `/repair` is now a first-class
  // surface route (it used to redirect to `/pickup?job=repair`, the job-switcher
  // model that this refactor drops). Gated by `receiving.view` like the rest of
  // the rail; `repair.*` still gates the repair APIs.
  repair: {
    key: 'repair',
    label: 'Repair',
    route: '/repair',
    archetype: 'workbench',
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
    label: 'Receiving History',
    route: '/receiving/history',
    archetype: 'monitor',
    permission: 'receiving.view',
    pageKey: 'receiving',
    modeKey: 'history',
    scan: null,
    workflowNodeType: 'receiving',
    legacy: { pathname: '/receiving', params: { mode: 'history' } },
  },
  pack: {
    key: 'pack',
    label: 'Packing',
    route: '/pack',
    archetype: 'station',
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
    label: 'Testing',
    route: '/test',
    archetype: 'station',
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
    label: 'Shipping',
    route: '/outbound',
    archetype: 'station',
    permission: 'shipping.view',
    pageKey: 'outbound',
    modeKey: 'labels',
    scan: null,
    // Engine node type (src/lib/workflow/nodes/ship.node.ts) — the ship-out step.
    // Was the synthetic 'fulfillment'; pack + outbound now bind to distinct
    // engine nodes (`pack` vs `ship`) so both station drafts seed.
    workflowNodeType: 'ship',
    legacy: { pathname: '/outbound', bareResolves: true },
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
