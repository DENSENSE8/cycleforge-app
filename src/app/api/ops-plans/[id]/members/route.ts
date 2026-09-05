import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { AddPlanMemberBody } from '@/lib/schemas/ops-plans';
import {
  addPlanMember,
  listPlanMembers,
  removePlanMember,
} from '@/lib/ops-plans/members';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  mapOpsPlanError,
  scheduleOpsPlanSideEffects,
} from '@/lib/ops-plans/side-effects';

export const runtime = 'nodejs';

const PLAN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const gate = await requireRoutePerm(req, 'operations.plans.view');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  if (!PLAN_ID_RE.test(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }
  const members = await listPlanMembers(gate.ctx.organizationId, id);
  if (members == null) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const gate = await requireRoutePerm(req, 'operations.plans.manage');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  if (!PLAN_ID_RE.test(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(AddPlanMemberBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const member = await addPlanMember(
      gate.ctx.organizationId,
      id,
      parsed.staffId,
      gate.ctx.staffId,
    );
    if (!member) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    scheduleOpsPlanSideEffects(gate.ctx.organizationId, id, 'plan_updated', {
      ctx: gate.ctx,
      req,
      audit: {
        action: AUDIT_ACTION.OPS_PLAN_MEMBER_ADD,
        entityType: AUDIT_ENTITY.OPS_PLAN,
        entityId: id,
        after: member,
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    const mapped = mapOpsPlanError(err);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const gate = await requireRoutePerm(req, 'operations.plans.manage');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  if (!PLAN_ID_RE.test(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }
  const staffId = Number(req.nextUrl.searchParams.get('staffId'));
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'INVALID_STAFF' }, { status: 400 });
  }

  try {
    const ok = await removePlanMember(gate.ctx.organizationId, id, staffId);
    if (!ok) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    scheduleOpsPlanSideEffects(gate.ctx.organizationId, id, 'plan_updated', {
      ctx: gate.ctx,
      req,
      audit: {
        action: AUDIT_ACTION.OPS_PLAN_MEMBER_REMOVE,
        entityType: AUDIT_ENTITY.OPS_PLAN,
        entityId: id,
        after: { staffId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const mapped = mapOpsPlanError(err);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}
