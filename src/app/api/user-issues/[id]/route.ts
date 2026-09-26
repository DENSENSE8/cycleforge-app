/** GET /api/user-issues/[id] — single reported issue (UIC-1). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { parseBody } from '@/lib/schemas/parse';
import { PatchUserIssueBody } from '@/lib/schemas/user-issues';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import {
  getReportedIssue,
  setIssueStatus,
  softDeleteReportedIssue,
  updateReportedIssue,
  type UserIssuesDeps,
} from '@/lib/user-issues/issues';

export const runtime = 'nodejs';

const dbDeps: UserIssuesDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

/**
 * GET /api/user-issues/[id]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.issues.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid issue id' }, { status: 400 });
    }

    const issue = await getReportedIssue(gate.ctx.organizationId, id, dbDeps);
    if (!issue) {
      return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, issue });
  } catch (error: unknown) {
    console.error('Error in GET /api/user-issues/[id]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load issue' },
      { status: 500 },
    );
  }
}

/** PATCH /api/user-issues/[id] — Claim / Resolve / Reopen / Edit. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.issues.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid issue id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PatchUserIssueBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const before = await getReportedIssue(orgId, id, dbDeps);
    if (!before) {
      return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
    }

    let issue = before;

    const hasFields =
      parsed.title !== undefined ||
      parsed.description !== undefined ||
      parsed.issueType !== undefined;

    if (hasFields) {
      const updated = await updateReportedIssue(
        orgId,
        id,
        {
          title: parsed.title,
          description: parsed.description,
          issueType: parsed.issueType,
        },
        dbDeps,
      );
      if (!updated.ok) {
        const status = updated.error === 'not_found' ? 404 : 400;
        return NextResponse.json({ success: false, error: updated.error }, { status });
      }
      issue = updated.issue;

      await recordAudit(pool, gate.ctx, req, {
        source: 'user-issues-api',
        action: AUDIT_ACTION.USER_ISSUE_UPDATE,
        entityType: AUDIT_ENTITY.USER_ISSUE,
        entityId: id,
        before: {
          title: before.title,
          description: before.description,
          issueType: before.issueType,
        },
        after: {
          title: issue.title,
          description: issue.description,
          issueType: issue.issueType,
        },
      });
    }

    if (parsed.status !== undefined && parsed.expectedFrom !== undefined) {
      const statusResult = await setIssueStatus(
        orgId,
        id,
        parsed.status,
        {
          expectedFrom: parsed.expectedFrom,
          resolutionCommit: parsed.resolutionCommit,
        },
        dbDeps,
      );

      if (!statusResult.ok) {
        if (statusResult.error === 'conflict') {
          const current = await getReportedIssue(orgId, id, dbDeps);
          return NextResponse.json(
            {
              success: false,
              error: 'conflict',
              message: 'Issue status changed — refresh and retry',
              issue: current,
            },
            { status: 409 },
          );
        }
        if (statusResult.error === 'not_found') {
          return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
        }
        if (statusResult.error === 'invalid_transition') {
          return NextResponse.json(
            { success: false, error: 'invalid_transition', from: parsed.expectedFrom, to: parsed.status },
            { status: 400 },
          );
        }
        return NextResponse.json({ success: false, error: statusResult.error }, { status: 400 });
      }

      issue = statusResult.issue;

      await recordAudit(pool, gate.ctx, req, {
        source: 'user-issues-api',
        action: AUDIT_ACTION.USER_ISSUE_STATUS,
        entityType: AUDIT_ENTITY.USER_ISSUE,
        entityId: id,
        before: { status: statusResult.from },
        after: {
          status: statusResult.to,
          resolutionCommit: issue.resolutionCommit,
        },
      });
    }

    return NextResponse.json({ success: true, issue });
  } catch (error: unknown) {
    console.error('Error in PATCH /api/user-issues/[id]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update issue' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/user-issues/[id] — soft-delete (tombstone). Idempotent.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.issues.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid issue id' }, { status: 400 });
    }

    const before = await getReportedIssue(gate.ctx.organizationId, id, dbDeps);
    // Already soft-deleted → get returns null; still run softDelete for idempotent 200.
    const result = await softDeleteReportedIssue(gate.ctx.organizationId, id, dbDeps);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'user-issues-api',
        action: AUDIT_ACTION.USER_ISSUE_DELETE,
        entityType: AUDIT_ENTITY.USER_ISSUE,
        entityId: id,
        before: before
          ? { title: before.title, status: before.status, issueType: before.issueType }
          : undefined,
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error: unknown) {
    console.error('Error in DELETE /api/user-issues/[id]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete issue' },
      { status: 500 },
    );
  }
}
