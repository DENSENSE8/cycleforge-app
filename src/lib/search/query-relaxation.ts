/**
 * Query relaxation — what to try when the literal search found nothing.
 *
 * THE RULE THIS IMPLEMENTS
 *   A zero-result page is a dead end, and the documented baseline is that an
 *   engine drops its least critical terms and broadens before ever showing one.
 *   Today this console shows the dead end immediately: `headerFindEmptyMessage`
 *   returns a sentence and the operator is on their own. This module is the
 *   ladder that runs first.
 *
 * WHAT IT WILL NOT DO
 *   Identifier queries are never relaxed. If someone types a serial, an order
 *   number, or a scanned handle, a miss is a real miss — the unit is not here.
 *   Broadening that into "here are four units whose serials look a bit like
 *   yours" invents an answer to a question with a factual one, and on a
 *   receiving floor that is how the wrong unit gets shipped. `looksLikeIdentifier`
 *   already gates this upstream in hybrid-retrieval; the caller must honour it
 *   here too, and {@link relaxationLadder} returning `[]` for a single opaque
 *   token is the second line of that defence.
 *
 * ORDERING
 *   Least destructive first. Each rung is a query a human could plausibly have
 *   typed, so a hit on rung 2 is still explainable to the operator — which
 *   matters, because the UI labels these results as broadened rather than
 *   passing them off as exact.
 */

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

/**
 * How much a token narrows a result set, as a rough ordinal. Higher = keep it
 * longer.
 *
 * The heuristic is deliberately shape-based rather than corpus-based: a
 * frequency table would be more accurate and would also need maintaining,
 * warming, and explaining, and the ladder only has to be better than "drop the
 * last word" to earn its place.
 */
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

/**
 * Build the ordered retry ladder for a query that returned nothing.
 *
 * Returns `[]` — meaning "do not retry, tell them plainly" — when the query is
 * a single token, because there is nothing to drop that leaves a query behind,
 * and a lone opaque token is overwhelmingly an identifier.
 *
 * @param raw the operator's query, in whatever shape they typed it
 * @param extraRungs synonym substitutions from `expandQuery`, tried before any
 *        term is dropped: swapping a word the operator does know for one the
 *        index does is strictly less destructive than deleting it.
 */
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

  // Ordered least-selective-first; ties break on position, later token first,
  // on the reasoning that a trailing term is a qualifier more often than a
  // leading one is.
  //
  // Note what the length rule does to "dell 7400 charger": it sheds "dell"
  // before "charger". That reads backwards until you remember the corpus — a
  // warehouse holding thousands of Dell units has a brand name that narrows
  // almost nothing, while "charger" picks out a shelf.
  const order = tokens
    .map((token, index) => ({ token, index, weight: tokenSelectivity(token) }))
    .sort((a, b) => a.weight - b.weight || b.index - a.index);

  // Identity-shaped tokens — a partial serial, a model number, a bin code — are
  // the REASON the search was run, so they are not candidates for dropping
  // while an ordinary word is still there to drop instead. If every token is
  // identity-shaped there is nothing to protect them from and all are fair game.
  const droppable = order.filter((t) => t.weight < PROTECTED_SELECTIVITY);
  const candidates = droppable.length > 0 ? droppable : order;

  // Rung set 1 — remove exactly ONE token, every way round.
  //
  // This used to shed cumulatively, which quietly meant a two-word query only
  // ever got ONE retry: "bose zzzqqq" dropped the lower-scoring "bose", tried
  // "zzzqqq", found nothing, and gave up without ever trying "bose" — the rung
  // that actually had the answer. The selectivity score orders the attempts; it
  // must not decide that an attempt never happens.
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
