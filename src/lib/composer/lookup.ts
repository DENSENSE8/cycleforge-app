/**
 * Composer lookup — orders via the existing identifier / global-search path,
 * actions via the local catalog. Injectable fetch so unit tests stay DB-free.
 */

import { resolveSearchOrder } from '@/lib/search/resolve-search-order';
import { getOrderPlatformLabel } from '@/utils/order-platform';
import { filterComposerActions } from './actions';
import type { ComposerEntityChip, ComposerEntityType } from './document';
import type { PatternRoute } from './pattern-router';
import { shouldAutoCommit } from './auto-commit';

export interface ComposerHit {
  readonly id: string;
  readonly entityType: ComposerEntityType;
  readonly label: string;
  readonly subtitle: string;
  readonly platform?: string | null;
  readonly payload: unknown;
}

export interface ComposerLookupDeps {
  fetch: typeof fetch;
  resolveOrder: typeof resolveSearchOrder;
}

const defaultDeps: ComposerLookupDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  resolveOrder: resolveSearchOrder,
};

interface GlobalSearchRow {
  id: number;
  entityType: string;
  title: string;
  subtitle: string;
  href: string;
  facets?: { order_id?: string | null; source_platform?: string | null };
}

function orderHitFromResolved(order: {
  id: number;
  order_id: string;
  product_title: string;
  account_source?: string | null;
}): ComposerHit {
  const platform = getOrderPlatformLabel(order.order_id, order.account_source ?? null);
  return {
    id: String(order.id),
    entityType: 'order',
    label: order.order_id,
    subtitle: order.product_title,
    platform: platform || null,
    payload: order,
  };
}

export function hitToChip(hit: ComposerHit): ComposerEntityChip {
  return {
    type: 'entity_chip',
    entityType: hit.entityType,
    id: hit.id,
    label: hit.label,
    platform: hit.platform,
    payload: hit.payload,
  };
}

export async function searchComposerHits(
  route: PatternRoute,
  deps: ComposerLookupDeps = defaultDeps,
): Promise<ComposerHit[]> {
  if (!route.token) return [];

  if (route.source === 'actions') {
    return filterComposerActions(route.token).map((a) => ({
      id: a.id,
      entityType: 'action' as const,
      label: a.label,
      subtitle: a.subtitle,
      platform: null,
      payload: a,
    }));
  }

  if (route.source === 'users') return [];

  if (route.complete) {
    const resolved = await deps.resolveOrder(route.token);
    if (resolved.status === 'ok') return [orderHitFromResolved(resolved.order)];
    return [];
  }

  const res = await deps.fetch(
    `/api/global-search?q=${encodeURIComponent(route.token)}&limit=8`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { rows?: GlobalSearchRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  return rows
    .filter((r) => r.entityType === 'order')
    .map((r) => ({
      id: String(r.id),
      entityType: 'order' as const,
      label: r.facets?.order_id || r.title,
      subtitle: r.subtitle,
      platform: r.facets?.source_platform ?? null,
      payload: r,
    }));
}

export async function resolveAutoCommitHit(
  route: PatternRoute,
  deps: ComposerLookupDeps = defaultDeps,
): Promise<ComposerHit | null> {
  const hits = await searchComposerHits(route, deps);
  if (!shouldAutoCommit(route, hits.length)) return null;
  return hits[0] ?? null;
}
