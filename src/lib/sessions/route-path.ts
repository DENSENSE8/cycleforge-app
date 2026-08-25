/**
 * `[id]` off the request path.
 *
 * `withAuth`'s wrapper drops Next's route context, so every wrapped dynamic
 * route in this app reads its own params from the URL. The existing
 * `/api/sessions/[id]` route did this inline; three sibling routes with a
 * suffix (`/park`, `/resume`, `/contents`, `/scans`) need the SAME parse with a
 * different offset, and four copies of an off-by-one is how one of them ends up
 * parsing the verb as the id.
 *
 * `fromEnd` counts back from the last segment: 0 for `/api/sessions/12`,
 * 1 for `/api/sessions/12/park`.
 */
import type { NextRequest } from 'next/server';

export function sessionIdFromPath(req: NextRequest, fromEnd = 0): number | null {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const raw = segments[segments.length - 1 - fromEnd];
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
