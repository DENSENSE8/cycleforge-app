/** Shared request → org resolver for the auth surfaces. */

import type { NextRequest } from 'next/server';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';

/**
 * The all-zero UUID. Used as a fail-closed sentinel: no `staff` / tenant row
 * carries it, so any query scoped to `NIL_ORG_ID` returns an empty set.
 */
export const NIL_ORG_ID = '00000000-0000-0000-0000-000000000000' as const;

/** Header set by `proxy.ts` from the request subdomain. */
const TENANT_SLUG_HEADER = 'x-tenant-slug';

async function resolveSlug(slug: string): Promise<string> {
  const org = await getOrganizationBySlug(slug);
  // Unknown slug → nil org (empty set), never another tenant's data.
  return org?.id ?? NIL_ORG_ID;
}

/** Resolve the org for an unauthenticated auth-surface request from its tenant slug header. */
export async function resolveOrgIdFromRequest(req: NextRequest): Promise<string> {
  const slug = req.headers.get(TENANT_SLUG_HEADER);
  if (slug) return resolveSlug(slug);

  const defaultSlug = (process.env.DEFAULT_TENANT_SLUG ?? '').trim();
  if (defaultSlug) return resolveSlug(defaultSlug);

  return NIL_ORG_ID;
}
