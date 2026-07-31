/**
 * PO-list search needle helpers — shared by GET /api/receiving/po/list and
 * move-photos / attach-tracking UIs that call it.
 */

/**
 * Strip scanner chrome (`#R-50292` → `R-50292`) and detect a carton handle
 * (`R-<id>` / legacy `RCV-<id>`). Same contract as receiving lines search and
 * printed DataMatrix labels (`receivingHandle`).
 */
export function parsePoListSearch(raw: string): {
  needle: string;
  receivingId: number | null;
} {
  const needle = raw.trim().replace(/^#+/, '').trim();
  const match = /^(?:R|RCV)-(\d+)$/i.exec(needle);
  if (!match) return { needle, receivingId: null };
  const id = Number(match[1]);
  return {
    needle,
    receivingId: Number.isFinite(id) && id > 0 ? id : null,
  };
}
