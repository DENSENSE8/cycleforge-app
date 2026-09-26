/** Sentence-case a catalog / print label. */
export function sentenceCaseLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return t;
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) return t;
  if (/[a-z]/.test(t)) return t;
  const spaced = t.replace(/_+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
