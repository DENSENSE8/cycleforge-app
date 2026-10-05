/** Per-tab echo guard: the browser that publishes a phone request must not navigate itself. */

const LOCAL_UNIT_PHOTO_REQUEST_KEY = 'cf:local-unit-photo-request';
const LOCAL_REQUEST_TTL_MS = 60_000;

export function markLocalUnitPhotoRequest(requestId: string): void {
  try {
    sessionStorage.setItem(LOCAL_UNIT_PHOTO_REQUEST_KEY, JSON.stringify({ requestId, at: Date.now() }));
  } catch {
    // Storage is only an echo guard; the cross-device request still works.
  }
}

export function consumeLocalUnitPhotoRequest(requestId: string): boolean {
  if (!requestId) return false;
  try {
    const raw = sessionStorage.getItem(LOCAL_UNIT_PHOTO_REQUEST_KEY);
    const saved = raw ? JSON.parse(raw) as { requestId?: string; at?: number } : null;
    if (saved?.requestId !== requestId) return false;
    if (!Number.isFinite(saved.at) || Date.now() - Number(saved.at) > LOCAL_REQUEST_TTL_MS) {
      sessionStorage.removeItem(LOCAL_UNIT_PHOTO_REQUEST_KEY);
      return false;
    }
    // Do not consume immediately: React development mounts and hot refreshes
    // can leave two live listeners for one tick. Both must ignore the echo.
    return true;
  } catch {
    return false;
  }
}
