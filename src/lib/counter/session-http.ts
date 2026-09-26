/** One HTTP shape for every counter-session route. */

import { NextResponse } from 'next/server';
import {
  COUNTER_SESSION_ERROR_STATUS,
  type CounterSessionResult,
} from './session-store';
import {
  projectForDevicePrincipal,
  type CounterSessionSnapshot,
} from './session-events';

/** No-store on every session response — a cached cart is a wrong cart. */
const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Desk response: */
export function deskResult(result: CounterSessionResult): NextResponse {
  if (result.ok) {
    return NextResponse.json(
      { snapshot: result.snapshot, event: result.event },
      { headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { error: result.code, snapshot: result.snapshot },
    { status: COUNTER_SESSION_ERROR_STATUS[result.code], headers: NO_STORE },
  );
}

/** Device response: */
export function deviceResult(result: CounterSessionResult, channel?: string): NextResponse {
  if (result.ok) {
    return NextResponse.json(
      { session: projectForDevicePrincipal(result.snapshot), channel },
      { headers: NO_STORE },
    );
  }
  return NextResponse.json(
    {
      error: result.code,
      session: result.snapshot ? projectForDevicePrincipal(result.snapshot) : null,
      channel,
    },
    { status: COUNTER_SESSION_ERROR_STATUS[result.code], headers: NO_STORE },
  );
}

export function deskSnapshot(snapshot: CounterSessionSnapshot | null): NextResponse {
  if (!snapshot) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ snapshot }, { headers: NO_STORE });
}

/** The `channel` the tablet should subscribe to travels with the payload. */
export function deviceSnapshot(
  snapshot: CounterSessionSnapshot | null,
  channel?: string,
): NextResponse {
  return NextResponse.json(
    { session: snapshot ? projectForDevicePrincipal(snapshot) : null, channel },
    { headers: NO_STORE },
  );
}

/** Session id from the request path. */
export function sessionIdFromPath(pathname: string): number | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('session');
  if (at === -1) return null;
  const id = Number(segments[at + 1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Line uuid from the request path — the segment after `lines`. */
export function lineUuidFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('lines');
  if (at === -1) return null;
  const raw = segments[at + 1];
  return raw && UUID_RE.test(raw) ? raw : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
