/**
 * POST /api/forge/master-plan/sync — machine (or session) trigger for the
 * ops-plans bridge after Cursor/`forge.sh` flips a TicketStatus in MDX.
 *
 * Without this, Operations ▸ Plans stayed stale until someone opened the live
 * console (GET /api/forge/master-plan) or the plan agent mutated. Same webhook
 * posture as /api/forge/ingest: `x-forge-token` + configured FORGE_ORG_ID.
 * Session callers need operations.plans.manage.
 *
 * Body (optional): { mdx?: string } — omit to read the live CRDT room.
 * Does NOT write cycle_forge_runs or user_reported_issues — plan tables only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withMasterPlanDoc } from '@/lib/master-plan/server-doc';
import { readMasterPlan } from '@/lib/master-plan/doc';
import { syncMasterPlanToOpsPlans } from '@/lib/master-plan/ops-plans-bridge';
import { scanTicketStatuses } from '@/lib/master-plan/ticket-status';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FORGE_ORG_ID = (process.env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001') as OrgId;

function isForgeToken(req: NextRequest): boolean {
  const expected = process.env.FORGE_INGEST_TOKEN;
  return Boolean(expected && req.headers.get('x-forge-token') === expected);
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const machine = isForgeToken(req);
  const sessionManage =
    Boolean(ctx.staffId && ctx.organizationId) && ctx.permissions.has('operations.plans.manage');

  if (!machine && !sessionManage) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const orgId = (machine ? FORGE_ORG_ID : ctx.organizationId) as OrgId;

  let bodyMdx: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { mdx?: unknown };
    if (typeof body.mdx === 'string' && body.mdx.length > 0) bodyMdx = body.mdx;
  } catch {
    // empty body is fine
  }

  try {
    const mdx =
      bodyMdx ??
      (await withMasterPlanDoc(orgId, (doc) => readMasterPlan(doc))).result;

    const tickets = scanTicketStatuses(mdx);
    if (tickets.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'no_tickets',
      });
    }

    const result = await syncMasterPlanToOpsPlans(orgId, mdx);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Error in POST /api/forge/master-plan/sync:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}, { allowAnonymous: true });
