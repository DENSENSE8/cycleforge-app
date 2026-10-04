import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { recordRackLabelsPrinted } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { parseRackBody, RackLabelsPrintedBodySchema } from '@/lib/schemas/racks';
import pool from '@/lib/db';

/**
 * POST /api/racks/[code]/labels-printed — record a finished print run of this
 * rack's labels (`location.labels.printed`). Idempotent on `clientEventId`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'sku_stock.view');
    if (gate.denied) return gate.denied;
    const { code } = await params;
    const parsed = parseRackBody(RackLabelsPrintedBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);

    const out = await recordRackLabelsPrinted(await rackActor(gate.ctx), decodeURIComponent(code), parsed.data);
    if (!out.ok) return rackResponse(out);
    await recordAudit(pool, gate.ctx, req, {
      source: 'racks-api',
      action: AUDIT_ACTION.RACK_LABELS_PRINT,
      entityType: AUDIT_ENTITY.RACK,
      entityId: out.body.rackId,
      after: { codes: parsed.data.codes, transport: parsed.data.transport },
    });
    return rackResponse({ ...out, body: { ok: true as const } });
  } catch (error) {
    return rackRouteError(error, 'POST /api/racks/[code]/labels-printed');
  }
}
