import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { triageDecisionBodySchema } from '@/lib/qc/triage/contracts';
import { recordTriageDecision } from '@/lib/qc/triage/decisions';

/**
 * POST /api/qc/triage/decisions — the tech accepts or rejects one suggested step
 * (`steps[].id` from /api/qc/triage/next). Re-posting changes the decision.
 * Decided rows feed the triage ranker for the same SKU / family.
 */
export const POST = withAuth(
  async (request, ctx) => {
    const parsed = triageDecisionBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
    }
    const data = await recordTriageDecision(ctx.organizationId, parsed.data, ctx.staffId);
    if (!data) return NextResponse.json({ error: 'suggestion not found' }, { status: 404 });
    return NextResponse.json({ data });
  },
  { permission: 'tech.qc_pass' },
);
