/** Server-only Square helpers that are tenant-aware via Nango. */

import 'server-only';
import { buildSquareConfig, getSquareConfig, squareFetch, type SquareConfig, type SquareError } from './client';
import { getNangoAccessToken } from '@/lib/integrations/nango';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Resolve a SquareConfig for a tenant. Prefers a Nango-managed token when the
 * org has connected Square through Nango; falls back to env config otherwise.
 */
export async function resolveSquareConfig(orgId?: OrgId): Promise<SquareConfig> {
  if (orgId) {
    const token = await getNangoAccessToken(orgId, 'square');
    if (token) return buildSquareConfig(token);
  }
  return getSquareConfig();
}

/**
 * Tenant-aware squareFetch. Resolves the config (Nango or env) for the org,
 * then delegates to the existing squareFetch transport.
 */
export async function squareFetchForOrg<T = Record<string, unknown>>(
  orgId: OrgId | undefined,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T; errors?: SquareError[] }> {
  const config = await resolveSquareConfig(orgId);
  return squareFetch<T>(path, { ...options, config });
}
