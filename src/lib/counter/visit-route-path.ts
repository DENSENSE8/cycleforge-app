/** `/api/kiosk/visit/{id}/…` → the visit id. */
export function visitIdFromPath(pathname: string): number | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('visit');
  if (at === -1) return null;
  const id = Number(segments[at + 1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
