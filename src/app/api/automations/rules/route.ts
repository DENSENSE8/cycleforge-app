import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { AutomationRuleCreateBody } from '@/lib/schemas/automations';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  createAutomationRule,
  listAutomationRules,
} from '@/lib/automations/rules-crud';
import pool from '@/lib/db';

const ROUTE_AUTOMATION_RULES_POST = 'automations.rules.post';

/**
 * GET /api/automations/rules — list org listing→staff automation rules.
 * Query: includeDisabled=true to include disabled rows.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const includeDisabled = searchParams.get('includeDisabled') === 'true';
  const items = await listAutomationRules(ctx.organizationId, { includeDisabled });
  return NextResponse.json({ success: true, items, total: items.length });
}, { permission: 'admin.manage_features' });

/**
 * POST /api/automations/rules — create a listing→staff automation rule.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(AutomationRuleCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(
        pool,
        ctx.organizationId,
        idemKey,
        ROUTE_AUTOMATION_RULES_POST,
      );
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    const created = await createAutomationRule(
      ctx.organizationId,
      parsed,
      ctx.staffId ?? null,
    );

    await recordAudit(pool, ctx, req, {
      source: 'automations-api',
      action: AUDIT_ACTION.AUTOMATION_RULE_CREATE,
      entityType: AUDIT_ENTITY.AUTOMATION_RULE,
      entityId: created.id,
      after: { ...created },
    });

    const responseBody = { success: true, item: created };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE_AUTOMATION_RULES_POST,
        staffId: ctx.staffId,
        statusCode: 201,
        responseBody,
      });
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === '23505' || /unique/i.test(err?.message || '')) {
      return NextResponse.json(
        { success: false, error: 'A rule for this item number and SKU already exists' },
        { status: 409 },
      );
    }
    console.error('Error in POST /api/automations/rules:', error);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to create' },
      { status: 500 },
    );
  }
}, { permission: 'admin.manage_features' });
