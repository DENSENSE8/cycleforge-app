/**
 * Shared display helpers still used by live shipping surfaces.
 * (Legacy UpNext card builders lived here; removed with the orphan UpNext tree.)
 */

/** Drop a leading condition token from a product title when present. */
export function stripConditionPrefix(title: string | null | undefined, condition: string | null | undefined) {
  const t = (title || '').trimStart();
  const c = (condition || '').trim();
  if (!t || !c) return t;
  if (t.toLowerCase().startsWith(c.toLowerCase())) {
    return t.slice(c.length).trimStart();
  }
  return t;
}
