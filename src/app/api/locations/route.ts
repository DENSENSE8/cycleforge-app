import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { derivedRoomLabelSql, derivedRoomSetJoinSql, rackWalkOrderSql } from '@/lib/locations/derived-room';
import {
  getActiveLocations,
  getRooms,
  createLocation,
  getLowStockBins,
} from '@/lib/neon/location-queries';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * GET /api/locations — list active locations. ?type=zones for zone-only, ?type=low-stock for alerts.
 * ?room=<room> — that room's scannable locations in physical walk order (the
 * phone's ordinal location picker; same order and filter as the `walk` block
 * of `GET /api/locations/[barcode]`), with a cheap occupancy summary. The room
 * is DERIVED up `parent_id`, so a movable rack's shelves list in the room the
 * rack stands in now.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const type = req.nextUrl.searchParams.get('type');
  const room = req.nextUrl.searchParams.get('room')?.trim();

  const orgId = ctx.organizationId;

  if (room) {
    const result = await tenantQueryOneTrip<{ barcode: string; name: string; units: number; lpns: number }>(orgId, `
      SELECT BTRIM(l.barcode) AS barcode,
             l.name,
             COALESCE(bc.units, 0)::int AS units,
             COALESCE(hu.lpns, 0)::int AS lpns
        FROM locations l
        ${derivedRoomSetJoinSql('l', 'room', '$1')}
        LEFT JOIN LATERAL (
          SELECT SUM(b.qty) AS units
            FROM bin_contents b
           WHERE b.location_id = l.id AND b.organization_id = l.organization_id AND b.qty > 0
        ) bc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS lpns
            FROM handling_units h
           WHERE h.location_id = l.id AND h.organization_id = l.organization_id
        ) hu ON true
       WHERE l.organization_id = $1
         AND l.is_active = true
         AND NULLIF(BTRIM(l.barcode), '') IS NOT NULL
         AND ${derivedRoomLabelSql('l', 'room')} = $2
       ORDER BY ${rackWalkOrderSql('l.barcode')}, l.sort_order, l.row_label, l.col_label, l.name
    `, [orgId, room]);
    return NextResponse.json({
      room,
      locations: result.rows.map((row) => {
        const segments = parseLocationCodeFlat(row.barcode);
        return {
          barcode: row.barcode,
          name: row.name,
          face: segments ? locationCode(segments) : row.barcode,
          units: row.units,
          lpns: row.lpns,
        };
      }),
    });
  }

  if (type === 'rooms') {
    const rooms = await getRooms(orgId);
    return NextResponse.json({ locations: rooms });
  }

  if (type === 'low-stock') {
    const bins = await getLowStockBins(orgId);
    return NextResponse.json({ bins });
  }

  const locations = await getActiveLocations(orgId);

  // Build room → rows → cols structure for cascading picker
  const roomMap: Record<string, { rows: Record<string, string[]> }> = {};
  for (const loc of locations) {
    if (!loc.room || !loc.row_label || !loc.col_label) continue;
    if (!roomMap[loc.room]) roomMap[loc.room] = { rows: {} };
    if (!roomMap[loc.room].rows[loc.row_label]) roomMap[loc.room].rows[loc.row_label] = [];
    if (!roomMap[loc.room].rows[loc.row_label].includes(loc.col_label)) {
      roomMap[loc.room].rows[loc.row_label].push(loc.col_label);
    }
  }

  return NextResponse.json({ locations, roomStructure: roomMap });
}, { permission: 'sku_stock.view' });

/** POST /api/locations — create a new location */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const { name, room, description, barcode, sortOrder, rowLabel, colLabel, binType, capacity, parentId } = body as {
      name?: string;
      room?: string;
      description?: string;
      barcode?: string;
      sortOrder?: number;
      rowLabel?: string;
      colLabel?: string;
      binType?: string;
      capacity?: number;
      parentId?: number;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const orgId = ctx.organizationId;

    const location = await createLocation({
      name: name.trim(),
      room: room?.trim() || null,
      description: description?.trim() || null,
      barcode: barcode?.trim() || null,
      sortOrder,
      rowLabel: rowLabel?.trim() || null,
      colLabel: colLabel?.trim() || null,
      binType: binType?.trim() || null,
      capacity: capacity ?? null,
      parentId: parentId ?? null,
    }, orgId);

    await recordAudit(pool, ctx, req, {
      source: 'settings.locations',
      action: AUDIT_ACTION.BIN_CREATE,
      entityType: AUDIT_ENTITY.BIN,
      entityId: (location as any)?.id ?? name.trim(),
      after: {
        name: name.trim(),
        room: room?.trim() || null,
        barcode: barcode?.trim() || null,
        row_label: rowLabel?.trim() || null,
        col_label: colLabel?.trim() || null,
        bin_type: binType?.trim() || null,
        capacity: capacity ?? null,
      },
      binCode: barcode?.trim() || null,
      locationCode: name.trim(),
    });

    return NextResponse.json({ success: true, location });
  } catch (err: any) {
    if (err?.message?.includes('unique') || err?.code === '23505') {
      return NextResponse.json({ error: 'Location name already exists' }, { status: 409 });
    }
    console.error('[POST /api/locations] error:', err);
    return NextResponse.json(
      { error: 'Failed to create location', details: err?.message },
      { status: 500 },
    );
  }
}, { permission: 'sku_stock.manage' });
