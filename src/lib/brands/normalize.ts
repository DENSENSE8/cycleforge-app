/**
 * Brand text normalisation — pure, shared by the alias table writes, the
 * typeahead, the backfill proposer and identify's token classifier, so a
 * brand spelled one way in a title and another in Zoho meets on one key.
 */

/** Longest alias, in tokens, any matcher will try ("the beatles rock band" needs 3 after stripping). */
export const MAX_ALIAS_TOKENS = 4;

/** Kinds a brand row may carry (mirrors product_brands_kind_chk). */
export const BRAND_KINDS = ['brand', 'franchise', 'product_line'] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];

/** Alias provenance (mirrors product_brand_aliases_source_chk). */
export const BRAND_ALIAS_SOURCES = ['seed', 'zoho', 'listing', 'operator', 'agent'] as const;
export type BrandAliasSource = (typeof BRAND_ALIAS_SOURCES)[number];

/**
 * Lower-case, diacritic-folded, punctuation-folded, whitespace-collapsed.
 * `&`, `+` and `-` survive INSIDE a token ("ps3-2-1", "b&o") because model
 * prefixes carry them; at a token's edge they are punctuation, except a
 * lone `&`, which is the word "and" ("Bang & Olufsen" = "Bang and Olufsen").
 * Apostrophes vanish without a gap ("McIntosh's" → "mcintoshs").
 */
export function normalizeBrandName(s: string): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^a-z0-9&+\-]+/g, ' ')
    .split(' ')
    .map((t) => (t === '&' ? 'and' : t.replace(/^[&+\-]+|[&+\-]+$/g, '')))
    .filter(Boolean)
    .join(' ');
}

/** URL-safe per-org slug: "Bang & Olufsen" → "bang-and-olufsen", "B&O" → "b-and-o". */
export function brandSlug(name: string): string {
  return normalizeBrandName(name)
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[\s\-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalised tokens of free text or a title. */
export function brandTokens(text: string): string[] {
  const n = normalizeBrandName(text);
  return n ? n.split(' ') : [];
}

/**
 * Leading words that are listing noise, not identity (phase0 audit, top
 * leading tokens of catalog, listing and receiving titles). Stripped only
 * from the FRONT, repeatedly: "New Genuine OEM Bose …" → "bose …".
 */
const LEADING_STOP_WORDS: Record<string, true> = {
  the: true,
  genuine: true,
  oem: true,
  original: true,
  new: true,
  used: true,
  vintage: true,
  replacement: true,
  lot: true,
  pair: true,
  tested: true,
  untested: true,
  return: true,
  read: true,
};

/** Two-word leading noise; a count right after it ("lot of 3") goes too. */
const LEADING_STOP_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['lot', 'of'],
  ['set', 'of'],
  ['pair', 'of'],
  ['brand', 'new'],
];

const COUNT_TOKEN = /^\d+x?$/;

export function stripLeadingStopWords(tokens: readonly string[]): string[] {
  let i = 0;
  for (;;) {
    const phrase = LEADING_STOP_PHRASES.find(([a, b]) => tokens[i] === a && tokens[i + 1] === b);
    if (phrase) {
      i += 2;
      if (tokens[i] && COUNT_TOKEN.test(tokens[i])) i += 1;
      continue;
    }
    const t = tokens[i];
    if (t && (Object.hasOwn(LEADING_STOP_WORDS, t) || /^\d+x$/.test(t))) {
      i += 1;
      continue;
    }
    return tokens.slice(i);
  }
}

/** Legal-entity tails folded off a Zoho brand/manufacturer field before its exact alias lookup. */
const CORPORATE_SUFFIXES: Record<string, true> = {
  corp: true,
  corporation: true,
  inc: true,
  incorporated: true,
  llc: true,
  ltd: true,
  limited: true,
  co: true,
  company: true,
  gmbh: true,
};

export function normalizeManufacturerField(value: string | null | undefined): string {
  const tokens = brandTokens(value ?? '');
  while (tokens.length > 1 && Object.hasOwn(CORPORATE_SUFFIXES, tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(' ');
}

/**
 * Words after which a brand is a compatibility TARGET, never the brand:
 * "Replacement CD drive for Bose Wave" is not a Bose product.
 */
const COMPAT_MARKERS: ReadonlyArray<readonly string[]> = [['compatible', 'with'], ['for'], ['fits'], ['compatible']];

/** Start index of the tokens right after the first compatibility marker, or -1. */
export function compatTargetStart(tokens: readonly string[]): number {
  for (let i = 0; i < tokens.length; i++) {
    for (const marker of COMPAT_MARKERS) {
      if (marker.every((m, k) => tokens[i + k] === m)) return i + marker.length;
    }
  }
  return -1;
}

/**
 * Longest alias match starting exactly at `start` (n-grams of up to
 * MAX_ALIAS_TOKENS). `lookup` returns the alias entry for a normalised
 * n-gram or undefined.
 */
export function longestAliasAt<T>(
  tokens: readonly string[],
  start: number,
  lookup: (ngram: string) => T | undefined,
): { ngram: string; length: number; entry: T } | null {
  const max = Math.min(MAX_ALIAS_TOKENS, tokens.length - start);
  for (let n = max; n >= 1; n--) {
    const ngram = tokens.slice(start, start + n).join(' ');
    const entry = lookup(ngram);
    if (entry !== undefined) return { ngram, length: n, entry };
  }
  return null;
}

/** Every n-gram (1..MAX_ALIAS_TOKENS) of the tokens, for a single IN (...) alias probe. */
export function aliasNgrams(tokens: readonly string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= MAX_ALIAS_TOKENS && i + n <= tokens.length; n++) {
      out.add(tokens.slice(i, i + n).join(' '));
    }
  }
  return [...out];
}
