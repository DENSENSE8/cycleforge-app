import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { renderRepairPaperHtml } from '@/lib/repair/render-repair-paper';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/repair-service/print/[id] - Render printable repair service form
 *
 * withAuth's wrapped handler only receives (req, ctx) — it discards Next's
 * typed `{ params }` route arg (see withAuth.ts's RouteHandler comment) — so
 * the `[id]` segment is parsed from the pathname instead, same as other
 * dynamic routes wrapped in withAuth (e.g. warranty's `claimIdFromPath`).
 *
 * The document itself lives in `@/lib/repair/render-repair-paper` because the
 * kiosk tablet prints the SAME paper under a device cookie — this route only
 * decides that a staff session with `repair.view` may ask for it.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const segments = req.nextUrl.pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1] ?? '';
    const repairId = parseInt(id);

    if (isNaN(repairId)) {
      return NextResponse.json(
        { error: 'Invalid ID' },
        { status: 400 }
      );
    }

    const html = await renderRepairPaperHtml(ctx.organizationId as OrgId, repairId);

    if (html === null) {
      return NextResponse.json(
        { error: 'Repair not found' },
        { status: 404 }
      );
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: unknown) {
    console.error(`Error rendering repair form:`, error);
    return NextResponse.json(
      {
        error: 'Failed to render repair form',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}, { permission: 'repair.view' });
