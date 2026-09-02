/**
 * Index freshness — Host step after `cg.mjs find`.
 *
 * Empty match → rebuild once then re-find. A hit whose `location` is not the
 * cohort file for that symbol is a location fail, not a silent pass.
 */
export type FindMatch = { location?: string; node_key?: string };

export type DecideFind =
  | { ok: true }
  | { ok: false; reason: 'location' }
  | { rebuild: true };

export function normalizeFindPath(p: string): string {
  return p.replaceAll('\\', '/').replace(/^\.\//, '');
}

function locationHitsExpected(location: string, expected: string): boolean {
  const loc = normalizeFindPath(location);
  if (!loc) return false;
  return loc === expected || loc.startsWith(expected) || loc.endsWith(`/${expected}`) || loc.includes(expected);
}

/**
 * Prefer the hit whose `location` is the engine file. `matches[0]` for a
 * common name can be a caller or a twin; impacting the wrong node is not a
 * measurement.
 */
export function pickFindMatch(
  matches: FindMatch[] | null | undefined,
  expectedFile: string,
): FindMatch | undefined {
  const list = matches ?? [];
  const expected = normalizeFindPath(expectedFile);
  if (!expected) return list[0];
  return list.find((m) => locationHitsExpected(String(m.location ?? ''), expected));
}

/**
 * `expectedFile` is a repo-relative prefix (cohort engine file or workspace).
 */
export function decideFind(matches: FindMatch[] | null | undefined, expectedFile: string): DecideFind {
  const list = matches ?? [];
  if (list.length === 0) return { rebuild: true };
  const expected = normalizeFindPath(expectedFile);
  if (!expected) return { ok: true };
  if (!pickFindMatch(list, expected)) return { ok: false, reason: 'location' };
  return { ok: true };
}
