import { NextRequest, NextResponse } from 'next/server';
import {
  getRooms,
  renameRoom,
  setRoomZoneLetter,
  updateLocation,
  bulkSoftDeleteLocations,
  previewLocationDeletion,
  type Location,
} from '@/lib/neon/location-queries';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';

function roomSnapshot(rooms: Location[], name: string): Location | null {
  const key = name.trim();
  return (
    rooms.find(
      (r) =>
        !r.row_label &&
        !r.col_label &&
        ((r.room || '').trim() === key || (r.name || '').trim() === key),
    ) ?? null
  );
}

/** PATCH /api/rooms/[room] Body: */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const gate = await requireRoutePerm(req, 'sku_stock.manage');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { room } = await params;
  const oldName = decodeURIComponent(room).trim();
  if (!oldName) {
    return NextResponse.json({ error: 'Current room name required' }, { status: 400 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const newName = typeof body?.name === 'string' ? body.name.trim() : '';
    const zoneLetterRaw =
      typeof body?.zoneLetter === 'string' ? body.zoneLetter : undefined;
    // Treat empty string as "clear", undefined as "don't touch."
    const zoneLetter =
      zoneLetterRaw === undefined
        ? undefined
        : zoneLetterRaw.trim().toUpperCase().charAt(0) || null;
    const description =
      typeof body?.description === 'string'
        ? body.description.trim() || null
        : undefined;

    let renameResult = { updated: 0, barcodesRekeyed: 0 };
    let didRename = false;
    if (newName && newName !== oldName) {
      // Tenant-scoped:
      renameResult = await renameRoom(oldName, newName, orgId);
      if (renameResult.updated === 0 && renameResult.barcodesRekeyed === 0) {
        return NextResponse.json(
          { error: 'Room could not be renamed — the new name may already exist or the old room is gone.' },
          { status: 409 },
        );
      }
      didRename = true;
    }

    const targetName = didRename ? newName : oldName;

    let letterResult: { ok: true } | { ok: false; reason: 'duplicate' | 'not_found' } | null = null;
    if (zoneLetter !== undefined) {
      // Tenant-scoped: setRoomZoneLetter gates its UPDATE WHERE clauses on
      // organization_id so we never re-letter another tenant's room.
      letterResult = await setRoomZoneLetter(targetName, zoneLetter, orgId);
      if (!letterResult.ok && letterResult.reason === 'duplicate') {
        return NextResponse.json(
          { error: 'Another room is already using that zone letter' },
          { status: 409 },
        );
      }
      if (!letterResult.ok && letterResult.reason === 'not_found' && !didRename) {
        return NextResponse.json(
          { error: 'Room not found' },
          { status: 404 },
        );
      }
    }

    if (description !== undefined) {
      const before = await getRooms(orgId);
      const target = roomSnapshot(before, targetName);
      if (!target) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      await updateLocation(target.id, { description }, orgId);
    }

    if (!didRename && letterResult === null && description === undefined) {
      return NextResponse.json({ success: true, updated: 0, barcodesRekeyed: 0, room: null });
    }

    // Authoritative parent row for shared-cache setQueryData (before refetch).
    const rooms = await getRooms(orgId);
    const room = roomSnapshot(rooms, targetName);

    return NextResponse.json({ success: true, ...renameResult, room });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json(
        { error: 'A room with that name already exists' },
        { status: 409 },
      );
    }
    console.error('[PATCH /api/rooms/[room]] error:', err);
    return NextResponse.json({ error: 'Failed', details: err?.message }, { status: 500 });
  }
}

/** DELETE /api/rooms/[room] — soft-delete the room + all its bins. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const gate = await requireRoutePerm(req, 'bin.remove');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { room } = await params;
  const name = decodeURIComponent(room).trim();
  if (!name) {
    return NextResponse.json({ error: 'Room name required' }, { status: 400 });
  }
  try {
    const targets = await previewLocationDeletion({ room: name }, orgId);
    if (targets.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    const blocked = targets.filter((target) => !target.deletable);
    if (blocked.length > 0) {
      return NextResponse.json({
        error: 'Room still contains active stock, LPNs or staged work',
        blocked: blocked.map((target) => ({ id: target.id, face: target.face, reasons: target.blockedReasons })),
      }, { status: 409 });
    }
    const result = await bulkSoftDeleteLocations(targets.map((target) => target.id), orgId);
    return NextResponse.json({ success: true, deactivated: result.deactivated });
  } catch (err: any) {
    console.error('[DELETE /api/rooms/[room]] error:', err);
    return NextResponse.json({ error: 'Failed', details: err?.message }, { status: 500 });
  }
}
