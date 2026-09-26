import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { renderRepairPaperHtml } from '@/lib/repair/render-repair-paper';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/repair-service/print/[id] - Render printable repair service form */
export const GET = withAuth(async (req: NextRequest, ctx) => {
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
}, { permission: 'repair.view' });
