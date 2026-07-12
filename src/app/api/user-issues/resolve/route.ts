/**
 * POST /api/user-issues/resolve — machine ingress for the issue→toast loop
 * (ALP-5.3). Called by the forge loop / fix automation when a reported issue's
 * fix reaches deployment. Webhook-style auth: `x-forge-token` shared secret
 * (same posture as /api/forge/ingest — no session on this path; the tenant is
 * CONFIGURED via FORGE_ORG_ID, matching where reports are dogfooded today).
 *
 * Body: { issueId?: number; githubIssueNumber?: number; resolutionCommit?: string }
 * Effect: status → 'deployed' (+ commit/resolved_at), audit row, and an
 * `issue.resolved` Ably event on the REPORTER's inbox channel → locked toast.
 * Idempotent: an already-deployed issue returns { ok: true, idempotent: true }
 * and does NOT re-toast.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { publishIssueResolved } from '@/lib/realtime/publish';
import pool from '@/lib/db';
import { resolveReportedIssue, type UserIssuesDeps } from '@/lib/user-issues/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same configured-tenant posture as /api/forge/ingest (machine path, no ctx).
const FORGE_ORG_ID = process.env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001';

const dbDeps: UserIssuesDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

export const POST = withAuth(async (req: NextRequest) => {
  const expected = process.env.FORGE_INGEST_TOKEN;
  if (!expected || req.headers.get('x-forge-token') !== expected) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  let body: { issueId?: number; githubIssueNumber?: number; resolutionCommit?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }

  try {
    const org = FORGE_ORG_ID;
    const result = await resolveReportedIssue(
      org,
      {
        issueId: body.issueId,
        githubIssueNumber: body.githubIssueNumber,
        resolutionCommit: body.resolutionCommit ?? null,
      },
      dbDeps,
    );

    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, null, req, {
        source: 'user-issues-resolve',
        action: AUDIT_ACTION.USER_ISSUE_RESOLVE,
        entityType: AUDIT_ENTITY.USER_ISSUE,
        entityId: result.issueId,
        after: { status: 'deployed', resolutionCommit: body.resolutionCommit ?? null },
        organizationIdOverride: org,
        method: 'system',
      });
      // The reporter's toast — fire-and-forget, never blocks the webhook 200.
      if (result.reporterStaffId != null) {
        const staffId = result.reporterStaffId;
        after(() =>
          publishIssueResolved({
            organizationId: org,
            staffId,
            issueId: result.issueId,
            title: result.title,
            resolutionCommit: body.resolutionCommit ?? null,
          }),
        );
      }
    }

    return NextResponse.json({ ok: true, issueId: result.issueId, idempotent: result.idempotent });
  } catch (error: unknown) {
    console.error('Error in POST /api/user-issues/resolve:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to resolve issue' },
      { status: 500 },
    );
  }
}, { allowAnonymous: true });
