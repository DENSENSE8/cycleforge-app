import { createCrudHandler } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { withAuth } from '@/lib/auth/withAuth';
import { searchAllEntities, type GlobalSearchResult } from '@/lib/search/global-entity-search';
import { parseSearchByScope } from '@/lib/search/search-by';

/**
 * Global search across orders, repairs, FBA shipments, and receiving.
 * Used by the CommandBar (Cmd+K) for cross-entity lookup.
 *
 * GET /api/global-search?q=<query>&limit=20
 *
 * Built with createCrudHandler — demonstrates the unified CRUD pattern
 * for a read-only search endpoint.
 *
 * The per-entity searchers were extracted verbatim to
 * src/lib/search/global-entity-search.ts (AI search Phase 0) so the hybrid
 * engine's exact-ID/serial bypass reuses them; this route's behavior is
 * unchanged.
 */

/**
 * Build the CRUD handler bound to a single tenant. Constructed per-request so
 * the org id from the verified session is threaded into every search helper,
 * and so the Upstash cache namespace is partitioned by org (a shared namespace
 * would serve one tenant's results to another).
 */
function buildHandler(orgId: OrgId) {
  return createCrudHandler<GlobalSearchResult>({
    name: 'global-search',
    cacheNamespace: `api:global-search:v3:${orgId}`,
    cacheTTL: 60,
    cacheTags: ['global-search', 'orders', 'repair-service', 'fba', 'receiving-logs', 'sku-catalog'],

    list: async (params) => {
      if (!params.search) {
        return { rows: [] };
      }
      const rawAxis = params.searchParams.get('axis');
      const axis = rawAxis ? parseSearchByScope(rawAxis) : undefined;
      const rows = await searchAllEntities(orgId, params.search, params.limit, axis);
      return { rows, total: rows.length };
    },

    search: async (query, params) => {
      const rawAxis = params.searchParams.get('axis');
      const axis = rawAxis ? parseSearchByScope(rawAxis) : undefined;
      return searchAllEntities(orgId, query, params.limit, axis);
    },
  });
}

// Cross-domain search used by the Cmd+K bar — require an authenticated session
// (any staff role). Was previously exported bare (unauthenticated + invisible
// to the route-permission audit). The handler is built per-request bound to the
// caller's org so every entity query is tenant-scoped.
export const GET = withAuth(async (req, ctx) => {
  const startedAt = Date.now();
  const res = await buildHandler(ctx.organizationId).GET(req);
  // #region agent log
  fetch('http://127.0.0.1:7905/ingest/963a9b6c-b9e1-4ea4-8873-db315c94d962',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05d676'},body:JSON.stringify({sessionId:'05d676',hypothesisId:'B',location:'global-search/route.ts:GET',message:'global-search GET finished',data:{ms:Date.now()-startedAt,status:res.status,cache:res.headers.get('x-cache'),url:req.nextUrl.search},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return res;
});
