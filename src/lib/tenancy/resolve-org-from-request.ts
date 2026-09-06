/**
 * Shared request → org resolver for the auth surfaces.
 *
 * Replaces the per-route `resolveOrgId` helpers that each defaulted the apex /
 * no-slug host to `DOGFOOD_ORG_ID` — that default leaked org #1 (the USAV dogfood
 * tenant) to the public internet via the staff picker and unscoped PIN sign-in.
 *
 * Fail-closed contract:
 *   - `x-tenant-slug` present + resolves    → that org's UUID
 *   - `x-tenant-slug` present + unknown slug → NIL_ORG_ID (empty result set)
 *   - no `x-tenant-slug` (apex host)         → NIL_ORG_ID, UNLESS the operator
 *     opts into a single dogfood tenant on the apex host via
 *     `DEFAULT_TENANT_SLUG` (a DNS bridge for the dogfood cutover only)
 *
 * NEVER default to DOGFOOD_ORG_ID / DOGFOOD_ORG_ID here. A request with no tenant
 * context must resolve to the nil org so downstream queries return nothing,
 * rather than silently binding to the dogfood tenant.
 */

import type { NextRequest } from 'next/server';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { extractTenantSlug } from '@/lib/tenancy/tenant-host';

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

/**
 * Resolve the org for an unauthenticated auth-surface request from its tenant
 * slug header. Fail-closed: apex / unknown → `NIL_ORG_ID`.
 *
 * `DEFAULT_TENANT_SLUG` is the sole escape hatch: when the apex host must still
 * serve one dogfood tenant during the DNS cutover, set it to that slug. It is
 * an explicit opt-in, not a silent USAV fallback.
 */
export async function resolveOrgIdFromRequest(req: NextRequest): Promise<string> {
  const slug = req.headers.get(TENANT_SLUG_HEADER);
  if (slug) return resolveSlug(slug);

  const defaultSlug = (process.env.DEFAULT_TENANT_SLUG ?? '').trim();
  if (defaultSlug) return resolveSlug(defaultSlug);

  return NIL_ORG_ID;
}

/**
 * Resolve the org from the request HOST alone, ignoring `x-tenant-slug`.
 *
 * `resolveOrgIdFromRequest` trusts the header, which is correct for the ordinary
 * pre-auth surfaces: `proxy()` deletes any inbound copy before stamping its own.
 * But a handler invoked without passing through the proxy would inherit a
 * caller-chosen tenant, so anything that decides *authentication* scope — today
 * the pinless-signin gate — resolves from the host instead. Same fail-closed
 * contract: apex, reserved subdomain, localhost, IP, preview/tunnel host, or an
 * unknown slug all yield `NIL_ORG_ID`.
 *
 * `DEFAULT_TENANT_SLUG` is honoured here too, so the documented apex→dogfood DNS
 * bridge keeps working; it is an explicit operator opt-in, not a silent default.
 */
export async function resolveOrgIdFromHost(req: NextRequest): Promise<string> {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const slug = extractTenantSlug(host);
  if (slug) return resolveSlug(slug);

  const defaultSlug = (process.env.DEFAULT_TENANT_SLUG ?? '').trim();
  if (defaultSlug) return resolveSlug(defaultSlug);

  return NIL_ORG_ID;
}
