/**
 * GET /api/receiving/inbound/orders/<id> — one landed inbound order as the
 * draft the inbound form edits ("fix a wrong import"). Read-only; the
 * correction lands through POST /api/receiving/inbound/orders (the one writer).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadInboundOrderEdit } from '@/lib/inbound/load-inbound-order-edit';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const id = Number(request.nextUrl.pathname.split('/').filter(Boolean).at(-1));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, error: 'a numeric inbound order id is required' }, { status: 400 });
  }
  const record = await loadInboundOrderEdit(ctx.organizationId, id);
  if (!record) return NextResponse.json({ success: false, error: `Inbound order ${id} not found` }, { status: 404 });
  return NextResponse.json({ success: true, record });
}, { permission: 'receiving.view' });
