import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { syncTsnToSerialUnit } from '@/lib/neon/serial-units-queries';
import { refreshLineSerialProjectionSafe } from '@/lib/receiving/serial-projection';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { attachTechSerial } from '@/lib/inventory/tech-serial';

type SerialRow = {
  id: number;
  serial_number: string;
  serial_type: string;
  tested_by: number | null;
  station_source: string;
  receiving_line_id: number | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeSerial(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeRow(row: SerialRow) {
  return {
    id: Number(row.id),
    serial_number: row.serial_number,
    serial_type: row.serial_type,
    tested_by: row.tested_by != null ? Number(row.tested_by) : null,
    station_source: row.station_source,
    receiving_line_id: row.receiving_line_id != null ? Number(row.receiving_line_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const receivingLineId = Number(searchParams.get('receiving_line_id'));

    if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
      return NextResponse.json(
        { success: false, error: 'receiving_line_id is required' },
        { status: 400 },
      );
    }

    const result = await tenantQuery<SerialRow>(
      ctx.organizationId,
      `SELECT id, serial_number, serial_type, tested_by, station_source, receiving_line_id,
              created_at::text, updated_at::text
       FROM tech_serial_numbers
       WHERE station_source = 'RECEIVING'
         AND receiving_line_id = $1
         AND organization_id = $2
       ORDER BY created_at ASC, id ASC`,
      [receivingLineId, ctx.organizationId],
    );

    return NextResponse.json({
      success: true,
      serials: result.rows.map(normalizeRow),
      count: result.rowCount ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receiving serials';
    console.error('receiving/serials GET failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'receiving.view' });

export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const receivingLineId = Number(body?.receiving_line_id);
    const serialNumber = normalizeSerial(body?.serial_number ?? body?.serial);
    const serialType = String(body?.serial_type || 'SERIAL').trim().toUpperCase() || 'SERIAL';
    // Server-trusted actor from the verified session cookie.
    const testedBy = ctx.staffId;

    if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
      return NextResponse.json(
        { success: false, error: 'receiving_line_id is required' },
        { status: 400 },
      );
    }
    if (!serialNumber) {
      return NextResponse.json(
        { success: false, error: 'serial_number is required' },
        { status: 400 },
      );
    }

    const { lineReceivingId, inserted, notFound } = await withTenantTransaction(
      ctx.organizationId,
      async (client) => {
        const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
          `SELECT id, receiving_id
           FROM receiving_line
           WHERE id = $1
             AND organization_id = $2
           LIMIT 1`,
          [receivingLineId, ctx.organizationId],
        );
        if (lineRes.rows.length === 0) {
          return { lineReceivingId: null, inserted: null, notFound: true };
        }

        const attached = await attachTechSerial({
          serialNumber,
          serialType,
          testedBy,
          stationSource: 'RECEIVING',
          receivingLineId,
          organizationId: ctx.organizationId,
        }, client, ctx.organizationId);
        if (attached.id == null) {
          const duplicate = new Error('Serial already exists for this receiving line') as Error & { code?: string };
          duplicate.code = '23505';
          throw duplicate;
        }
        const insertedRes = await client.query<SerialRow>(
          `SELECT id, serial_number, serial_type, tested_by, station_source, receiving_line_id,
                  created_at::text, updated_at::text
             FROM tech_serial_numbers
            WHERE id = $1 AND organization_id = $2::uuid`,
          [attached.id, ctx.organizationId],
        );

        return {
          lineReceivingId: lineRes.rows[0]?.receiving_id ?? null,
          inserted: insertedRes.rows[0] ?? null,
          notFound: false,
        };
      },
    );

    if (notFound || !inserted) {
      return NextResponse.json(
        { success: false, error: `receiving_line ${receivingLineId} not found` },
        { status: 404 },
      );
    }

    await invalidateReceivingViews(ctx.organizationId);
    if (lineReceivingId != null) {
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(lineReceivingId),
        source: 'receiving.serials.create',
      });
    }

    // Register the new TSN row in the serial_units master and stamp the
    // FK back. Background — the TSN insert has already committed and the
    // response doesn't need to wait.
    const tsnRow = inserted;
    // Synchronous sync so the next GET (include=serials) always sees a
    // serial_units row — operators were racing the old `after()` job and
    // getting empty chip lists right after logging a supplemental SN.
    await syncTsnToSerialUnit({
      id: Number(tsnRow.id),
      serial_number: tsnRow.serial_number,
      station_source: tsnRow.station_source,
      tested_by: tsnRow.tested_by,
      receiving_line_id: tsnRow.receiving_line_id,
    }, undefined, ctx.organizationId);

    // Best-effort denorm so list chips match the TSN just logged (never fail POST).
    await refreshLineSerialProjectionSafe(ctx.organizationId, receivingLineId);

    return NextResponse.json(
      { success: true, serial: normalizeRow(inserted) },
      { status: 201 },
    );
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'Serial already exists for this receiving line' },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create receiving serial';
    console.error('receiving/serials POST failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, {
  permission: 'receiving.mark_received',
  audit: {
    source: 'receiving.serials.create',
    action: AUDIT_ACTION.SERIAL_CREATE,
    entityType: AUDIT_ENTITY.TECH_SERIAL,
    entityId: ({ response }) => {
      const r = response as { serial?: { id?: number | string } } | null;
      return r?.serial?.id ?? null;
    },
  },
});

export const DELETE = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid id is required' },
        { status: 400 },
      );
    }

    const deleted = await withTenantTransaction(
      ctx.organizationId,
      (client) =>
        client.query<{ id: number; receiving_line_id: number | null; receiving_id: number | null }>(
          `DELETE FROM tech_serial_numbers tsn
           USING receiving_line rl
           WHERE tsn.id = $1
             AND tsn.station_source = 'RECEIVING'
             AND rl.id = tsn.receiving_line_id
             AND tsn.organization_id = $2
           RETURNING tsn.id, tsn.receiving_line_id, rl.receiving_id`,
          [id, ctx.organizationId],
        ),
    );

    if (deleted.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Receiving serial not found' },
        { status: 404 },
      );
    }

    const deletedLineId = deleted.rows[0]?.receiving_line_id;
    if (deletedLineId != null) {
      await refreshLineSerialProjectionSafe(ctx.organizationId, deletedLineId);
    }

    await invalidateReceivingViews(ctx.organizationId);
    if (deleted.rows[0]?.receiving_id != null) {
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(deleted.rows[0].receiving_id),
        source: 'receiving.serials.delete',
      });
    }
    return NextResponse.json({ success: true, id: Number(deleted.rows[0].id) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete receiving serial';
    console.error('receiving/serials DELETE failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, {
  permission: 'receiving.mark_received',
  audit: {
    source: 'receiving.serials.delete',
    action: AUDIT_ACTION.SERIAL_DELETE,
    entityType: AUDIT_ENTITY.TECH_SERIAL,
    entityId: ({ response }) => (response as { id?: number | string } | null)?.id ?? null,
  },
});
