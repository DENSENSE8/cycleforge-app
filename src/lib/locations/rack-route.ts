/** Shared plumbing for the thin `/api/racks/**` handlers. */

import 'server-only';

import { NextResponse } from 'next/server';
import type { AuthContext } from '@/lib/auth/withAuth';
import { commitIsPhoneOrigin } from '@/lib/auth/phone-origin.server';
import type { RackActor, RackOutcome } from '@/lib/locations/racks';
import type { RackErrorBody } from '@/lib/locations/rack-types';

/** Actor from the server session; phone origin from the session anchor, never the body. */
export async function rackActor(ctx: AuthContext): Promise<RackActor> {
  const phoneOrigin = await commitIsPhoneOrigin({
    session: ctx.session,
    organizationId: ctx.organizationId,
    staffId: ctx.staffId,
    mobileScanEventId: null,
  });
  return { organizationId: ctx.organizationId, staffId: ctx.staffId, phoneOrigin };
}

export function rackResponse<T>(out: RackOutcome<T>): NextResponse {
  return out.ok
    ? NextResponse.json(out.body, { status: out.status })
    : NextResponse.json(out.error, { status: out.status });
}

export function rackInvalid(error: RackErrorBody): NextResponse {
  return NextResponse.json(error, { status: 400 });
}

/** Unexpected failure → 500; a write losing a per-org barcode/name uniqueness race → 409. */
export function rackRouteError(err: unknown, route: string): NextResponse {
  if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
    const body: RackErrorBody = { error: 'Another location already uses one of these codes or names', code: 'invalid' };
    return NextResponse.json(body, { status: 409 });
  }
  console.error(`Error in ${route}:`, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}
