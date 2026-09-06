/**
 * POST /api/stations/cherry-pick — lift named block instances from one version
 * into another, as the next draft.
 *
 * Body: { baseId, fromId, blockIds[] }. `baseId` is the version to start from
 * (usually the live one), `fromId` the version to take blocks from, and
 * `blockIds` the stable `BlockInstanceConfig.id`s to lift. Both rows must be
 * the same (org, page, mode) — a block from a different station is a fork,
 * not a pick. The merge is `cherryPickBlocks` (pure, tested); the result is
 * registry-validated and saved through the shared draft upsert. Publish stays
 * the explicit step.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { StationCherryPickBody } from '@/lib/schemas/stations';
import { validateStationConfig } from '@/lib/stations/validate';
import { cherryPickBlocks } from '@/lib/stations/version-ops';
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
    const parsed = parseBody(StationCherryPickBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await withTenantTransaction(ctx.organizationId, async (client) => {
      const [base, from] = await Promise.all([
        findStationDefinition(client, ctx.organizationId, parsed.baseId),
        findStationDefinition(client, ctx.organizationId, parsed.fromId),
      ]);
      if (!base || !from) return { status: 404 as const };
      if (base.page_key !== from.page_key || base.mode_key !== from.mode_key) {
        return { status: 400 as const, error: 'baseId and fromId must be versions of the same station' };
      }

      const merged = cherryPickBlocks(base.config, from.config, parsed.blockIds);
      if (merged.picked.length === 0) {
        return { status: 400 as const, error: `none of the block ids exist in version ${from.version}`, missing: merged.missing };
      }
      const issues = validateStationConfig(merged.config);
      if (issues.length > 0) return { status: 422 as const, issues };

      const draft = await upsertStationDraft(client, ctx.organizationId, {
        pageKey: base.page_key,
        modeKey: base.mode_key,
        label: base.label,
        workflowNodeId: base.workflow_node_id,
        config: merged.config,
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
          cherryPick: { baseId: base.id, fromId: from.id, picked: merged.picked, missing: merged.missing },
        },
      });
      return { status: 200 as const, draft, picked: merged.picked, missing: merged.missing };
    });

    if (result.status === 404) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
    }
    if (result.status === 400) {
      return NextResponse.json({ success: false, error: result.error, missing: result.missing ?? [] }, { status: 400 });
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
      picked: result.picked,
      missing: result.missing,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/stations/cherry-pick');
  }
}, { permission: 'stations.manage' });
