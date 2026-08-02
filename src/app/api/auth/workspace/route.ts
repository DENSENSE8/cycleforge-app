/**
 * GET /api/auth/workspace  (PUBLIC)
 *
 * Resolves the tenant for the current host and returns ONLY its display name +
 * slug — never staff, never any sensitive column. Also advertises which login
 * buttons /signin should render:
 *   - `platformProviders`: configured social logins (google / microsoft)
 *   - `sso`: the tenant's enterprise SSO button (only when a workspace is
 *            resolved, it has an active provider, AND the `sso` entitlement)
 *
 * Apex / unknown slug (fail-closed nil org) → `{ resolved: false }` (still lists
 * platform providers, which are host-independent).
 *
 * Failure class: **PARTIAL.** `resolved: false` is a legitimate state (apex
 * host), so an unexpected throw must not borrow it silently — that is the
 * `staff-picker` outage in a second costume. But unlike the picker this payload
 * has a genuinely useful half: `platformProviders` is env-derived, so social
 * sign-in still works while the DB is down. So the throw keeps **200** (to
 * preserve that half) and adds `degraded: true` + `error`; a caller that needs
 * to distinguish "no workspace here" from "we could not look it up" branches on
 * the flag, not on `resolved`.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';
import { configuredPlatformProviders } from '@/lib/auth/platform-oauth';
import { hasFeature } from '@/lib/billing/entitlements';
import { parseOrgSettings } from '@/lib/tenancy/settings';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

async function resolveSso(orgId: string): Promise<{ label: string; slug: string } | null> {
  try {
    if (!(await hasFeature(orgId, 'sso'))) return null;
    const r = await pool.query<{ button_label: string; slug: string }>(
      `SELECT p.button_label, o.slug
         FROM organization_sso_providers p
         JOIN organizations o ON o.id = p.organization_id
        WHERE p.organization_id = $1 AND p.status = 'active'
        ORDER BY p.created_at ASC
        LIMIT 1`,
      [orgId],
    );
    const row = r.rows[0];
    return row ? { label: row.button_label, slug: row.slug } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const platformProviders = configuredPlatformProviders();
  const orgId = await resolveOrgIdFromRequest(req);
  if (orgId === NIL_ORG_ID) {
    return NextResponse.json({ resolved: false, platformProviders }, { headers: NO_STORE });
  }
  try {
    const r = await pool.query<{ name: string; slug: string; settings: unknown }>(
      `SELECT name, slug, settings FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [orgId],
    );
    const row = r.rows[0];
    if (!row) {
      return NextResponse.json({ resolved: false, platformProviders }, { headers: NO_STORE });
    }
    const sso = await resolveSso(orgId);
    const emailFirstSignin = parseOrgSettings(row.settings).emailFirstSignin;
    return NextResponse.json(
      { resolved: true, name: row.name, slug: row.slug, platformProviders, sso, emailFirstSignin },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[/api/auth/workspace] error:', err);
    // `degraded` is what separates this from the apex `resolved: false` above.
    return NextResponse.json(
      {
        resolved: false,
        platformProviders,
        degraded: true,
        error: 'workspace_lookup_unavailable',
      },
      { headers: NO_STORE },
    );
  }
}
