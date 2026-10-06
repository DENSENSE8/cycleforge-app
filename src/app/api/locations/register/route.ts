import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { registerLocationsAudited } from '@/lib/locations/location-registration';
import type { LocationSegments } from '@/lib/barcode-routing';

/** POST /api/locations/register */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({}));
  const room = String(body?.room ?? '').trim();
  const segmentsIn = Array.isArray(body?.segments) ? body.segments : [];
  if (!room) {
    return NextResponse.json({ error: 'room is required' }, { status: 400 });
  }
  if (segmentsIn.length === 0) {
    return NextResponse.json({ error: 'segments[] is required' }, { status: 400 });
  }
  if (segmentsIn.length > 500) {
    return NextResponse.json(
      { error: 'Too many segments — max 500 per call' },
      { status: 400 },
    );
  }

  const segments: LocationSegments[] = [];
  for (const raw of segmentsIn) {
    const zone = String(raw?.zone ?? '').trim().toUpperCase();
    const aisle = Number(raw?.aisle);
    const bay = Number(raw?.bay);
    const level = Number(raw?.level);
    const position = Number(raw?.position);
    if (!/^[A-Z]$/.test(zone)) {
      return NextResponse.json(
        { error: `Invalid zone letter "${zone}" — expected A–Z` },
        { status: 400 },
      );
    }
    if (![aisle, bay, level].every((n) => Number.isFinite(n) && n >= 1 && n <= 99)) {
      return NextResponse.json(
        { error: 'aisle/bay/level must each be a number in 1..99' },
        { status: 400 },
      );
    }
    // position=0 is the rack-label sentinel (whole-rack label printed
    // by the location label printer). Positioned location labels use 1..99.
    if (!Number.isFinite(position) || position < 0 || position > 99) {
      return NextResponse.json(
        { error: 'position must be 0 (rack label) or 1..99 (location label)' },
        { status: 400 },
      );
    }
    segments.push({
      zone,
      aisle: Math.floor(aisle),
      bay: Math.floor(bay),
      level: Math.floor(level),
      position: Math.floor(position),
    });
  }

  const result = await registerLocationsAudited(req, ctx, {
    room,
    segments,
    binType: typeof body?.binType === 'string' ? body.binType.trim() || null : null,
    capacity: typeof body?.capacity === 'number' ? body.capacity : null,
  });

  return NextResponse.json({ success: true, ...result });
}, { permission: 'print.label' });
