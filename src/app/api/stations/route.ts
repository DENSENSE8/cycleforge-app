/**
 * /api/stations — station-builder definitions (Operations Studio layer 2).
 *
 * GET  ?page=receiving — the active definition per (page, mode), plus the
 *      latest draft per mode for holders of `stations.manage`. Gated
 *      `dashboard.view`: any signed-in staff member needs the active configs
 *      to render their station pages; per-block visibility is enforced at
 *      render time by each block's required/bound-action permissions.
 *
 * POST — save a DRAFT for (pageKey, modeKey). Upsert semantics make retries
 *      idempotent: if a newer-than-active draft row already exists it is
 *      updated in place; otherwise a new version row (is_active=false) is
 *      inserted. Publishing is a separate explicit step (/api/stations/publish)
 *      — the active version is never mutated here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { StationDraftSaveBody } from '@/lib/schemas/stations';
import { validateStationConfig } from '@/lib/stations/validate';
import type { StationConfig } from '@/lib/stations/contract';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { upsertStationDraft } from '@/lib/stations/draft-store';

export const dynamic = 'force-dynamic';

interface DbRow {
  id: number;
  page_key: string;
  mode_key: string;
  label: string;
  workflow_node_id: string | null;
  config: StationConfig;
  version: number;
  is_active: boolean;
  updated_by: number | null;
  updated_at: string;
}

function toApi(row: DbRow) {
  return {
    id: row.id,
    pageKey: row.page_key,
    modeKey: row.mode_key,
    label: row.label,
    workflowNodeId: row.workflow_node_id,
    config: row.config,
    version: row.version,
    isActive: row.is_active,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const page = (req.nextUrl.searchParams.get('page') || '').trim();
    if (!page) {
      return NextResponse.json({ success: false, error: 'page is required' }, { status: 400 });
    }

    // Active rows + the single newest row per mode (the draft candidate).
    const { rows } = await tenantQuery<DbRow>(
      ctx.organizationId,
      `SELECT DISTINCT ON (mode_key, is_active)
              id, page_key, mode_key, label, workflow_node_id, config,
              version, is_active, updated_by, updated_at::text
         FROM station_definitions
        WHERE organization_id = $1 AND page_key = $2
        ORDER BY mode_key, is_active, version DESC`,
      [ctx.organizationId, page],
    );

    const active = rows.filter((r) => r.is_active).map(toApi);
    const canManage = ctx.permissions.has('stations.manage');
    // A "draft" is the newest non-active row strictly newer than the mode's
    // active version (or any non-active row when nothing is published yet).
    const drafts = canManage
      ? rows
          .filter((r) => !r.is_active)
          .filter((r) => {
            const act = active.find((a) => a.modeKey === r.mode_key);
            return !act || r.version > act.version;
          })
          .map(toApi)
      : [];

    return NextResponse.json({ success: true, definitions: active, drafts, canManage });
  } catch (error) {
    return errorResponse(error, 'GET /api/stations');
  }
}, { permission: 'dashboard.view' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(StationDraftSaveBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const issues = validateStationConfig(parsed.config as StationConfig);
    if (issues.length > 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CONFIG', issues },
        { status: 422 },
      );
    }

    // The upsert (update the newer-than-active draft in place, or insert a
    // new version row) is the shared store every draft writer uses —
    // restore, cherry-pick and the assistant go through the same statement.
    // Idempotency-Key headers are intentionally not honored: the upsert IS the idempotency story — a
    // retried save lands on the same draft row, and a surplus version row in
    // the worst race is harmless (publish targets an explicit id).
    const draft = await withTenantTransaction(ctx.organizationId, async (client) => {
      const row = await upsertStationDraft(client, ctx.organizationId, {
        pageKey: parsed.pageKey,
        modeKey: parsed.modeKey,
        label: parsed.label,
        workflowNodeId: parsed.workflowNodeId ?? null,
        config: parsed.config as StationConfig,
        staffId: ctx.staffId,
      });
      if (!row) return null;

      await recordAudit(client, ctx, req, {
        source: 'stations-api',
        action: AUDIT_ACTION.STATION_DRAFT_SAVE,
        entityType: AUDIT_ENTITY.STATION_DEFINITION,
        entityId: row.id,
        after: { pageKey: row.page_key, modeKey: row.mode_key, version: row.version },
      });

      return row;
    });

    if (!draft) {
      return NextResponse.json(
        { success: false, error: 'Draft upsert produced no row' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, draft: toApi(draft) });
  } catch (error) {
    return errorResponse(error, 'POST /api/stations');
  }
}, { permission: 'stations.manage' });
