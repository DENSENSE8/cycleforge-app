/**
 * Kiosk binding self-heal — the runtime answer to "remove the concept of the
 * kiosk unpairing".
 *
 * A paired tablet used to dead-end silently: if the `cf_kiosk` cookie was lost
 * or the device row revoked mid-shift (settings churn, E2E sweeps, cookie
 * eviction), every kiosk API answered `401 KIOSK_UNPAIRED` and the surface
 * just stopped updating — no path back but a manual reload. The operator
 * ruling is that a counter tablet must never strand: the binding heals
 * itself, in place.
 *
 * ONE chokepoint per failure: any kiosk fetch that sees a 401 calls
 * {@link healKioskBinding} and retries once. The heal is a singleton with a
 * cool-down, so a stampede of failing polls (3s session poll + catalog +
 * realtime token) triggers exactly one re-bind, not one per caller.
 *
 * Dogfood note: the re-bind posts the dev autopair route (org #1). A
 * production tenant replaces this single call with its enrollment path —
 * the retry-around-it contract stays identical.
 */

'use client';

let healing: Promise<boolean> | null = null;
let lastHealAt = 0;

/** Re-bind enough to ignore a second heal inside this window. */
const HEAL_COOLDOWN_MS = 30_000;

export async function healKioskBinding(): Promise<boolean> {
  const now = Date.now();
  if (healing) return healing;
  if (now - lastHealAt < HEAL_COOLDOWN_MS) return false;

  healing = (async () => {
    try {
      const res = await fetch('/api/kiosk/dev-autopair', {
        method: 'POST',
        credentials: 'include',
      });
      lastHealAt = Date.now();
      return res.ok;
    } catch {
      lastHealAt = Date.now();
      return false;
    } finally {
      healing = null;
    }
  })();
  return healing;
}

/**
 * A kiosk fetch that self-heals one 401 and retries once.
 *
 * This is THE fetch for every device-authed kiosk path — polls
 * (`/api/kiosk/session`), catalog reads and counter writes alike. Production
 * keeps `withKioskAuth`'s 401 enrollment contract (no server-side re-bind), so
 * on a production dogfood tablet this retry is the ONLY thing between a lost
 * cookie and a dead screen.
 *
 * Retrying a POST is safe: `withKioskAuth` answers 401 BEFORE the handler runs,
 * so the refused call wrote nothing.
 *
 * Non-kiosk URLs pass straight through. A 401 from `/api/repair/...` means the
 * STAFF session expired, and re-binding a device would be answering a question
 * nobody asked — this matters because shared pickers (`ProductSelector`) point
 * at the staff routes or the kiosk twins depending on who mounted them.
 */
export async function kioskFetchHealed(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const first = await fetch(input, init);
  if (first.status !== 401 || !isKioskApiPath(input)) return first;
  const healed = await healKioskBinding();
  if (!healed) return first;
  return fetch(input, init);
}

/** True for a device-authed kiosk API URL (absolute or same-origin relative). */
function isKioskApiPath(input: string): boolean {
  if (input.startsWith('/')) return input.startsWith('/api/kiosk/');
  try {
    return new URL(input, window.location.origin).pathname.startsWith('/api/kiosk/');
  } catch {
    return false;
  }
}
