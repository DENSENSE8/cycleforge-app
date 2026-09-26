/** Zoho tenant context. */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { OrgId } from '@/lib/tenancy/constants';

const zohoOrgStore = new AsyncLocalStorage<OrgId>();

/** Bind the Zoho tenant org for every Zoho client call made inside `fn`. */
export function withZohoOrg<T>(orgId: OrgId, fn: () => Promise<T>): Promise<T> {
  return zohoOrgStore.run(orgId, fn);
}

/**
 * The tenant org for the current Zoho call. Read this only at the synchronous
 * client entry points (see the queue-boundary note above). Fails closed: an
 * unbound read throws instead of silently resolving USAV's credentials.
 */
export function currentZohoOrgId(): OrgId {
  const orgId = zohoOrgStore.getStore();
  if (!orgId) {
    throw new Error('zoho org context unbound — wrap the call in withZohoOrg(orgId, …)');
  }
  return orgId;
}

/**
 * Whether a tenant org is bound for the current async context. Only for the
 * ZOHO_ORG_TRANSITIONAL shims that bridge callers which cannot bind yet —
 * regular code should bind with `withZohoOrg` and never need to ask.
 */
function hasZohoOrgBinding(): boolean {
  return zohoOrgStore.getStore() != null;
}
