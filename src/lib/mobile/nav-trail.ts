/**
 * The phone's own record of where the operator has been, so a detail bar's
 * Back can go BACK instead of forward.
 *
 * Why: `MobileDetailTopBar` with `backHref` used to `router.push(backHref)`.
 * A sub-screen (`/m/rs/7/info`) pushing its hub, and the hub's plain Back
 * (`router.back()`), then bounced between each other forever — every Back
 * added the other screen on top of the stack (operator 2026-09-24: "an
 * infinite callback loop … it should come back to where I was before I
 * scanned it"). The browser does not expose the previous URL, so the shell
 * records one.
 *
 * The trail mirrors the history stack: a visit to the entry two back is a Back
 * (pop); anything else is a forward step (push). Only paths are compared.
 */

const KEY = 'cf-m-nav-trail';
const MAX = 50;

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function write(trail: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    // Private mode / quota: Back falls back to `replace`, which still cannot loop.
  }
}

/** Pure step so the rule is testable without a browser. */
export function nextNavTrail(trail: readonly string[], path: string): string[] {
  if (trail[trail.length - 1] === path) return [...trail];
  if (trail[trail.length - 2] === path) return trail.slice(0, -1);
  return [...trail, path];
}

/** Record a landing on `path` (pathname only). */
export function recordMobileVisit(path: string): void {
  write(nextNavTrail(read(), path));
}

/** The pathname the operator was on before the current one, or null. */
export function previousMobilePath(): string | null {
  const trail = read();
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}

/**
 * The job a record was opened FROM (`?back=`), when it is a safe phone path.
 *
 * A primary record opened from a job — an order from the pick queue, a carton
 * from the scan tape — is a full screen, not a sheet (operator 2026-09-24), and
 * its bar shows an X back to that job. The job passes itself as `back`; only a
 * same-origin `/m/` path is honoured, so a crafted link cannot route the X
 * off-site or to the desk.
 */
export function mobileJobReturn(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/m/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

/** `href` with the job it was opened from, for the record's X. */
export function withJobReturn(href: string, from: string): string {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}back=${encodeURIComponent(from)}`;
}
