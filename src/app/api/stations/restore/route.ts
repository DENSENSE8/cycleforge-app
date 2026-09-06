/**
 * POST /api/stations/restore — bring an earlier version back as the next draft.
 *
 * Body: { id } — any station_definitions row of the caller's org (active,
 * superseded, or draft). Its label + config are copied FORWARD into a new
 * draft version for the same (page, mode) through the shared draft upsert.
 * The old row is never re-activated: re-flipping `is_active` onto version 3
 * while version 7 exists makes the API report 7 as a "draft", and the history
 * stops reading top to bottom. Copy-forward keeps the log linear and is the
 * same motion cherry-pick uses. Publishing the restored draft is the existing
 * explicit step (`/api/stations/publish`), with its registry re-validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { StationRestoreBody } from '@/lib/schemas/stations';
import { validateStationConfig } from '@/lib/stations/validate';
import { restoreConfig } from '@/lib/stations/version-ops';
import {
  findStationDefinition,
  toStationApi,
  upsertStationDraft,
} from '@/lib/stations/draft-store';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(StationRestoreBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await withTenantTransaction(ctx.organizationId, async (client) => {
      const from = await findStationDefinition(client, ctx.organizationId, parsed.id);
      if (!from) return { status: 404 as const };

      // A version saved against blocks since removed from code cannot come
      // back as a draft either — the builder would refuse to publish it.
      const config = restoreConfig(from.config);
      const issues = validateStationConfig(config);
      if (issues.length > 0) return { status: 422 as const, issues };

      const draft = await upsertStationDraft(client, ctx.organizationId, {
        pageKey: from.page_key,
        modeKey: from.mode_key,
        label: from.label,
        workflowNodeId: from.workflow_node_id,
        config,
        staffId: ctx.staffId,
      });
      if (!draft) return { status: 500 as const };

      await recordAudit(client, ctx, req, {
        source: 'stations-api',
        action: AUDIT_ACTION.STATION_DRAFT_SAVE,
        entityType: AUDIT_ENTITY.STATION_DEFINITION,
        entityId: draft.id,
        after: {
          pageKey: draft.page_key,
          modeKey: draft.mode_key,
          version: draft.version,
          restoredFromId: from.id,
          restoredFromVersion: from.version,
        },
      });
      return { status: 200 as const, draft, from };
    });

    if (result.status === 404) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
    }
    if (result.status === 422) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CONFIG', issues: result.issues },
        { status: 422 },
      );
    }
    if (result.status === 500) {
      return NextResponse.json({ success: false, error: 'Draft upsert produced no row' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      draft: toStationApi(result.draft),
      restoredFrom: { id: result.from.id, version: result.from.version },
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/stations/restore');
  }
}, { permission: 'stations.manage' });
