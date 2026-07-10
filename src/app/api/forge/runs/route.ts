import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RunRow {
  id: number;
  run_uid: string;
  feature_request: string;
  branch: string | null;
  manifest_path: string | null;
  status: string;
  git_diff_stat: string | null;
  started_at: string | null;
  completed_at: string | null;
}
interface StepRow {
  id: number;
  run_id: number;
  stage: string;
  status: string;
  detail: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * GET /api/forge/runs — Cycle Forge run history for the org, newest-first, each
 * run with its ordered stage steps. Powers the /forge chat-timeline. Read-only;
 * org from ctx.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 20));

  const runs = await tenantQuery<RunRow>(
    ctx.organizationId,
    `SELECT id, run_uid, feature_request, branch, manifest_path, status,
            git_diff_stat, started_at::text AS started_at, completed_at::text AS completed_at
       FROM cycle_forge_runs
      WHERE organization_id = $1
      ORDER BY started_at DESC, id DESC
      LIMIT $2`,
    [ctx.organizationId, limit],
  );

  const runIds = runs.rows.map((r) => r.id);
  const stepsByRun = new Map<number, StepRow[]>();
  if (runIds.length) {
    const steps = await tenantQuery<StepRow>(
      ctx.organizationId,
      `SELECT id, run_id, stage, status, detail,
              started_at::text AS started_at, completed_at::text AS completed_at
         FROM cycle_forge_run_steps
        WHERE organization_id = $1 AND run_id = ANY($2::int[])
        ORDER BY run_id, created_at ASC, id ASC`,
      [ctx.organizationId, runIds],
    );
    for (const s of steps.rows) {
      const arr = stepsByRun.get(s.run_id) ?? [];
      arr.push(s);
      stepsByRun.set(s.run_id, arr);
    }
  }

  const payload = runs.rows.map((r) => ({ ...r, steps: stepsByRun.get(r.id) ?? [] }));
  return NextResponse.json({ success: true, runs: payload });
}, { permission: 'assistant.chat' });
