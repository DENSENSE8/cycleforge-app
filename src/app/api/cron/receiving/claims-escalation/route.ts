/** GET /api/cron/receiving/claims-escalation (Vercel cron, daily) */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { isReceivingClaimsEscalation } from '@/lib/feature-flags';
import {
  CLAIM_DUE_LEAD_DAYS,
  runClaimsEscalationForOrg,
  type ClaimsEscalationOrgSummary,
} from '@/lib/receiving/claims-escalation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const locked = await withCronLock('receiving_claims_escalation', () =>
      withCronRun('receiving_claims_escalation', () => runSweep({ dryRun })),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed';
    console.error('[GET /api/cron/receiving/claims-escalation] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function runSweep({ dryRun }: { dryRun: boolean }) {
  const startedAt = Date.now();
  // The switch is read HERE, not in the domain module: feature-flags statically
  // imports the Neon pool, and keeping that out of the domain module is what makes
  // it unit-testable. Passed explicitly per call so it is never defaulted.
  const enabled = isReceivingClaimsEscalation();
  // Not forEachActiveOrg: the lane reader (`listDeliveredNotUnboxed`) opens its own
  // tenant connection, so taking one here would just hold a second idle client per
  // org. Per-org isolation is preserved by the try/catch below.
  const orgIds = await listSweepOrgIds();

  const perOrg: ClaimsEscalationOrgSummary[] = [];
  let failedOrgs = 0;
  for (const orgId of orgIds) {
    try {
      perOrg.push(await runClaimsEscalationForOrg(orgId, { dryRun, enabled }));
    } catch (err) {
      failedOrgs += 1;
      console.error(`[claims-escalation] org ${orgId} sweep failed:`, err);
    }
  }

  const totals = perOrg.reduce(
    (acc, o) => ({
      candidates: acc.candidates + o.candidates,
      already_ticketed: acc.already_ticketed + o.alreadyTicketed,
      created: acc.created + o.created,
      clamped: acc.clamped + o.clamped,
      ticket_errors: acc.ticket_errors + o.errors,
    }),
    { candidates: 0, already_ticketed: 0, created: 0, clamped: 0, ticket_errors: 0 },
  );

  // `created` means "would have created" on a report-only run — same field either
  // way so a dry run is directly comparable to a live one.
  const reportOnly = perOrg.length > 0 ? perOrg.every((o) => o.reportOnly) : true;

  return {
    report_only: reportOnly,
    dry_run: dryRun,
    lead_days: CLAIM_DUE_LEAD_DAYS,
    ...totals,
    orgs_swept: perOrg.length,
    orgs_failed: failedOrgs,
    duration_ms: Date.now() - startedAt,
    per_org: perOrg,
  };
}
