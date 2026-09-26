/** Cached, server-side read layer for the org platform / type catalog (migration 2026-06-13g + 2026-06-14f). */

import {
  listPlatforms,
  listPlatformAccounts,
  listPlatformTypeRules,
  listTypes,
  type PlatformAccountRow,
  type PlatformRow,
  type TypeRow,
} from '@/lib/neon/catalog-queries';
import type { PlatformTypeRule } from '@/lib/receiving/platform-type-rules';
import { getOrSet, invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const REDIS_TTL_S = 300;

const platformCache = new Map<string, CacheEntry<PlatformRow[]>>();
const typeCache = new Map<string, CacheEntry<TypeRow[]>>();
const accountCache = new Map<string, CacheEntry<PlatformAccountRow[]>>();

// Two-tier: L1 per-instance Map (existing 5-min TTL) in front of an L2 shared Redis cache (via getOrSet) so a cold instance offloads to…

/** Active platforms for the org (sorted), cached 5 min. */
export async function getOrgPlatforms(orgId: string): Promise<PlatformRow[]> {
  const hit = platformCache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const rows = await getOrSet(CACHE_NS.catalog, orgId, 'platforms', REDIS_TTL_S, [CACHE_TAGS.catalog], () =>
    listPlatforms(orgId),
  );
  platformCache.set(orgId, { value: rows, expiresAt: Date.now() + CACHE_TTL_MS });
  return rows;
}

/** Active receiving/flow types for the org (sorted), cached 5 min. */
export async function getOrgTypes(orgId: string): Promise<TypeRow[]> {
  const hit = typeCache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const rows = await getOrSet(CACHE_NS.catalog, orgId, 'types', REDIS_TTL_S, [CACHE_TAGS.catalog], () =>
    listTypes(orgId),
  );
  typeCache.set(orgId, { value: rows, expiresAt: Date.now() + CACHE_TTL_MS });
  return rows;
}

/** The org's platform → receiving-type dependency matrix. */
export async function getOrgPlatformTypeRules(orgId: string): Promise<PlatformTypeRule[]> {
  return listPlatformTypeRules(orgId);
}

/** Active storefront accounts for the org, cached 5 min. */
export async function getOrgPlatformAccounts(orgId: string): Promise<PlatformAccountRow[]> {
  const hit = accountCache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const rows = await getOrSet(CACHE_NS.catalog, orgId, 'accounts', REDIS_TTL_S, [CACHE_TAGS.catalog], () =>
    listPlatformAccounts(orgId),
  );
  accountCache.set(orgId, { value: rows, expiresAt: Date.now() + CACHE_TTL_MS });
  return rows;
}

/** A flow type joined to its bound account → platform → integration. */
export interface ResolvedType {
  type: TypeRow;
  account: PlatformAccountRow | null;
  platform: PlatformRow | null;
  /** organization_integrations.provider reachable via the platform (null = display-only). */
  provider: string | null;
  /** organization_integrations.scope reachable via the bound account. */
  integrationScope: string | null;
  /** workflow_nodes.id this type drives (null = no custom flow). */
  workflowNodeId: string | null;
}

/**
 * Resolve a `type_id` to its full chain: flow → account → platform → integration
 * → workflow. From a single id on a receiving/order row this reaches everything
 * the plan's linkage diagram promises. Returns null if the id isn't this org's.
 */
export async function resolveType(orgId: string, typeId: number): Promise<ResolvedType | null> {
  const [types, accounts, platforms] = await Promise.all([
    getOrgTypes(orgId),
    getOrgPlatformAccounts(orgId),
    getOrgPlatforms(orgId),
  ]);
  const type = types.find((t) => t.id === typeId);
  if (!type) return null;
  const account = type.platform_account_id
    ? accounts.find((a) => a.id === type.platform_account_id) ?? null
    : null;
  const platform = account ? platforms.find((p) => p.id === account.platform_id) ?? null : null;
  return {
    type,
    account,
    platform,
    provider: platform?.provider ?? null,
    integrationScope: account?.integration_scope ?? null,
    workflowNodeId: type.workflow_node_id,
  };
}

/** Resolve the carton's effective receiving flow to a `type_id` for dual-write. */
export async function resolveReceivingTypeId(
  orgId: string,
  input: { intakeType?: string | null; isReturn?: boolean | null },
): Promise<number | null> {
  const slug = receivingTypeSlug(input);
  if (!slug) return null;
  const types = await getOrgTypes(orgId);
  return types.find((t) => t.slug.toLowerCase() === slug)?.id ?? null;
}

/** Pure intake_type/is_return → type slug mapping (shared with the backfill). */
export function receivingTypeSlug(input: { intakeType?: string | null; isReturn?: boolean | null }): string | null {
  const it = String(input.intakeType ?? '').trim().toLowerCase();
  if (it) return it; // 'po' | 'return' | 'trade_in' | 'pickup' | custom slug
  if (input.isReturn) return 'return';
  return 'po'; // default carton flow when no explicit type is set
}

/** A resolved order channel: which platform an `account_source` value belongs to. */
export interface ResolvedChannel {
  platform: PlatformRow | null;
  account: PlatformAccountRow | null;
  /** Canonical label to show (platform label wins; account label as a fallback). */
  label: string | null;
}

/** Resolve `orders.account_source` (hybrid grain: */
export async function resolveOrderChannel(orgId: string, accountSource: string | null | undefined): Promise<ResolvedChannel> {
  const key = String(accountSource ?? '').trim().toLowerCase();
  if (!key) return { platform: null, account: null, label: null };
  const [accounts, platforms] = await Promise.all([getOrgPlatformAccounts(orgId), getOrgPlatforms(orgId)]);
  // account-grain first (eBay account names), then platform-grain.
  const account = accounts.find((a) => a.slug.toLowerCase() === key) ?? null;
  const platform = account
    ? platforms.find((p) => p.id === account.platform_id) ?? null
    : platforms.find((p) => p.slug.toLowerCase() === key) ?? null;
  return { platform, account, label: platform?.label ?? account?.label ?? null };
}

/** Drop cached lists for one org (or all when omitted). Call on any CRUD write.
 *  Clears the L1 Map (this instance) and fires an org-scoped L2 Redis bust so a
 *  cold instance rebuilds fresh; other instances' L1 clears on their own TTL. */
export function invalidateCatalogCache(orgId?: string): void {
  if (!orgId) {
    platformCache.clear();
    typeCache.clear();
    accountCache.clear();
    return;
  }
  platformCache.delete(orgId);
  typeCache.delete(orgId);
  accountCache.delete(orgId);
  // Fire-and-forget the L2 clear (this is a sync API; never block a write on it).
  void invalidateCacheTags(orgId, [CACHE_TAGS.catalog]);
}
