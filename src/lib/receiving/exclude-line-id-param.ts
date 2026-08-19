/**
 * Shared `?excludeLineId=` parse for Unbox notes-composer recents
 * (label note + staged location). Both GET doors exclude the open carton.
 */

export function parseExcludeLineIdParam(searchParams: URLSearchParams):
  | { ok: true; excludeLineId: number | null }
  | { ok: false; error: string } {
  const raw = searchParams.get('excludeLineId');
  if (raw == null || raw.trim() === '') {
    return { ok: true, excludeLineId: null };
  }
  const excludeLineId = Number(raw);
  if (!Number.isFinite(excludeLineId) || excludeLineId <= 0) {
    return { ok: false, error: 'excludeLineId must be a positive integer' };
  }
  return { ok: true, excludeLineId };
}
