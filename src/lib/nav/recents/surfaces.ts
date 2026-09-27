/**
 * Recents surfaces — every "recently opened" list the sidebar can show, and
 * where its rows come from. Pure data, import-free: the nav-context resolver
 * imports it to emit `recents: { endpoint, surface }`, and `/api/nav/recents`
 * dispatches on it.
 *
 * Two sources, one row shape (`NavRecentRow`):
 * - `nav_recents` — the server store that replaces a localStorage-only list
 *   (the localStorage key it supersedes is named per entry). The client POSTs
 *   an open; the writer upserts and trims to `cap`.
 * - `adapter` — the list already lives server-side in another feed; the route
 *   normalises that feed's own domain query (no second store, no writes here).
 */

export type NavRecentSource = 'nav_recents' | 'adapter';

interface NavRecentSurfaceBase {
  id: string;
  /** `GET` returns `{ surface, rows: NavRecentRow[] }`. */
  endpoint: string;
  /** Permission the caller needs to read the surface; `null` = any signed-in staffer. */
  permission: string | null;
}

export interface NavRecentStoreSurface extends NavRecentSurfaceBase {
  source: 'nav_recents';
  /** Rows kept per staffer; the oldest beyond it are trimmed on write. */
  cap: number;
  /** `entity_type` values the surface accepts (validated on POST). */
  entityTypes: readonly string[];
  /** The browser store this surface replaces. */
  replacesLocalStorageKey: string;
}

export interface NavRecentAdapterSurface extends NavRecentSurfaceBase {
  source: 'adapter';
}

export type NavRecentSurface = NavRecentStoreSurface | NavRecentAdapterSurface;

const endpoint = (id: string) => `/api/nav/recents?surface=${id}`;

/** ⌘K result kinds (the search-hit entity vocabulary) plus `page` for Go-to destinations. */
const COMMAND_BAR_ENTITY_TYPES = [
  'order', 'unit', 'receiving', 'sku', 'repair', 'fba', 'warranty', 'ticket', 'location', 'page',
] as const;

export const NAV_RECENT_SURFACES = [
  // ── server feeds (adapters) ────────────────────────────────────────────────
  { id: 'receiving.viewed', source: 'adapter', endpoint: endpoint('receiving.viewed'), permission: 'receiving.view' },
  { id: 'receiving.unbox_opened', source: 'adapter', endpoint: endpoint('receiving.unbox_opened'), permission: 'receiving.view' },
  { id: 'receiving.scanned', source: 'adapter', endpoint: endpoint('receiving.scanned'), permission: 'receiving.view' },
  { id: 'testing.opened', source: 'adapter', endpoint: endpoint('testing.opened'), permission: 'tech.qc_pass' },
  { id: 'tech.scans', source: 'adapter', endpoint: endpoint('tech.scans'), permission: 'tech.view' },
  { id: 'packer.packs', source: 'adapter', endpoint: endpoint('packer.packs'), permission: 'packing.view' },
  { id: 'labels.prints', source: 'adapter', endpoint: endpoint('labels.prints'), permission: 'print.label' },
  { id: 'pickup.orders', source: 'adapter', endpoint: endpoint('pickup.orders'), permission: 'walk_in.view' },
  { id: 'identify.opened', source: 'adapter', endpoint: endpoint('identify.opened'), permission: null },
  // ── nav_recents store (replaces localStorage) ──────────────────────────────
  {
    id: 'support.tickets',
    source: 'nav_recents',
    endpoint: endpoint('support.tickets'),
    permission: 'integrations.zendesk',
    cap: 8,
    entityTypes: ['ticket'],
    replacesLocalStorageKey: 'support:recent-tickets',
  },
  {
    id: 'detail_stacks',
    source: 'nav_recents',
    endpoint: endpoint('detail_stacks'),
    permission: null,
    cap: 8,
    // Only kinds whose re-open URL is derivable from (kind, id): nothing reads
    // openClaimId / openPhotoId / openPlanId / openPoId outside the registry.
    entityTypes: ['order', 'receiving', 'shipment'],
    replacesLocalStorageKey: 'assistant:recent-detail-stacks',
  },
  {
    id: 'audit_log.trace',
    source: 'nav_recents',
    endpoint: endpoint('audit_log.trace'),
    permission: 'operations.view',
    cap: 12,
    entityTypes: ['serial'],
    replacesLocalStorageKey: 'audit-log.trace.recents',
  },
  {
    id: 'labels.lookups',
    source: 'nav_recents',
    endpoint: endpoint('labels.lookups'),
    permission: 'sku_stock.view',
    cap: 10,
    entityTypes: ['unit'],
    replacesLocalStorageKey: 'labels:history-recents:v1',
  },
  {
    id: 'command_bar',
    source: 'nav_recents',
    endpoint: endpoint('command_bar'),
    permission: null,
    cap: 6,
    entityTypes: COMMAND_BAR_ENTITY_TYPES,
    replacesLocalStorageKey: 'command-bar-recent',
  },
] as const satisfies readonly NavRecentSurface[];

export type NavRecentSurfaceId = (typeof NAV_RECENT_SURFACES)[number]['id'];

export const NAV_RECENT_SURFACE_IDS = NAV_RECENT_SURFACES.map((s) => s.id) as readonly NavRecentSurfaceId[];

export function getNavRecentSurface(id: string): NavRecentSurface | null {
  return (NAV_RECENT_SURFACES as readonly NavRecentSurface[]).find((s) => s.id === id) ?? null;
}
