/** Query normalization + the curated synonym layer. */

/** The one folding rule: */
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

/** Curated vernacular → the words the index actually holds. */
const SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
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
  bay: ['location', 'bin'],
  rack: ['location', 'bin'],
  tote: ['location', 'bin'],
  slot: ['location', 'bin'],
};

/** Own-property lookup into {@link SEARCH_SYNONYMS}. */
function synonymsFor(token: string): readonly string[] | undefined {
  return Object.prototype.hasOwnProperty.call(SEARCH_SYNONYMS, token)
    ? SEARCH_SYNONYMS[token]
    : undefined;
}

interface ExpandedQuery {
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

/** Build the synonym ladder for a query. */
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
