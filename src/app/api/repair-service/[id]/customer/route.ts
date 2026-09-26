import { NextRequest, NextResponse } from 'next/server';
import { getRepairById } from '@/lib/neon/repair-service-queries';
import {
  createAndLinkRepairCustomer,
  setRepairCustomer,
  type RepairCustomerLinkResult,
} from '@/lib/neon/customer-queries';
import { RepairCustomerCreateBody, RepairCustomerLinkBody } from '@/lib/schemas/customers';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/** The customer RECORD a repair points at (`repair_service.customer_id`). */

function parseId(id: string): number | null {
  const n = parseInt(id, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Verb = 'create' | 'link' | 'unlink';

async function handle(
  req: NextRequest,
  params: Promise<{ id: string }>,
  verb: Verb,
): Promise<NextResponse> {
  const gate = await requireRoutePerm(req, 'repair.intake');
  if (gate.denied) return gate.denied;
  const repairId = parseId((await params).id);
  if (repairId == null) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  const orgId = gate.ctx.organizationId;

  let result: RepairCustomerLinkResult;
  if (verb === 'unlink') {
    result = await setRepairCustomer(repairId, null, orgId);
  } else {
    const raw = await req.json().catch(() => null);
    const parsed =
      verb === 'create' ? RepairCustomerCreateBody.safeParse(raw) : RepairCustomerLinkBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'invalid body', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    result =
      'customerId' in parsed.data
        ? await setRepairCustomer(repairId, parsed.data.customerId, orgId)
        : await createAndLinkRepairCustomer(repairId, parsed.data, orgId);
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.before.customer_id !== result.after.customer_id) {
    await invalidateCacheTags(['repair-service']);
    await publishRepairChanged({ organizationId: orgId, repairIds: [repairId], source: `repair-service.customer.${verb}` });
    await recordAudit(pool, gate.ctx, req, {
      source: 'repair-service-api',
      action: verb === 'unlink' ? AUDIT_ACTION.REPAIR_SERVICE_CUSTOMER_UNLINK : AUDIT_ACTION.REPAIR_SERVICE_CUSTOMER_LINK,
      entityType: AUDIT_ENTITY.REPAIR_SERVICE,
      entityId: repairId,
      before: { ...result.before },
      after: { ...result.after, ...(verb === 'create' ? { created_customer: true } : {}) },
    });
  }

  return NextResponse.json({
    success: true,
    customerId: result.after.customer_id,
    repair: await getRepairById(repairId, orgId),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, 'create');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, 'link');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, 'unlink');
}
