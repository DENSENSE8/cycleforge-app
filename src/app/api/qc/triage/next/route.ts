import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { rerankTriageSteps } from '@/lib/qc/triage/ai-rerank';
import { triageNextBodySchema, type TriageNext } from '@/lib/qc/triage/contracts';
import { insertTriageSuggestions } from '@/lib/qc/triage/decisions';
import { loadTriageInput, TriageInputError } from '@/lib/qc/triage/load';
import { rankTriageSteps } from '@/lib/qc/triage/rank';
import { withTenantConnection } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/qc/triage/next — ranked next steps for a unit on the bench.
 * Deterministic ranking from resolution history + past decisions, then (unless
 * `ai: false`) an LLM reorder/explain pass. Every returned step is stored in
 * qc_triage_decisions; post the tech's answer to /api/qc/triage/decisions.
 */
export const POST = withAuth(
  async (request, ctx) => {
    const parsed = triageNextBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
    }
    const { serialUnitId, ai = true } = parsed.data;
    const qcSessionId = parsed.data.qcSessionId ?? null;

    let loaded;
    try {
      loaded = await withTenantConnection(ctx.organizationId, (client) =>
        loadTriageInput(client, ctx.organizationId, serialUnitId, qcSessionId),
      );
    } catch (err) {
      if (err instanceof TriageInputError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    let steps = rankTriageSteps(loaded.input);
    let rankedBy: TriageNext['rankedBy'] = 'DETERMINISTIC';
    let model: string | null = null;
    let aiError: string | null = null;
    // The LLM call runs with no DB connection held.
    if (ai && steps.length > 0) {
      try {
        const reranked = await rerankTriageSteps(ctx.organizationId, loaded.unit, steps);
        steps = reranked.steps;
        model = reranked.model;
        rankedBy = 'AI';
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
      }
    }

    const { requestId, suggestions } = await insertTriageSuggestions(ctx.organizationId, {
      unit: loaded.unit,
      qcSessionId,
      steps,
      rankedBy,
      model,
      staffId: ctx.staffId,
    });

    const data: TriageNext = { requestId, rankedBy, model, aiError, unit: loaded.unit, steps: suggestions };
    return NextResponse.json({ data });
  },
  { permission: 'tech.qc_pass' },
);
