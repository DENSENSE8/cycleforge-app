import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { CustomFieldDefCreateBody, CustomFieldEntityTypeSchema } from '@/lib/schemas/custom-fields';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  createCustomFieldDef,
  listCustomFieldDefs,
} from '@/lib/custom-fields/queries';
import { isCustomFieldEntityLive } from '@/lib/custom-fields/types';
import pool from '@/lib/db';

const ROUTE_CUSTOM_FIELD_DEFS_POST = 'custom-fields.defs.post';

/**
 * GET /api/custom-fields/defs?entityType=… — list live defs.
 * Gated by {@link isCustomFieldEntityLive} (History-first allowlist).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const entityTypeRaw = new URL(req.url).searchParams.get('entityType') ?? '';
    const parsed = CustomFieldEntityTypeSchema.safeParse(entityTypeRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'entityType must be a known custom-field entity' },
        { status: 400 },
      );
    }
    if (!isCustomFieldEntityLive(parsed.data)) {
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
    const items = await listCustomFieldDefs(ctx.organizationId, parsed.data);
    return NextResponse.json({ success: true, items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list custom fields';
    console.error('GET /api/custom-fields/defs:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'receiving.view' });

/**
 * POST /api/custom-fields/defs — create a custom column definition (admin).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(CustomFieldDefCreateBody, raw);
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

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(
        pool,
        ctx.organizationId,
        idemKey,
        ROUTE_CUSTOM_FIELD_DEFS_POST,
      );
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    const created = await createCustomFieldDef(ctx.organizationId, parsed);

    await recordAudit(pool, ctx, req, {
      source: 'custom-fields-api',
      action: AUDIT_ACTION.CUSTOM_FIELD_DEF_CREATE,
      entityType: AUDIT_ENTITY.CUSTOM_FIELD_DEF,
      entityId: created.id,
      after: { ...created },
    });

    const responseBody = { success: true, item: created };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE_CUSTOM_FIELD_DEFS_POST,
        staffId: ctx.staffId,
        statusCode: 201,
        responseBody,
      });
    }
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create custom field';
    console.error('POST /api/custom-fields/defs:', error);
    const status = /unique|duplicate/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}, { permission: 'settings.custom_fields' });
