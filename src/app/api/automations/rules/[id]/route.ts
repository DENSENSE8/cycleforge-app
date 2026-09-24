import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { AutomationRuleUpdateBody } from '@/lib/schemas/automations';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  getAutomationRule,
  softDeleteAutomationRule,
  updateAutomationRule,
} from '@/lib/automations/rules-crud';
import pool from '@/lib/db';

function extractId(pathname: string): number | null {
  const m = /\/api\/automations\/rules\/(\d+)/.exec(pathname);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * GET /api/automations/rules/[id]
 */
export async function GET(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'admin.manage_features');
  if (gate.denied) return gate.denied;
  try {
    const id = extractId(req.nextUrl.pathname);
    if (id == null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }
    const item = await getAutomationRule(gate.ctx.organizationId, id);
    if (!item) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    console.error('Error in GET /api/automations/rules/[id]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/automations/rules/[id]
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'admin.manage_features');
  if (gate.denied) return gate.denied;
  try {
    const id = extractId(req.nextUrl.pathname);
    if (id == null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(AutomationRuleUpdateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const before = await getAutomationRule(gate.ctx.organizationId, id);
    if (!before) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const item = await updateAutomationRule(
      gate.ctx.organizationId,
      id,
      parsed,
      gate.ctx.staffId ?? null,
    );
    if (!item) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'automations-api',
      action: AUDIT_ACTION.AUTOMATION_RULE_UPDATE,
      entityType: AUDIT_ENTITY.AUTOMATION_RULE,
      entityId: id,
      before: { ...before },
      after: { ...item },
    });

    return NextResponse.json({ success: true, item });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === '23505' || /unique/i.test(err?.message || '')) {
      return NextResponse.json(
        { success: false, error: 'A rule for this item number and SKU already exists' },
        { status: 409 },
      );
    }
    console.error('Error in PATCH /api/automations/rules/[id]:', error);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/automations/rules/[id] — soft-delete.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'admin.manage_features');
  if (gate.denied) return gate.denied;
  try {
    const id = extractId(req.nextUrl.pathname);
    if (id == null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }
    const before = await getAutomationRule(gate.ctx.organizationId, id);
    if (!before) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    const ok = await softDeleteAutomationRule(
      gate.ctx.organizationId,
      id,
      gate.ctx.staffId ?? null,
    );
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    await recordAudit(pool, gate.ctx, req, {
      source: 'automations-api',
      action: AUDIT_ACTION.AUTOMATION_RULE_DELETE,
      entityType: AUDIT_ENTITY.AUTOMATION_RULE,
      entityId: id,
      before: { ...before },
    });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    console.error('Error in DELETE /api/automations/rules/[id]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
