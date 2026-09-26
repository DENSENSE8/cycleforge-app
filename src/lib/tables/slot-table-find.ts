/** Slot-table find → row. */

export function slotTableQueryLooksLikeIdentifier(query: string): boolean {
  const q = String(query ?? '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-');
  if (!q || /\s/.test(q)) return false;
  if (/^\d{3,}$/.test(q)) return true;
  return /^[A-Za-z0-9#:_\-\.\/]+$/.test(q) && /\d{2,}/.test(q) && q.length >= 4;
}

export function slotTableFindHighlightId(opts: {
  query: string;
  paintedRowIds: readonly string[];
}): string | null {
  const painted = opts.paintedRowIds;
  if (painted.length === 0) return null;
  if (!slotTableQueryLooksLikeIdentifier(opts.query)) return null;
  return painted[0] ?? null;
}

export function slotTableScrollItemMatches(
  scrollToKey: string,
  item: {
    key: string;
    groupKey?: string;
    rowIds?: readonly string[];
  },
): boolean {
  if (!scrollToKey) return false;
  if (item.key === `r:${scrollToKey}`) return true;
  if (item.groupKey === scrollToKey) return true;
  if (item.rowIds?.includes(scrollToKey)) return true;
  return false;
}
