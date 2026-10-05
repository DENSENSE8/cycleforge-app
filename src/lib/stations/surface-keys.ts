/** Operator-surface registry (Studio-driven operator surfaces, Phase 0). */

import type { ArchetypeId } from './archetype';

/** Workbench Layer C recipe / branch ids. */
export const WORKBENCH_BRANCH_IDS = [
  'ops-queue',
  'master-detail',
  'board',
  'fact-stack',
] as const;

export type WorkbenchBranchId = (typeof WORKBENCH_BRANCH_IDS)[number];

export function isWorkbenchBranchId(
  value: string | null | undefined,
): value is WorkbenchBranchId {
  return value != null && (WORKBENCH_BRANCH_IDS as readonly string[]).includes(value);
}

/** Every operator surface the app knows about. */
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
type SurfaceParamDelta = Record<string, string | null>;

/** How today's app still renders this surface — the source the migration alias redirects *from*. */
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
  /** Scan policy: which focus-locked scan classifier this Station surface owns. */
  scan: 'unbox' | 'triage' | 'pickup' | null;
  /** Default `?view=`/sub-view for the surface, if it has one. */
  defaultView?: string;
  /** Workflow node type this surface binds to (Studio node → surface binding). */
  workflowNodeType?: string;
  /** Where today's app still serves this surface (drives the legacy alias layer). */
  legacy?: SurfaceLegacyLocation;
}

/** The closed registry. */
export const SURFACE_REGISTRY: Record<SurfaceKey, SurfaceDefinition> = {
  unbox: {
    key: 'unbox',
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
  // Local Pickup — a Receiving MODE with its own graduated route, exactly like Unbox/Triage/Incoming.
  pickup: {
    key: 'pickup',
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
  // Repair intake — the sibling Receiving mode.
  repair: {
    key: 'repair',
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
    label: 'Quality Control',
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
    // The Picker desk that shared `/test` moved to `/pick` (owner 2026-09-27).
    legacy: { pathname: '/tech', bareResolves: true },
  },
  outbound: {
    key: 'outbound',
    label: 'FBM',
    route: '/shipping',
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
