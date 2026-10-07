/** POST /api/receiving/lines/[id]/stage */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { extractArrivalLocationBarcode } from '@/lib/receiving/arrival-command-routing';

type StageRow = {
  staged_at: string | null;
  staged_location_id: number | null;
  location_name: string | null;
  location_barcode: string | null;
  location_room: string | null;
};

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const lineId = Number(segments[segments.indexOf('lines') + 1]);
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmed?: unknown;
      barcode?: unknown;
      location_id?: unknown;
    };
    if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'confirmed must be a boolean' },
        { status: 400 },
      );
    }
    const confirmed = body.confirmed !== false;
    const staffId = Number(ctx.staffId) || null;

    let barcode = typeof body.barcode === 'string' ? body.barcode.trim() : '';
    if (barcode) {
      barcode = extractArrivalLocationBarcode(barcode) ?? barcode;
    }
    const locationIdRaw = Number(body.location_id);
    const locationIdFromBody =
      Number.isFinite(locationIdRaw) && locationIdRaw > 0 ? Math.floor(locationIdRaw) : null;

    if (confirmed && !barcode && !locationIdFromBody) {
      return NextResponse.json(
        { success: false, error: 'barcode or location_id is required' },
        { status: 400 },
      );
    }

    type TxResult =
      | { ok: false; status: number; error: string }
      | {
          ok: true;
          receiving_id: number | null;
          staged_at: string | null;
          staged_location_id: number | null;
          location: {
            id: number;
            name: string;
            barcode: string | null;
            room: string | null;
          } | null;
        };

    const result = await withTenantTransaction<TxResult>(ctx.organizationId, async (client) => {
      const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
        `SELECT id, receiving_id FROM receiving_line
          WHERE id = $1 AND organization_id = $2
          FOR UPDATE`,
        [lineId, ctx.organizationId],
      );
      const line = lineRes.rows[0];
      if (!line) return { ok: false, status: 404, error: `line ${lineId} not found` };

      if (!confirmed) {
        await client.query(
          `INSERT INTO receiving_line_putaway (
              receiving_line_id, organization_id, staged_location_id, staged_at, staged_by)
           VALUES ($1, $2, NULL, NULL, NULL)
           ON CONFLICT (receiving_line_id) DO UPDATE SET
             staged_location_id = NULL,
             staged_at = NULL,
             staged_by = NULL,
             updated_at = now()`,
          [lineId, ctx.organizationId],
        );
        return {
          ok: true,
          receiving_id: line.receiving_id,
          staged_at: null,
          staged_location_id: null,
          location: null,
        };
      }

      type LocRow = {
        id: number;
        name: string;
        barcode: string | null;
        room: string | null;
        is_active: boolean;
      };
      let loc: LocRow | null = null;
      if (locationIdFromBody) {
        const r = await client.query<LocRow>(
          `SELECT id, name, barcode, room, is_active
             FROM locations
            WHERE id = $1 AND organization_id = $2
            LIMIT 1`,
          [locationIdFromBody, ctx.organizationId],
        );
        loc = r.rows[0] ?? null;
      } else {
        const r = await client.query<LocRow>(
          `SELECT id, name, barcode, room, is_active
             FROM locations
            WHERE organization_id = $2
              AND (barcode = $1 OR LOWER(name) = LOWER($1))
            LIMIT 1`,
          [barcode, ctx.organizationId],
        );
        loc = r.rows[0] ?? null;
      }
      if (!loc) {
        return { ok: false, status: 404, error: `Location not found: ${barcode || locationIdFromBody}` };
      }
      if (!loc.is_active) {
        return { ok: false, status: 400, error: `Location inactive: ${loc.name}` };
      }

      const upsert = await client.query<StageRow>(
        `INSERT INTO receiving_line_putaway (
            receiving_line_id, organization_id,
            staged_location_id, staged_at, staged_by,
            location_code, bin)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)
         ON CONFLICT (receiving_line_id) DO UPDATE SET
           staged_location_id = EXCLUDED.staged_location_id,
           staged_at = EXCLUDED.staged_at,
           staged_by = EXCLUDED.staged_by,
           location_code = EXCLUDED.location_code,
           bin = EXCLUDED.bin,
           updated_at = now()
         RETURNING
           staged_at::text AS staged_at,
           staged_location_id,
           NULL::text AS location_name,
           NULL::text AS location_barcode,
           NULL::text AS location_room`,
        [lineId, ctx.organizationId, loc.id, staffId, loc.barcode ?? loc.name, loc.name],
      );

      return {
        ok: true,
        receiving_id: line.receiving_id,
        staged_at: upsert.rows[0]?.staged_at ?? null,
        staged_location_id: loc.id,
        location: {
          id: loc.id,
          name: loc.name,
          barcode: loc.barcode,
          room: loc.room,
        },
      };
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await recordAudit(pool, ctx, request, {
      source: 'receiving.lines.stage',
      action: confirmed
        ? AUDIT_ACTION.RECEIVING_STAGE_CONFIRMED
        : AUDIT_ACTION.RECEIVING_STAGE_REOPENED,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: lineId,
      after: {
        staged: confirmed,
        staged_location_id: result.staged_location_id,
        location_name: result.location?.name ?? null,
      },
      method: confirmed ? 'scan' : 'manual',
      binCode: result.location?.barcode ?? result.location?.name ?? undefined,
    });

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        if (result.receiving_id != null) {
          await publishReceivingLogChanged({
            organizationId: ctx.organizationId,
            action: 'update',
            rowId: String(result.receiving_id),
            // The line's new putaway face — an open Unbox desk repaints its
            // Location pill from this when the phone placed the line.
            row: {
              receiving_line_id: lineId,
              staged_at: result.staged_at,
              staged_location_id: result.staged_location_id,
              staged_location_name: result.location?.name ?? null,
              staged_location_barcode: result.location?.barcode ?? null,
              staged_location_room: result.location?.room ?? null,
            },
            source: 'receiving.lines.stage',
          });
        }
      } catch (err) {
        console.warn('lines/stage: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({
      success: true,
      line: {
        id: lineId,
        staged_at: result.staged_at,
        staged_location_id: result.staged_location_id,
      },
      location: result.location,
    });
  },
  { permission: 'receiving.mark_received' },
);
