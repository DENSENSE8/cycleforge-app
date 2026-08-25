import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { spineLookup } from '@/lib/inventory/spine-lookup';

/**
 * GET /api/inventory/spine?scan=<value> — the capstone read (00-endgame §8).
 * One scanned QR in, one truthful answer out: a location (what's here, what
 * was pulled into it) or a unit (where it is, where it came from, what's been
 * pulled from it). Location barcodes resolve first; then unit_uid, then
 * normalized serial. Read-only, no audit row.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const scan = (searchParams.get('scan') || '').trim();
    if (!scan) {
      return NextResponse.json(
        { success: false, error: 'scan query parameter is required' },
        { status: 400 },
      );
    }

    const answer = await spineLookup(ctx.organizationId, scan);
    if (!answer) {
      return NextResponse.json(
        { success: false, error: `Nothing in this organization matches '${scan}'.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, answer });
  } catch (error: unknown) {
    console.error('Error in GET /api/inventory/spine:', error);
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'placement.view' });
