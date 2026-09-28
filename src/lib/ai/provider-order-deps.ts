import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getOrSet, invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { resolveAiProviderOrder, type AiProviderOrder } from './provider-order';

/** Cache namespace + tag for the stored per-org preference (`organizations.settings.ai.providerOrder`). */
const NAMESPACE = 'ai_provider_order';
const TAG = 'ai_provider_order';
const REDIS_TTL_S = 300;
/** In-process memo in front of Redis: every AI call reads this, a settings change is rare. */
const LOCAL_TTL_MS = 30_000;

async function loadOrgOrder(orgId: OrgId): Promise<string | null> {
  const { rows } = await tenantQuery<{ settings: unknown }>(
    orgId,
    `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
    [orgId],
  );
  const settings =
    rows[0]?.settings && typeof rows[0].settings === 'object' ? (rows[0].settings as Record<string, unknown>) : {};
  const ai = settings.ai && typeof settings.ai === 'object' ? (settings.ai as Record<string, unknown>) : {};
  return typeof ai.providerOrder === 'string' ? ai.providerOrder : null;
}

export interface ProviderOrderResolverDeps {
  /** The stored preference, straight from the DB. */
  load: (orgId: OrgId) => Promise<string | null>;
  /** Shared read-through cache (`getOrSet` from upstash-cache in production). */
  getOrSet: typeof getOrSet;
  /** Drop this org's shared cache entries (`invalidateCacheTags`). */
  invalidate: (orgId: OrgId, tags: string[]) => Promise<void>;
  now: () => number;
}

export interface ProviderOrderResolver {
  resolve: (orgId: OrgId) => Promise<AiProviderOrder>;
  invalidate: (orgId: OrgId) => Promise<void>;
}

/** Build the memoized resolver over injectable storage (tests pass fakes; the app uses the default below). */
export function createProviderOrderResolver(deps: ProviderOrderResolverDeps): ProviderOrderResolver {
  const local = new Map<string, { value: string | null; until: number }>();
  return {
    async resolve(orgId) {
      const envOrder = process.env.AI_PROVIDER_ORDER;
      const production = process.env.NODE_ENV === 'production';
      let orgOrder: string | null = null;
      const memo = local.get(orgId);
      if (memo && memo.until > deps.now()) {
        orgOrder = memo.value;
      } else {
        try {
          // `{ order }` wrapper: getOrSet treats a cached null as a miss.
          const cached = await deps.getOrSet(NAMESPACE, orgId, 'v1', REDIS_TTL_S, [TAG], async () => ({
            order: await deps.load(orgId),
          }));
          orgOrder = cached.order;
          local.set(orgId, { value: orgOrder, until: deps.now() + LOCAL_TTL_MS });
        } catch {
          orgOrder = null;
        }
      }
      return resolveAiProviderOrder({ orgOrder, envOrder, production });
    },
    async invalidate(orgId) {
      local.delete(orgId);
      await deps.invalidate(orgId, [TAG]);
    },
  };
}

const resolver = createProviderOrderResolver({
  load: loadOrgOrder,
  getOrSet,
  invalidate: invalidateCacheTags,
  now: Date.now,
});

/** Read this org's AI provider order preference (memoized in process, then Redis, then the DB). */
export function resolveAiProviderOrderForOrg(orgId: OrgId): Promise<AiProviderOrder> {
  return resolver.resolve(orgId);
}

/** Call after writing `settings.ai.providerOrder`; other instances converge within the local memo TTL. */
export function invalidateAiProviderOrder(orgId: OrgId): Promise<void> {
  return resolver.invalidate(orgId);
}
