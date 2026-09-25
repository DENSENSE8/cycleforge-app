import { queryOptions } from '@tanstack/react-query';
import type { PlatformTypeRule } from '@/lib/receiving/platform-type-rules';
import type {
  PlatformRow,
  PlatformAccountRow,
  PriorityTierRow,
  TypeRow,
} from '@/lib/neon/catalog-queries';
import type { StoreLinkRow } from '@/lib/catalog/integration-store-links';
import type { ShipStationV1Store } from '@/lib/shipping/shipstation/orders-v1';

/** One bindable workflow-graph node (from /api/catalog/workflow-nodes). */
export interface WorkflowNodeOption {
  id: string;
  type: string;
  label: string;
  definitionId: number;
  definitionName: string | null;
}

/**
 * React Query factory for the org platform / type catalog. Keys + queryOptions
 * live here (the house pattern, see cron-runs-queries.ts); the `useCatalog`
 * hooks wrap these and layer the built-in fallback.
 */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const catalogKeys = {
  all: ['catalog'] as const,
  platforms: (includeInactive = false) => ['catalog', 'platforms', includeInactive] as const,
  types: (includeInactive = false) => ['catalog', 'types', includeInactive] as const,
  accounts: (includeInactive = false, platformId?: number) =>
    ['catalog', 'platform-accounts', includeInactive, platformId ?? null] as const,
  workflowNodes: () => ['catalog', 'workflow-nodes'] as const,
  priorities: () => ['catalog', 'priorities'] as const,
  platformTypeRules: () => ['catalog', 'platform-type-rules'] as const,
  storeLinks: () => ['catalog', 'store-links'] as const,
  shipstationStores: () => ['catalog', 'shipstation-stores'] as const,
};

/**
 * The org's priority-ladder overrides. No `includeInactive` twin: a rung cannot
 * be deactivated (see the priority_tiers migration), so there is only one view
 * of this catalog. An empty array is the normal, healthy answer — it means no
 * rung has been renamed or repainted, and the caller falls back to the built-in
 * PRIORITY_OVERRIDE_TIERS.
 */
export function prioritiesQuery() {
  return queryOptions({
    queryKey: catalogKeys.priorities(),
    queryFn: () =>
      fetchJson<{ success: boolean; priorities: PriorityTierRow[] }>('/api/catalog/priorities'),
    staleTime: 5 * 60_000,
    select: (d) => d.priorities ?? [],
  });
}

/**
 * The org's platform → receiving-type dependency matrix. One subscription feeds
 * every classify pill, so the narrowing is the same on Unbox, Triage, Testing
 * and the search/support panes.
 */
export function platformTypeRulesQuery() {
  return queryOptions({
    queryKey: catalogKeys.platformTypeRules(),
    queryFn: () =>
      fetchJson<{ success: boolean; rules: PlatformTypeRule[] }>(
        '/api/catalog/platform-type-rules',
      ),
    staleTime: 5 * 60_000,
    select: (d) => d.rules ?? [],
  });
}

export function platformsQuery(opts: { includeInactive?: boolean } = {}) {
  const inc = opts.includeInactive ?? false;
  return queryOptions({
    queryKey: catalogKeys.platforms(inc),
    queryFn: () =>
      fetchJson<{ success: boolean; platforms: PlatformRow[] }>(
        `/api/catalog/platforms${inc ? '?includeInactive=true' : ''}`,
      ),
    staleTime: 5 * 60_000,
    select: (d) => d.platforms ?? [],
  });
}

export function typesQuery(opts: { includeInactive?: boolean } = {}) {
  const inc = opts.includeInactive ?? false;
  return queryOptions({
    queryKey: catalogKeys.types(inc),
    queryFn: () =>
      fetchJson<{ success: boolean; types: TypeRow[] }>(
        `/api/catalog/types${inc ? '?includeInactive=true' : ''}`,
      ),
    staleTime: 5 * 60_000,
    select: (d) => d.types ?? [],
  });
}

export function platformAccountsQuery(opts: { includeInactive?: boolean; platformId?: number } = {}) {
  const inc = opts.includeInactive ?? false;
  const params = new URLSearchParams();
  if (inc) params.set('includeInactive', 'true');
  if (opts.platformId) params.set('platformId', String(opts.platformId));
  const qs = params.toString();
  return queryOptions({
    queryKey: catalogKeys.accounts(inc, opts.platformId),
    queryFn: () =>
      fetchJson<{ success: boolean; accounts: PlatformAccountRow[] }>(
        `/api/catalog/platform-accounts${qs ? `?${qs}` : ''}`,
      ),
    staleTime: 5 * 60_000,
    select: (d) => d.accounts ?? [],
  });
}

export function workflowNodesQuery() {
  return queryOptions({
    queryKey: catalogKeys.workflowNodes(),
    queryFn: () => fetchJson<{ success: boolean; nodes: WorkflowNodeOption[] }>('/api/catalog/workflow-nodes'),
    staleTime: 5 * 60_000,
    select: (d) => d.nodes ?? [],
  });
}

/** Where each aggregator store sells — `integration_store_links`. */
export function storeLinksQuery() {
  return queryOptions({
    queryKey: catalogKeys.storeLinks(),
    queryFn: () => fetchJson<{ success: boolean; links: StoreLinkRow[] }>('/api/catalog/store-links'),
    staleTime: 5 * 60_000,
    select: (d) => d.links ?? [],
  });
}

/**
 * The org's ShipStation storefronts, live from ShipStation (Settings only).
 * Under the catalog key so a link save refreshes it with the links.
 */
export function shipstationStoresQuery() {
  return queryOptions({
    queryKey: catalogKeys.shipstationStores(),
    queryFn: () =>
      fetchJson<{ success: boolean; connected: boolean; stores: ShipStationV1Store[] }>(
        '/api/integrations/shipstation/stores',
      ),
    staleTime: 60_000,
  });
}
