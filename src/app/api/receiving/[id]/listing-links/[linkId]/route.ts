/**
 * Carton listing links — one row.
 *
 *   PATCH  /api/receiving/[id]/listing-links/[linkId]  → edit href / label / binding
 *   DELETE /api/receiving/[id]/listing-links/[linkId]  → remove it
 *
 * Binding to a line carries `bound_by` from the session staff — never the body,
 * and never inferred (see `listing-link-store`).
 */

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { deleteListingLink, updateListingLink } from '@/lib/receiving/listing-link-store';
import { listingLinkErrorStatus } from '../route';

function idsFromPath(pathname: string): { receivingId: number; linkId: number } {
  const segments = pathname.split('/').filter(Boolean);
  // .../api/receiving/[id]/listing-links/[linkId]
  return {
    receivingId: Number(segments[segments.length - 3]),
    linkId: Number(segments[segments.length - 1]),
  };
}

export const PATCH = withAuth(async (request, ctx) => {
  const { receivingId, linkId } = idsFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(linkId)) {
    return NextResponse.json({ success: false, error: 'invalid link id' }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    href?: unknown;
    label?: unknown;
    receiving_line_id?: unknown;
  };

  const result = await updateListingLink(ctx.organizationId, {
    id: linkId,
    href: typeof body.href === 'string' ? body.href : undefined,
    label: body.label === null || typeof body.label === 'string' ? (body.label as string | null) : undefined,
    receivingLineId:
      body.receiving_line_id === undefined
        ? undefined
        : body.receiving_line_id === null
          ? null
          : Number(body.receiving_line_id),
    boundBy: ctx.staffId ?? null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: listingLinkErrorStatus(result.error) },
    );
  }

  await recordAudit(pool, ctx, request, {
    source: 'receiving-listing-links',
    action: AUDIT_ACTION.RECEIVING_LISTING_LINK_WRITE,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: receivingId,
    method: 'manual',
    after: {
      listing_link_id: result.value.id,
      href: result.value.href,
      label: result.value.label,
      receiving_line_id: result.value.receivingLineId,
    },
  });

  return NextResponse.json({ success: true, link: result.value });
}, { permission: 'receiving.view' });

export const DELETE = withAuth(async (request, ctx) => {
  const { receivingId, linkId } = idsFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(linkId)) {
    return NextResponse.json({ success: false, error: 'invalid link id' }, { status: 400 });
  }

  const result = await deleteListingLink(ctx.organizationId, linkId);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: listingLinkErrorStatus(result.error) },
    );
  }

  await recordAudit(pool, ctx, request, {
    source: 'receiving-listing-links',
    action: AUDIT_ACTION.RECEIVING_LISTING_LINK_WRITE,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: receivingId,
    method: 'manual',
    before: { listing_link_id: linkId },
  });

  return NextResponse.json({ success: true, id: result.value.id });
}, { permission: 'receiving.view' });
