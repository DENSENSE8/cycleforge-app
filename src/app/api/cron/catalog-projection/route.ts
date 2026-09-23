/**
 * Cron: refresh each connected org's local catalog projection.
 *
 * GET /api/cron/catalog-projection?maxOrgs=10
 *
 * The projection is what lets the counter total a mixed cart offline. Readers
 * fall back to the live vendor walk when nothing is projected, so a missed run
 * degrades to "slow" rather than "broken" — but the whole point of the projection
 * is that the slow path is never on a customer-facing form, so this is what keeps
 * it off.
 *
 * Cadence is deliberately low (hourly): a storefront's prices and category tree
 * change on human timescales, the walk is expensive, and the staleness contract
 * already says the provider — not this mirror — is authoritative for money.
 *
 * Only orgs that actually have a catalog provider connected are visited;
 * `projectEcwidCatalog` returns a soft error for the rest rather than throwing,
 * so one unconnected tenant never fails the run for the others.
 *
 * Auth: CRON_SECRET bearer — the same gate as the other
 * /api/cron routes, which are session-less by design.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { projectEcwidCatalog } from '@/lib/ecwid-square/sync';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Orgs with an Ecwid connection in the credential vault.
 *
 * Cross-org read on the owner pool — the same posture as every other cron drain.
 * The per-org work below is org-scoped.
 */
async function listOrgsWithCatalogProvider(limit: number): Promise<OrgId[]> {
  const res = await pool.query(
    `SELECT DISTINCT organization_id
       FROM organization_integrations
      WHERE provider = 'ecwid'
      ORDER BY organization_id
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((r: { organization_id: string }) => r.organization_id as OrgId);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const maxOrgs = clampInt(req.nextUrl.searchParams.get('maxOrgs'), 10, 1, 50);
  const results: Array<Record<string, unknown>> = [];

  try {
    const locked = await withCronLock('catalog-projection', () =>
      withCronRun('catalog-projection', async () => {
        const orgs = await listOrgsWithCatalogProvider(maxOrgs);
        for (const orgId of orgs) {
          const r = await projectEcwidCatalog(orgId);
          results.push({
            orgId: r.orgId,
            ok: r.ok,
            listings: r.listingsUpserted,
            categories: r.categoriesUpserted,
            deactivated: r.listingsDeactivated + r.categoriesDeactivated,
            fetchMs: r.fetchMs,
            writeMs: r.writeMs,
            ...(r.error ? { error: r.error } : {}),
          });
        }
        return { orgs: results.length, results };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'projection run failed',
        results,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, orgs: results.length, results });
}
