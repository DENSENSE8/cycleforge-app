import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { publishForgeRunChanged } from '@/lib/realtime/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Machine ingress has no session, so there is no ctx.organizationId to derive from — the target tenant is CONFIGURED, not derived.
const FORGE_ORG_ID = process.env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001';

/** POST /api/forge/ingest — machine ingress for the Cycle Forge loop (forge.sh, running in WSL). */
export const POST = withAuth(async (req: NextRequest) => {
  const expected = process.env.FORGE_INGEST_TOKEN;
  if (!expected || req.headers.get('x-forge-token') !== expected) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'BAD_JSON' }, { status: 400 });
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length ? v : null);
  const runUid = str(body.runUid);
  if (!runUid) {
    return NextResponse.json({ success: false, error: 'runUid required' }, { status: 400 });
  }

  const org = FORGE_ORG_ID;
  const result = await withTenantTransaction(org, async (client) => {
    // Upsert the run (idempotent on org + run_uid).
    const runRes = await client.query<{ id: number }>(
      `INSERT INTO cycle_forge_runs
         (organization_id, run_uid, feature_request, branch, manifest_path, git_diff_stat)
       VALUES ($1::uuid, $2::text, COALESCE($3::text, '(pending)'), $4::text, $5::text, $6::text)
       ON CONFLICT (organization_id, run_uid) DO UPDATE SET
         -- use the raw $3 param (null when a stage call omits feature), NOT
         -- EXCLUDED.feature_request, which carries the '(pending)' VALUES default
         -- and would otherwise clobber a real feature on later stage upserts.
         feature_request = COALESCE($3::text, cycle_forge_runs.feature_request),
         branch          = COALESCE(EXCLUDED.branch, cycle_forge_runs.branch),
         manifest_path   = COALESCE(EXCLUDED.manifest_path, cycle_forge_runs.manifest_path),
         git_diff_stat   = COALESCE(EXCLUDED.git_diff_stat, cycle_forge_runs.git_diff_stat)
       RETURNING id`,
      [org, runUid, str(body.feature), str(body.branch), str(body.manifestPath), str(body.gitDiffStat)],
    );
    const runId = runRes.rows[0].id;

    // Optional per-stage upsert (running → ok/failed/skipped).
    const stage = str(body.stage);
    if (stage) {
      const stageStatus = str(body.stageStatus) ?? 'running';
      await client.query(
        `INSERT INTO cycle_forge_run_steps
           (organization_id, run_id, stage, status, detail, completed_at)
         VALUES ($1::uuid, $2::int, $3::text, $4::text, $5::text,
                 CASE WHEN $4::text IN ('ok','failed','skipped') THEN now() ELSE NULL END)
         ON CONFLICT (organization_id, run_id, stage) DO UPDATE SET
           status       = EXCLUDED.status,
           detail       = COALESCE(EXCLUDED.detail, cycle_forge_run_steps.detail),
           completed_at = CASE WHEN EXCLUDED.status IN ('ok','failed','skipped')
                               THEN now() ELSE cycle_forge_run_steps.completed_at END`,
        [org, runId, stage, stageStatus, str(body.detail)],
      );
    }

    // Optional overall run-status update.
    const runStatus = str(body.runStatus);
    if (runStatus) {
      await client.query(
        `UPDATE cycle_forge_runs SET status = $2::text,
           completed_at = CASE WHEN $2::text IN ('passed','failed','error','cancelled')
                               THEN now() ELSE completed_at END
         WHERE organization_id = $1::uuid AND id = $3::int`,
        [org, runStatus, runId],
      );
    }

    return { runId };
  });

  // Live dashboard nudge — fire-and-forget, never blocks the ingest response.
  after(() =>
    publishForgeRunChanged({
      organizationId: org,
      runUid,
      stage: str(body.stage),
      runStatus: str(body.runStatus),
    }),
  );

  return NextResponse.json({ success: true, ...result });
}, { allowAnonymous: true });
