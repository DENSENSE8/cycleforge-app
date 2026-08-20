/**
 * Carton listing links — collection endpoints.
 *
 *   GET    /api/receiving/[id]/listing-links   → the buyer's ordered links
 *   POST   /api/receiving/[id]/listing-links   → append one
 *   PATCH  /api/receiving/[id]/listing-links   → rewrite the triage order
 *
 * Durable rows only (`receiving_listing_links`); the computed `catalog` /
 * `derived` tiers are resolved at read time by `collectCartonListingLinks` and
 * are not addressable here. Handlers stay thin — validate, delegate, map, audit.
 */

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  createListingLink,
  listCartonListingLinks,
  reorderListingLinks,
  type ListingLinkError,
} from '@/lib/receiving/listing-link-store';

export function receivingIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  // .../api/receiving/[id]/listing-links → id is segments[-2]
  return Number(segments[segments.length - 2]);
}

/** One error→status map so both route files answer the same way. */
export function listingLinkErrorStatus(error: ListingLinkError): number {
  switch (error) {
    case 'NOT_FOUND':
    case 'CARTON_NOT_FOUND':
      return 404;
    case 'DUPLICATE_HREF':
      return 409;
    default:
      return 400;
  }
}

export const GET = withAuth(async (request, ctx) => {
  const receivingId = receivingIdFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(receivingId)) {
    return NextResponse.json({ success: false, error: 'invalid carton id' }, { status: 400 });
  }
  const links = await listCartonListingLinks(ctx.organizationId, receivingId);
  return NextResponse.json({ success: true, links });
}, { permission: 'receiving.view' });

export const POST = withAuth(async (request, ctx) => {
  const receivingId = receivingIdFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(receivingId)) {
    return NextResponse.json({ success: false, error: 'invalid carton id' }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    href?: unknown;
    label?: unknown;
    receiving_line_id?: unknown;
  };
  if (typeof body.href !== 'string' || !body.href.trim()) {
    return NextResponse.json({ success: false, error: 'href is required' }, { status: 400 });
  }

  const result = await createListingLink(ctx.organizationId, {
    receivingId,
    href: body.href,
    label: typeof body.label === 'string' ? body.label : null,
    // A create never binds: binding is its own recorded act (bound_by/bound_at).
    receivingLineId: null,
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
    after: { listing_link_id: result.value.id, href: result.value.href, label: result.value.label },
  });

  return NextResponse.json({ success: true, link: result.value }, { status: 201 });
}, { permission: 'receiving.view' });

export const PATCH = withAuth(async (request, ctx) => {
  const receivingId = receivingIdFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(receivingId)) {
    return NextResponse.json({ success: false, error: 'invalid carton id' }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { ordered_ids?: unknown };
  const orderedIds = Array.isArray(body.ordered_ids)
    ? body.ordered_ids.map(Number).filter((n) => Number.isFinite(n))
    : null;
  if (!orderedIds) {
    return NextResponse.json({ success: false, error: 'ordered_ids is required' }, { status: 400 });
  }

  const links = await reorderListingLinks(ctx.organizationId, { receivingId, orderedIds });

  await recordAudit(pool, ctx, request, {
    source: 'receiving-listing-links',
    action: AUDIT_ACTION.RECEIVING_LISTING_LINK_WRITE,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: receivingId,
    method: 'manual',
    after: { reordered: orderedIds },
  });

  return NextResponse.json({ success: true, links });
}, { permission: 'receiving.view' });
