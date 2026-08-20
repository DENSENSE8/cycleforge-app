/**
 * One HTTP shape for every counter-session route.
 *
 * Nine route files map the same domain results to the same responses, so the
 * mapping lives here rather than being retyped nine times — the way two of them
 * would eventually disagree about whether a lost version race is a 409 or a 200
 * with a stale body.
 *
 * **A conflict always carries the current snapshot.** That is the entire client
 * contract for D3: the caller does not retry blind, it re-renders from what the
 * server says is true. A bare `409 {error}` would force a second round trip at
 * exactly the moment two people are editing the same cart.
 */

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

/**
 * Desk response: the full snapshot plus the event to publish.
 *
 * The event travels in the body so the caller that mutated can hand it straight
 * to the channel publisher without re-deriving it — and so a client whose
 * socket is down still learns the exact version it just produced.
 */
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

/**
 * Device response: the D6 projection, never the raw snapshot.
 *
 * Note the conflict branch also projects. A 409 body is still a body a stranger
 * can read off an unattended screen, and it would be a strange place to leak
 * the lease holder's name after taking such care with the success path.
 */
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

/**
 * The `channel` the tablet should subscribe to travels with the payload.
 *
 * The device cannot build it: the name is `org:{orgId}:kiosk:{deviceId}` and a
 * tablet knows neither id — its principal lives in an httpOnly cookie. Handing
 * it the name discloses nothing it is not already authorized for (its Ably
 * token grants exactly this one channel and nothing else), and it avoids a
 * second endpoint whose only job is to echo two ids.
 *
 * A device asking for a session it is not bound to gets `null`, not a 404.
 *
 * "There is no session here" is the tablet's normal idle state (it falls back
 * to its standalone local cart), not an error — and a 404 that distinguished
 * "no session" from "not yours" would be an existence oracle on an unattended
 * device.
 */
export function deviceSnapshot(
  snapshot: CounterSessionSnapshot | null,
  channel?: string,
): NextResponse {
  return NextResponse.json(
    { session: snapshot ? projectForDevicePrincipal(snapshot) : null, channel },
    { headers: NO_STORE },
  );
}

/**
 * Session id from the request path.
 *
 * **`withAuth` does not forward Next's route params** (see the note in
 * `api/failure-modes/[id]/route.ts`), so every dynamic route in this family
 * reads its ids from the pathname. Parsed by NAME — the segment after
 * `session` — not by position, so `/session/12/lines/{uuid}` and `/session/12`
 * both resolve with one rule and a future nested segment does not silently
 * shift an index.
 */
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
