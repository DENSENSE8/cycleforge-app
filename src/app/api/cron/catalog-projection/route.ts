/** Cron: refresh each connected org's local catalog projection. */

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
