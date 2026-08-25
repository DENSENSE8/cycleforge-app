/**
 * POST /api/tool-forge/requests/[id]/decision — record a human triage decision.
 *
 * The operator half of the loop. Distinct from the model's path
 * (submit_approval_decision over MCP) in exactly two ways, both deliberate:
 * the ledger row is stamped decided_by='human' with the staffer's id, and
 * 'manual_override' is available here and nowhere else — the DB requires a
 * human plus a staff id for that reason code
 * (approval_reviews_override_is_human).
 *
 * A request the deterministic gate denied as a duplicate still cannot be
 * approved through this route. That is not a policy choice made here: the row
 * carries duplicate_tool_id, and build_requests_duplicate_is_denied rejects any
 * status but 'denied' for it. recordApprovalDecision checks first only so the
 * caller gets a sentence instead of a constraint violation.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { recordApprovalDecision } from '@/lib/tool-forge/requests';
import { APPROVAL_REASON_CODES } from '@/lib/tool-forge/constants';

export const runtime = 'nodejs';

/**
 * The gate's own verdicts are not submittable by hand either. A human who
 * disagrees with a duplicate denial records a 'manual_override' — which is
 * visibly an override in the ledger — rather than restating the gate's
 * conclusion as if the gate had reached it.
 */
const HUMAN_REASON_CODES = APPROVAL_REASON_CODES.filter(
  (c) => c !== 'duplicate_tool' && c !== 'could_not_measure',
) as Array<Exclude<(typeof APPROVAL_REASON_CODES)[number], 'duplicate_tool' | 'could_not_measure'>>;

const Body = z.object({
  decision: z.enum(['approved', 'denied']),
  reason: z.string().min(1).max(2000),
  reasonCode: z.enum(HUMAN_REASON_CODES as [string, ...string[]]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'tool_forge.decide');
  if (gate.denied) return gate.denied;
  const ctx = gate.ctx;

  const { id: rawId } = await params;
  const requestId = Number(rawId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', detail: parsed.error.message }, { status: 400 });
  }

  if (parsed.data.reasonCode === 'manual_override' && ctx.staffId == null) {
    return NextResponse.json(
      { error: 'OVERRIDE_REQUIRES_STAFF', detail: 'A manual override must be attributable to a person.' },
      { status: 403 },
    );
  }

  const result = await recordApprovalDecision(ctx.organizationId, {
    buildRequestId: requestId,
    decision: parsed.data.decision,
    reasonCode: parsed.data.reasonCode as (typeof APPROVAL_REASON_CODES)[number],
    exactReason: parsed.data.reason,
    duplicateToolId: null,
    similarity: null,
    decidedBy: 'human',
    decidedByStaffId: ctx.staffId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'DECISION_REFUSED', detail: result.error }, { status: 409 });
  }

  await recordAudit(pool, ctx, request, {
    source: 'tool-forge',
    action: 'tool_forge.decision_recorded',
    entityType: 'build_request',
    entityId: requestId,
    after: { decision: parsed.data.decision, reasonCode: parsed.data.reasonCode, reviewId: result.reviewId },
  });

  return NextResponse.json({ ok: true, reviewId: result.reviewId });
}
