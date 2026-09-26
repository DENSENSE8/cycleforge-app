/** Query relaxation — what to try when the literal search found nothing. */

import { isStopword, normalizeQuery, tokenizeQuery } from '@/lib/search/query-expansion';

/** Longest ladder we will ever build. Each rung is a database round trip on a
 *  path the operator is already waiting on, so the budget is small on purpose:
 *  three misses is the point at which telling them plainly beats guessing again. */
const MAX_RUNGS = 3;

/**
 * At or above this score a token is treated as identity — a model number, a
 * partial serial, a bin code — and is not dropped while an ordinary word
 * remains. Matches the pure-digit floor in {@link tokenSelectivity}.
 */
const PROTECTED_SELECTIVITY = 60;

/** How much a token narrows a result set, as a rough ordinal. */
export function tokenSelectivity(token: string): number {
  if (isStopword(token)) return 0;
  // Mixed letters+digits is almost always an identity fragment — a partial
  // serial, a model number, a bin code. These are why the search was run.
  if (/[a-z]/.test(token) && /\d/.test(token)) return 100 + token.length;
  // Pure digits: a quantity or a fragment of a number. Selective, but a bare
  // "7400" is a model as often as it is a count.
  if (/^\d+$/.test(token)) return 60 + Math.min(token.length, 10);
  // Words: longer is rarer, but with a ceiling so one long word never outranks
  // an identity fragment.
  return Math.min(10 + token.length, 55);
}

/** Build the ordered retry ladder for a query that returned nothing. */
export function relaxationLadder(raw: string, extraRungs: readonly string[] = []): string[] {
  const normalized = normalizeQuery(raw);
  const tokens = tokenizeQuery(normalized);
  const ladder: string[] = [];
  const seen = new Set<string>([normalized]);

  const push = (candidate: string) => {
    const c = candidate.trim();
    if (!c || seen.has(c) || ladder.length >= MAX_RUNGS) return;
    seen.add(c);
    ladder.push(c);
  };

  // Rung 0 — synonyms. Same number of terms, different vocabulary.
  for (const rung of extraRungs) push(normalizeQuery(rung));

  // A single token has no less-critical half to shed. Synonyms may still have
  // applied above; dropping is where we stop.
  if (tokens.length < 2) return ladder;

  // Ordered least-selective-first; ties break on position, later token first, on the reasoning that a trailing term is a qualifier more…
  const order = tokens
    .map((token, index) => ({ token, index, weight: tokenSelectivity(token) }))
    .sort((a, b) => a.weight - b.weight || b.index - a.index);

  // Identity-shaped tokens — a partial serial, a model number, a bin code — are the REASON the search was run, so they are not candidates…
  const droppable = order.filter((t) => t.weight < PROTECTED_SELECTIVITY);
  const candidates = droppable.length > 0 ? droppable : order;

  // Rung set 1 — remove exactly ONE token, every way round.
  for (const { index } of candidates) {
    const remaining = tokens.filter((_, i) => i !== index);
    if (remaining.length === 0) continue;
    push(remaining.join(' '));
    if (ladder.length >= MAX_RUNGS) return ladder;
  }

  // Rung set 2 — shed cumulatively, for queries long enough that removing one
  // word was not enough.
  const dropped = new Set<number>();
  for (const { index } of candidates) {
    dropped.add(index);
    const remaining = tokens.filter((_, i) => !dropped.has(i));
    // Never relax down to nothing — a bare empty query matches the whole org.
    if (remaining.length === 0) break;
    push(remaining.join(' '));
    if (ladder.length >= MAX_RUNGS) break;
  }

  return ladder;
}
