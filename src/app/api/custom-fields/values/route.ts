import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { CustomFieldValueUpsertBody } from '@/lib/schemas/custom-fields';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { listCustomFieldDefs, upsertCustomFieldValue } from '@/lib/custom-fields/queries';
import { isCustomFieldEntityLive } from '@/lib/custom-fields/types';
import pool from '@/lib/db';

const ROUTE_CUSTOM_FIELD_VALUES_POST = 'custom-fields.values.post';

/**
 * POST /api/custom-fields/values — upsert one cell value on an entity row.
 * Gated by {@link isCustomFieldEntityLive}; write perm = receiving.view while
 * only RECEIVING is live.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(CustomFieldValueUpsertBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    if (!isCustomFieldEntityLive(parsed.entityType)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Custom fields are not live for this entity — dogfood Unbox History first ' +
            '(CUSTOM_FIELD_LIVE_ENTITY_TYPES)',
        },
        { status: 403 },
      );
    }

    const gate = await requireRoutePerm(req, 'receiving.view');
    if (gate.denied) return gate.denied;

    const defs = await listCustomFieldDefs(gate.ctx.organizationId, parsed.entityType, {
      includeArchived: true,
    });
    const def = defs.find((d) => d.id === parsed.fieldId);
    if (!def || def.archivedAt) {
      return NextResponse.json({ success: false, error: 'Unknown field' }, { status: 404 });
    }

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(
        pool,
        gate.ctx.organizationId,
        idemKey,
        ROUTE_CUSTOM_FIELD_VALUES_POST,
      );
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    await upsertCustomFieldValue(gate.ctx.organizationId, {
      fieldId: parsed.fieldId,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      type: def.type,
      value: parsed.value,
    });

    await recordAudit(pool, gate.ctx, req, {
      source: 'custom-fields-api',
      action: AUDIT_ACTION.CUSTOM_FIELD_VALUE_UPSERT,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: parsed.entityId,
      after: { fieldId: parsed.fieldId, key: def.key, value: parsed.value },
    });

    const responseBody = { success: true };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: gate.ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE_CUSTOM_FIELD_VALUES_POST,
        staffId: gate.ctx.staffId,
        statusCode: 200,
        responseBody,
      });
    }
    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save value';
    console.error('POST /api/custom-fields/values:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
