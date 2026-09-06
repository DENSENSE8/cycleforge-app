/**
 * GET /api/auth/sso/start?slug=<tenant>[&persist=1]
 *
 * Kicks off an OIDC PKCE flow for the tenant identified by `slug`.
 * Persists the state row, then 302s the browser to the IdP's authorize
 * endpoint. The callback at /api/auth/sso/callback consumes the state row
 * and creates the session.
 *
 * `persist=1` carries the sign-in page's "Keep me signed in" checkbox across
 * the IdP redirect (stored on the state row, the only thing that survives it),
 * so a federated sign-in honours the box exactly like a password sign-in.
 *
 * Gated by the tenant's `sso` entitlement (enterprise-plan-only by
 * default — see src/lib/billing/plans.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { hasFeature } from '@/lib/billing/entitlements';
import { checkRateLimitAsync } from '@/lib/api-guard';
import {
  buildAuthorizeUrl, generatePkce, generateState, resolveEndpoints,
  type OidcProviderRow,
} from '@/lib/auth/sso-oidc';

function origin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

/**
 * True when `url` is a path that stays on THIS origin once `new URL()` resolves
 * it. Mirrors documents/[id]/content/route.ts, hardened for the escapes the
 * bare `startsWith('/')` check misses: `//evil.com` and `/\evil.com` both parse
 * to an external host, and tab/CR/LF are stripped by the URL parser first, so
 * `/<TAB>/evil.com` collapses into `//evil.com`.
 */
function isSameOriginPath(url: string): boolean {
  if (!url.startsWith('/')) return false;
  const stripped = url.replace(/[\t\r\n]/g, '');
  return stripped.startsWith('/') && !stripped.startsWith('//') && !stripped.startsWith('/\\');
}

interface ProviderDbRow {
  id: number;
  organization_id: string;
  issuer: string;
  client_id: string;
  authorize_url: string | null;
  token_url: string | null;
  userinfo_url: string | null;
  jwks_url: string | null;
  default_role: string;
  auto_provision: boolean;
}

function mapProvider(row: ProviderDbRow): OidcProviderRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    issuer: row.issuer,
    clientId: row.client_id,
    authorizeUrl: row.authorize_url,
    tokenUrl: row.token_url,
    userinfoUrl: row.userinfo_url,
    jwksUrl: row.jwks_url,
    defaultRole: row.default_role,
    autoProvision: row.auto_provision,
  };
}

export const GET = withAuth(async (req) => {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-sso-start',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec }, { status: 429 });
  }

  const slug = req.nextUrl.searchParams.get('slug') || req.headers.get('x-tenant-slug');
  // Validated HERE, at the write, so the callback can never redirect off-origin
  // from a stored `next_path` (the row outlives this request).
  const requestedNext = req.nextUrl.searchParams.get('next');
  const nextPath = requestedNext && isSameOriginPath(requestedNext) ? requestedNext : '/dashboard';
  const persistent = req.nextUrl.searchParams.get('persist') === '1';
  if (!slug) {
    return NextResponse.json({ error: 'TENANT_REQUIRED' }, { status: 400 });
  }

  const org = await getOrganizationBySlug(slug);
  if (!org) {
    return NextResponse.json({ error: 'TENANT_NOT_FOUND' }, { status: 404 });
  }

  // Plan gate: SSO is enterprise-only by default.
  if (!(await hasFeature(org.id, 'sso'))) {
    return NextResponse.json({ error: 'SSO_NOT_AVAILABLE_ON_PLAN', plan: org.plan }, { status: 402 });
  }

  const providerRes = await pool.query<ProviderDbRow>(
    `SELECT id, organization_id, issuer, client_id, authorize_url, token_url,
            userinfo_url, jwks_url, default_role, auto_provision
       FROM organization_sso_providers
      WHERE organization_id = $1 AND status = 'active'
      ORDER BY id ASC LIMIT 1`,
    [org.id],
  );
  const provider = providerRes.rows[0];
  if (!provider) {
    return NextResponse.json({ error: 'SSO_NOT_CONFIGURED' }, { status: 404 });
  }
  const mapped = mapProvider(provider);

  let endpoints;
  try {
    endpoints = await resolveEndpoints(mapped);
  } catch (err) {
    return NextResponse.json(
      { error: 'SSO_DISCOVERY_FAILED', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    );
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();
  await pool.query(
    `INSERT INTO sso_auth_state (state, provider_id, organization_id, code_verifier, next_path, persistent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [state, mapped.id, mapped.organizationId, verifier, nextPath, persistent],
  );

  // Cheap GC of stale state rows older than 10 min — runs on every start.
  await pool.query(`DELETE FROM sso_auth_state WHERE created_at < now() - interval '10 minutes'`);

  const redirectUri = `${origin(req)}/api/auth/sso/callback`;
  const authorizeUrl = buildAuthorizeUrl({
    endpoint: endpoints.authorization_endpoint,
    clientId: mapped.clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  return NextResponse.redirect(authorizeUrl);
}, { allowAnonymous: true });
