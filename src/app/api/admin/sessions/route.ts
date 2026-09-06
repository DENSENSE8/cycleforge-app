/**
 * GET /api/admin/sessions
 *
 * Lists every active staff session for the admin "active sessions" view.
 *
 * The `sid` field carries the opaque session HANDLE, never the bearer sid —
 * the key name is unchanged so the existing UI (and the DELETE
 * /api/admin/sessions/[handle] call it makes with this value) keeps working,
 * but the value can no longer be replayed as a `cf_sid` cookie.
 */

import { NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { sessionHandle } from '@/lib/auth/session';

export const runtime = 'nodejs';

interface ActiveSessionRow {
  sid: string;
  staff_id: number;
  staff_name: string | null;
  device_kind: string;
  device_label: string | null;
  ip: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

export const GET = withAuth(async (_req, ctx) => {
  // Tenant ownership filter — never list another org's sessions. The
  // staff_sessions ↔ staff join is on the integer surrogate PK (safe bare).
  const r = await tenantQuery<ActiveSessionRow>(
    ctx.organizationId,
    `SELECT s.sid, s.staff_id, st.name AS staff_name,
            s.device_kind, s.device_label, s.ip::text AS ip,
            s.created_at, s.last_seen_at, s.expires_at
       FROM staff_sessions s
       JOIN staff st ON st.id = s.staff_id
      WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
        AND s.organization_id = $1
      ORDER BY s.last_seen_at DESC`,
    [ctx.organizationId],
  );
  // Swap the raw sid for its handle before the row leaves the server.
  const sessions = r.rows.map((row) => ({ ...row, sid: sessionHandle(row.sid) }));
  return NextResponse.json({ sessions });
}, { permission: 'admin.view_sessions' });
