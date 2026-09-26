/** GET /api/user-issues — tenant-scoped reported-issues list (UIC-1). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { checkRateLimitAsync } from '@/lib/api-guard';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import {
  ListUserIssuesQuery,
  decodeIssueCursor,
  encodeIssueCursor,
} from '@/lib/schemas/user-issues';
import {
  createReportedIssue,
  attachGithubIssue,
  listReportedIssues,
  USER_ISSUE_TYPES,
  type UserIssueType,
  type UserIssueStatus,
  type UserIssuesDeps,
} from '@/lib/user-issues/issues';

export const runtime = 'nodejs';

const GITHUB_REPO = 'DENSENSE8/cycleforge-app';
const GITHUB_API = 'https://api.github.com';

// The GitHub mirror + claude-fix automation belong to ONE tenant (the dogfood org that owns DENSENSE8/cycleforge-app).
const FORGE_ORG_ID = (process.env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001').toLowerCase();

const TYPE_LABEL: Record<UserIssueType, string> = {
  bug: 'bug',
  suggestion: 'enhancement',
  question: 'question',
};

const dbDeps: UserIssuesDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

/**
 * GET /api/user-issues?status=&type=&reporter=&q=&cursor=&limit=
 * Keyset-paginated list for the Reported-Issues Workbench.
 */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      status: searchParams.get('status') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      reporter: searchParams.get('reporter') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    };
    const parsed = parseBody(ListUserIssuesQuery, raw);
    if (parsed instanceof NextResponse) return parsed;

    const cursor = parsed.cursor ? decodeIssueCursor(parsed.cursor) : null;
    if (parsed.cursor && !cursor) {
      return NextResponse.json(
        { success: false, error: 'Invalid cursor' },
        { status: 400 },
      );
    }

    const result = await listReportedIssues(
      ctx.organizationId,
      {
        status: (parsed.status as UserIssueStatus | undefined) ?? null,
        type: (parsed.type as UserIssueType | undefined) ?? null,
        reporterId: parsed.reporter ?? null,
        q: parsed.q ?? null,
        cursor,
        limit: parsed.limit,
      },
      dbDeps,
    );

    return NextResponse.json({
      success: true,
      issues: result.issues,
      nextCursor: result.nextCursor ? encodeIssueCursor(result.nextCursor) : null,
    });
  } catch (error: unknown) {
    console.error('Error in GET /api/user-issues:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list issues' },
      { status: 500 },
    );
  }
}, { permission: 'support.issues.view' });

export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    // Throttle report creation so a stuck client (or abuse) can't flood the
    // GitHub mirror + claude-fix automation. Scoped per staffer within the org.
    const rl = await checkRateLimitAsync({
      headers: request.headers,
      routeKey: 'user-issues.report',
      limit: 10,
      windowMs: 60_000,
      scope: `${ctx.organizationId}:${ctx.staffId}`,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many reports — please wait a moment.' },
        { status: 429, headers: rl.retryAfterSec ? { 'retry-after': String(rl.retryAfterSec) } : undefined },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      page?: string;
      type?: UserIssueType;
      clientEventId?: string;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 });
    }
    if (!body.description?.trim()) {
      return NextResponse.json({ ok: false, error: 'description is required' }, { status: 400 });
    }
    const issueType: UserIssueType = body.type && USER_ISSUE_TYPES.includes(body.type) ? body.type : 'bug';

    // 1. Primary write — Neon, tenant-scoped, idempotent on clientEventId.
    const created = await createReportedIssue(
      ctx.organizationId,
      {
        reporterStaffId: ctx.staffId,
        issueType,
        title: body.title.slice(0, 200),
        description: body.description,
        pagePath: body.page ?? null,
        clientEventId: body.clientEventId?.trim() || null,
      },
      dbDeps,
    );

    if (!created.idempotent) {
      await recordAudit(pool, ctx, request, {
        source: 'user-issues-api',
        action: AUDIT_ACTION.USER_ISSUE_REPORT,
        entityType: AUDIT_ENTITY.USER_ISSUE,
        entityId: created.id,
        after: { issueType, title: body.title.trim(), page: body.page ?? null },
      });
    }

    // 2. Mirror write — GitHub (feeds the claude-fix automation). Best-effort:
    //    a mirror failure downgrades to a logged warning, never a lost report.
    let issueNumber: number | null = null;
    let url: string | null = null;
    const token = process.env.GITHUB_ISSUE_TOKEN;
    const mirrorToGithub = token && !created.idempotent && ctx.organizationId.toLowerCase() === FORGE_ORG_ID;
    if (mirrorToGithub) {
      try {
        const issueBody = [
          `**Reported by:** ${ctx.user.name ?? 'Unknown'}`,
          `**Page:** ${body.page ?? 'unknown'}`,
          `**Type:** ${issueType}`,
          `**In-app issue id:** ${created.id}`,
          '',
          '---',
          '',
          body.description.trim(),
        ].join('\n');
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `[${issueType.toUpperCase()}] ${body.title.trim()}`,
            body: issueBody,
            labels: ['user-reported', TYPE_LABEL[issueType]],
          }),
        });
        if (res.ok) {
          const issue = (await res.json()) as { number: number; html_url: string };
          issueNumber = issue.number;
          url = issue.html_url;
          await attachGithubIssue(ctx.organizationId, created.id, { number: issue.number, url: issue.html_url }, dbDeps);
        } else {
          console.error('GitHub issue mirror failed:', res.status, await res.text().catch(() => ''));
        }
      } catch (err) {
        console.error('GitHub issue mirror failed:', err);
      }
    }

    return NextResponse.json({ ok: true, issueId: created.id, issueNumber, url, idempotent: created.idempotent });
  } catch (error: unknown) {
    console.error('Error in POST /api/user-issues:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to log issue' },
      { status: 500 },
    );
  }
});
