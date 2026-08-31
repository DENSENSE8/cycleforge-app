/**
 * Query normalization + the curated synonym layer.
 *
 * TWO JOBS, DELIBERATELY SEPARATE
 *   1. `normalizeQuery` — the one folding rule. It is the grouping key for
 *      `search_query_log.normalized_query`, so the zero-result worklist
 *      aggregates the same way a human would read two queries as "the same
 *      search". Nothing here changes what matches; it only decides what counts
 *      as one query.
 *   2. `expandQuery` — the curated vernacular map. Operators do not type schema
 *      words. They type "RMA" for a return, "box" for a carton, "DOA" for a
 *      failed unit. Every one of those is a zero-result today.
 *
 * WHY EXPANSION IS OPT-IN, NOT ALWAYS-ON
 *   The standard advice ("expand queries with synonyms") is written for a
 *   storefront, where recall is worth more than precision — a shopper shown one
 *   extra sofa loses nothing. An operator console is the opposite: a picker who
 *   searches a serial and is shown four near-matches has been handed a decision
 *   they did not ask for, and the interaction budget in AGENTS.md counts that
 *   against us. So expansion NEVER widens a query that already worked. The
 *   route runs the literal query first and only reaches for these terms when
 *   the first pass came back empty. That ordering is the whole safety argument.
 *
 * ADDING A SYNONYM
 *   Read it off the zero-result worklist, not out of your head:
 *     SELECT normalized_query, count(*) FROM search_query_log
 *      WHERE result_count = 0 GROUP BY 1 ORDER BY 2 DESC;
 *   A term earns a row here once real operators have typed it and got nothing.
 *   That is the loop this file exists to close.
 */

/**
 * The one folding rule: case-fold, strip control/zero-width characters, and
 * collapse every run of whitespace to a single space.
 *
 * Scanner wedges are the reason for the control-character strip — a gun that
 * emits a trailing CR or a leading STX would otherwise make an identical query
 * group as two distinct worklist rows, which is exactly the bug that hides a
 * recurring miss inside noise.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokens carrying no selectivity. Dropped first when the relaxation ladder
 * widens a query, and never counted when measuring how specific a query was.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'my', 'of', 'on', 'or', 'that', 'the',
  'this', 'to', 'was', 'were', 'with',
  // Console vernacular that reads as a question, not a filter. An operator
  // typing "where is order 1234" means the order; "where"/"is" are noise.
  'where', 'find', 'show', 'me', 'get', 'lookup', 'look', 'up', 'search',
]);

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

/** Split a normalized query into matchable tokens. Punctuation that carries
 *  identity (the `-` in `R-1234`, the `/` in `S/N`) is kept inside a token;
 *  only separating punctuation splits. */
export function tokenizeQuery(normalized: string): string[] {
  return normalized
    .split(/[\s,;:|]+/)
    .map((t) => t.replace(/^[.'"“”‘’(){}[\]]+|[.'"“”‘’(){}[\]]+$/g, ''))
    .filter(Boolean);
}

/**
 * Curated vernacular → the words the index actually holds.
 *
 * Keys are normalized tokens. Values are the terms to ALSO try. Bidirectional
 * pairs are written out both ways on purpose — an implicit reverse mapping is
 * the kind of cleverness that makes a relevance bug take an afternoon to find.
 */
export const SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  // Returns / reverse logistics
  rma: ['return'],
  returns: ['return'],
  refund: ['return'],
  'call-tag': ['return'],

  // Containers — an operator says "box", the spine says "carton"
  box: ['carton'],
  boxes: ['carton'],
  case: ['carton'],
  parcel: ['shipment'],
  package: ['shipment'],
  pkg: ['shipment'],

  // Condition vocabulary
  doa: ['defective', 'damaged'],
  dead: ['defective'],
  broken: ['damaged', 'defective'],
  faulty: ['defective'],
  bad: ['defective'],
  cracked: ['damaged'],

  // Identity
  sn: ['serial'],
  's/n': ['serial'],
  serialnumber: ['serial'],
  trk: ['tracking'],
  po: ['purchase order'],
  fnsku: ['fba'],
  asin: ['amazon'],
  lpn: ['license plate'],

  // People — the buyer-identity search this layer was built alongside
  buyer: ['customer'],
  purchaser: ['customer'],
  client: ['customer'],
  recipient: ['customer'],

  // Where-is-my-order, the highest-volume support question there is
  wismo: ['tracking', 'shipment'],

  // Locations
  shelf: ['location', 'bin'],
  rack: ['location', 'bin'],
  tote: ['location', 'bin'],
  slot: ['location', 'bin'],
};

/**
 * Own-property lookup into {@link SEARCH_SYNONYMS}.
 *
 * The key is operator-typed text, so a bare `SEARCH_SYNONYMS[token]` is a
 * prototype-chain read: `constructor` returns a function and `toString`
 * returns a method, both of which then flow into a `for…of` as if they were
 * the synonym list. Guarding the lookup is what keeps a typed word from
 * reaching Object.prototype at all.
 */
function synonymsFor(token: string): readonly string[] | undefined {
  return Object.prototype.hasOwnProperty.call(SEARCH_SYNONYMS, token)
    ? SEARCH_SYNONYMS[token]
    : undefined;
}

export interface ExpandedQuery {
  /** The folded form — the `search_query_log` grouping key. */
  normalized: string;
  /** Matchable tokens, stopwords included (callers decide what to drop). */
  tokens: string[];
  /**
   * Alternate queries worth trying when the literal one found nothing, most
   * promising first. Never includes the original, and is empty when no token
   * carries a curated synonym — an empty ladder is the honest answer.
   */
  expansions: string[];
}

/**
 * Build the synonym ladder for a query.
 *
 * One token is substituted at a time rather than all at once. Substituting
 * every synonym simultaneously produces a query no operator would ever type
 * ("carton defective location" from "box broken shelf") which matches nothing
 * and burns a round trip proving it. Single substitutions keep each retry a
 * plausible sentence.
 */
export function expandQuery(raw: string): ExpandedQuery {
  const normalized = normalizeQuery(raw);
  const tokens = tokenizeQuery(normalized);
  const expansions: string[] = [];
  const seen = new Set<string>([normalized]);

  for (let i = 0; i < tokens.length; i += 1) {
    const alternatives = synonymsFor(tokens[i]);
    if (!alternatives) continue;
    for (const alt of alternatives) {
      const swapped = [...tokens.slice(0, i), alt, ...tokens.slice(i + 1)].join(' ');
      if (seen.has(swapped)) continue;
      seen.add(swapped);
      expansions.push(swapped);
    }
  }

  return { normalized, tokens, expansions };
}
