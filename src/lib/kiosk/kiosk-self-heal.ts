/** Kiosk binding self-heal — the runtime answer to "remove the concept of the kiosk unpairing". */

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

/** A kiosk fetch that self-heals one 401 and retries once. */
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
