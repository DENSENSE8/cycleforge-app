/**
 * The phone's own record of where the operator has been, so a detail bar's Back can go BACK instead of forward.
 * added the other screen on top of the stack (operator 2026-09-24: "an
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
 * from the scan tape — is a full screen, not a sheet (operator 2026-09-24), and
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
