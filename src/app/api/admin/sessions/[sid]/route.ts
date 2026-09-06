/**
 * DELETE /api/admin/sessions/[sid] — revoke a specific session.
 *
 * The path segment is the opaque session HANDLE (what GET /api/admin/sessions
 * and the staff-detail envelope now return in their `sid` field), never a
 * bearer sid. It is resolved against the caller's own organization, so this
 * route can no longer revoke another tenant's session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveSessionByHandle, revokeSession } from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';

export const runtime = 'nodejs';

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const segment = req.nextUrl.pathname.split('/').filter(Boolean).pop();
  if (!segment) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const handle = decodeURIComponent(segment);
  // Org-scoped resolution: an unknown, already-revoked, expired or
  // cross-tenant handle yields no row → 404, never a foreign revocation.
  const match = await resolveSessionByHandle(handle, ctx.organizationId);
  if (!match) {
    await audit({
      staffId: ctx.staffId, sid: ctx.session?.sid ?? null,
      event: 'session.revoked', result: 'denied',
      detail: { targetHandle: handle.slice(0, 16), reason: 'not-found' },
    });
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  await revokeSession(match.sid);
  await audit({
    staffId: ctx.staffId, sid: ctx.session?.sid ?? null,
    event: 'session.revoked', result: 'ok',
    detail: { targetHandle: match.handle, targetStaffId: match.staffId },
  });
  return NextResponse.json({ ok: true });
}, { permission: 'admin.view_sessions' });
