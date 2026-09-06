/**
 * GET /api/stations/history?page=<pageKey>[&mode=<modeKey>] — every version of
 * a station, newest first, with who saved it and whether it is the live one.
 *
 * Versions are immutable rows (`station_definitions`), so this is the
 * reversibility ledger: any row here can be restored (`/api/stations/restore`)
 * or mined for one block (`/api/stations/cherry-pick`). Gated
 * `stations.manage` like the draft read — drafts and old configs are builder
 * material, not floor material.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { toStationApi, type StationDefinitionDbRow } from '@/lib/stations/draft-store';

export const dynamic = 'force-dynamic';

const KEY_RE = /^[a-z0-9_-]{1,64}$/i;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const page = (req.nextUrl.searchParams.get('page') || '').trim();
    const mode = (req.nextUrl.searchParams.get('mode') || '').trim();
    if (!KEY_RE.test(page)) {
      return NextResponse.json({ success: false, error: 'page is required' }, { status: 400 });
    }
    if (mode && !KEY_RE.test(mode)) {
      return NextResponse.json({ success: false, error: 'mode is invalid' }, { status: 400 });
    }

    const params: unknown[] = [ctx.organizationId, page];
    if (mode) params.push(mode);
    const { rows } = await tenantQuery<StationDefinitionDbRow & { updated_by_name: string | null }>(
      ctx.organizationId,
      `SELECT sd.id, sd.page_key, sd.mode_key, sd.label, sd.workflow_node_id, sd.config,
              sd.version, sd.is_active, sd.updated_by, sd.updated_at::text,
              s.name AS updated_by_name
         FROM station_definitions sd
         LEFT JOIN staff s ON s.id = sd.updated_by AND s.organization_id = sd.organization_id
        WHERE sd.organization_id = $1 AND sd.page_key = $2${mode ? ' AND sd.mode_key = $3' : ''}
        ORDER BY sd.mode_key ASC, sd.version DESC`,
      params,
    );

    return NextResponse.json({
      success: true,
      versions: rows.map((r) => ({ ...toStationApi(r), updatedByName: r.updated_by_name })),
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/stations/history');
  }
}, { permission: 'stations.manage' });
