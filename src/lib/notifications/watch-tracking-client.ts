/**
 * "Watch a tracking number", client side — the ONE implementation of the three
 * verbs, so the desk row and the phone face cannot drift.
 *
 * The desk asked for this control first ({@link InboxTrackingWatchRow}, inside
 * the header inbox panel), and `SURFACE_LAW` §1 immediately owes it a `/m`
 * twin. Two faces of one verb is exactly how a repo ends up with two slightly
 * different refusals for the same bad tracking number, so the fetch, the wire
 * shape and the error wording live HERE and both faces render them.
 *
 * It sits in `src/lib` rather than beside the desk row because of the boundary
 * law (`.dependency-cruiser.cjs` → `mobile-no-desktop-surface-components`):
 * `src/components/mobile/**` and `src/app/m/**` may not import
 * `src/components/quick-access/*`. `src/lib` is sanctioned for both surfaces,
 * which is what makes a shared verb possible at all.
 *
 * Deliberately React-free and DOM-free — no hook, no store, no `server-only`
 * import. A caller wraps these in whatever it already uses (`useState` on the
 * desk, `@tanstack/react-query` on the phone).
 *
 * API: `POST /api/my-day/watch` `{ kind: 'tracking', value }` (start),
 * the same route with `desired: 'muted'` (stop), and `GET /api/my-day/watch`
 * (list). The route answers in operator words already ("Enter a full tracking
 * number"), so a failure carries the SERVER's sentence, not a status code.
 */

/** One standing watch, as `GET /api/my-day/watch` reports it. */
export interface TrackingWatchRow {
  /** The carton this watch resolved to, or `null` while it is pre-arrival. */
  receivingId: number | null;
  tracking: string | null;
  /** True while the number is watched but no carton has been scanned yet. */
  preArrival: boolean;
  updatedAtMs: number;
}

/** What starting a watch tells the operator. */
export interface TrackingWatchStarted {
  /** Canonical tracking, as the server extracted it from what was typed. */
  tracking: string;
  /** The watch is waiting on an arrival rather than following a carton. */
  preArrival: boolean;
  /** The staffer already had this number; nothing new was created. */
  alreadyWatching: boolean;
  receivingId: number | null;
}

export interface TrackingWatchStopped {
  tracking: string;
  /** False when there was nothing left to stop (already stopped elsewhere). */
  stopped: boolean;
}

/**
 * A refusal the SERVER wrote. `status` is carried because 404 is not an error
 * to show: the Home Inbox flag being off is a "not enabled here" state, and a
 * face that paints it red teaches operators to distrust the screen.
 */
export class TrackingWatchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TrackingWatchError';
    this.status = status;
  }
}

const WATCH_URL = '/api/my-day/watch';

/** Cookie session, and never a cached answer for a watch list someone just changed. */
const REQUEST_BASE: RequestInit = { credentials: 'include', cache: 'no-store' };

/**
 * One fetch, one parse, one refusal shape. `fallback` is the sentence to show
 * when the route answered without one of its own (a 500, a proxy page): the
 * server's `error` always wins, because it is written in operator words.
 */
async function requestWatch(
  init: RequestInit,
  fallback: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(WATCH_URL, { ...REQUEST_BASE, ...init });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new TrackingWatchError(
      typeof body?.error === 'string' && body.error ? body.error : fallback,
      res.status,
    );
  }
  return body ?? {};
}

const POST_JSON = { method: 'POST', headers: { 'content-type': 'application/json' } } as const;

/**
 * Start watching a tracking number. The route resolves it to a carton when one
 * exists and otherwise writes a pre-arrival rule, so a caller never has to know
 * whether the package has landed — which is the whole point of the verb.
 */
export async function startTrackingWatch(value: string): Promise<TrackingWatchStarted> {
  const body = await requestWatch(
    { ...POST_JSON, body: JSON.stringify({ kind: 'tracking', value }) },
    'Could not watch that tracking number.',
  );
  const receivingId = Number(body.receivingId);
  return {
    tracking: typeof body.tracking === 'string' ? body.tracking : value.trim(),
    preArrival: body.preArrival === true,
    alreadyWatching: body.alreadyWatching === true,
    receivingId: Number.isFinite(receivingId) ? receivingId : null,
  };
}

/**
 * Stop watching it. One call drops BOTH arms (pre-arrival rule and carton
 * subscription) because "stop watching this number" is one act to an operator,
 * even at the moment the carton lands and the watch is briefly held by both.
 */
export async function stopTrackingWatch(value: string): Promise<TrackingWatchStopped> {
  const body = await requestWatch(
    { ...POST_JSON, body: JSON.stringify({ kind: 'tracking', value, desired: 'muted' }) },
    'Could not stop watching that tracking number.',
  );
  return {
    tracking: typeof body.tracking === 'string' ? body.tracking : value.trim(),
    stopped: body.stopped === true,
  };
}

/** The staffer's standing tracking watches. Tickets are a different rail. */
export async function listTrackingWatches(): Promise<TrackingWatchRow[]> {
  const body = await requestWatch({ method: 'GET' }, 'Could not load your watched tracking numbers.');
  const rows = Array.isArray(body.tracking) ? body.tracking : [];
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const receivingId = Number(row.receivingId);
    const updatedAtMs = Number(row.updatedAtMs);
    return {
      receivingId: Number.isFinite(receivingId) ? receivingId : null,
      tracking: typeof row.tracking === 'string' ? row.tracking : null,
      preArrival: row.preArrival === true,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    };
  });
}
