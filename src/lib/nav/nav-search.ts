/** THE nav matcher — ranked, pure, and shared by every surface that lets an operator type to reach a destination (the ⌘K palette, the… */

/** Ordered weakest → strongest; index is the rank. */
const NAV_MATCH_TIERS = [
  'subsequence',
  'substring',
  'word-prefix',
  'prefix',
  'exact',
] as const;

export type NavMatchTier = (typeof NAV_MATCH_TIERS)[number];

/** Tier → base score. Gaps are wide enough that no bonus can cross a tier. */
const TIER_SCORE: Record<NavMatchTier, number> = {
  exact: 10_000,
  prefix: 8_000,
  'word-prefix': 6_000,
  substring: 4_000,
  subsequence: 2_000,
};

/** A match on a SECONDARY field (href, section label) is penalised by slightly MORE than one tier step, so a label match always outranks a… */
const KEYWORD_PENALTY = 2_100;

/** A highlightable span in the matched text, as `[start, end)`. */
export type NavMatchRange = readonly [number, number];

export interface NavMatch {
  tier: NavMatchTier;
  score: number;
  /**
   * Spans to highlight IN THE LABEL. Empty when the match came from a secondary
   * field — there is nothing in the visible text to mark, and inventing a
   * highlight there would point at the wrong characters.
   */
  ranges: NavMatchRange[];
}

/** Anything this module can rank. Views map their rows into it. */
export interface NavSearchable {
  /** The visible text. Matches here rank highest and produce highlight ranges. */
  label: string;
  /**
   * Also searched, never highlighted — href segments, the section label, aliases.
   * Ranked below the label so a URL fragment cannot outrank a name.
   */
  keywords?: readonly string[];
}

function normalizeNavQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Word starts: index 0 and every position after a non-alphanumeric run. */
function wordStarts(text: string): number[] {
  const starts: number[] = [];
  let atBoundary = true;
  for (let i = 0; i < text.length; i++) {
    const isWord = /[a-z0-9]/.test(text[i]!);
    if (isWord && atBoundary) starts.push(i);
    atBoundary = !isWord;
  }
  return starts;
}

/** In-order character match with gaps. */
function subsequenceRanges(text: string, query: string): NavMatchRange[] | null {
  const ranges: NavMatchRange[] = [];
  let cursor = 0;
  for (const char of query) {
    const found = text.indexOf(char, cursor);
    if (found === -1) return null;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === found) ranges[ranges.length - 1] = [last[0], found + 1];
    else ranges.push([found, found + 1]);
    cursor = found + 1;
  }
  return ranges;
}

/**
 * Match ONE token against one text. Pure; the caller owns tier→score.
 *
 * A single-character query never reaches the subsequence tier: one letter
 * matches nearly every label, so fuzzy on one char is noise, not a guess.
 */
export function matchNavToken(text: string, token: string): NavMatch | null {
  const haystack = text.toLowerCase();
  if (!token) return null;

  if (haystack === token) {
    return { tier: 'exact', score: TIER_SCORE.exact, ranges: [[0, token.length]] };
  }

  if (haystack.startsWith(token)) {
    return { tier: 'prefix', score: TIER_SCORE.prefix, ranges: [[0, token.length]] };
  }

  const index = haystack.indexOf(token);
  if (index > 0) {
    const isWordStart = wordStarts(haystack).includes(index);
    const tier: NavMatchTier = isWordStart ? 'word-prefix' : 'substring';
    // Earlier hits win inside a tier; the bonus is capped well under a tier gap.
    const positionBonus = Math.max(0, 100 - index);
    return {
      tier,
      score: TIER_SCORE[tier] + positionBonus,
      ranges: [[index, index + token.length]],
    };
  }

  if (token.length < 2) return null;
  const ranges = subsequenceRanges(haystack, token);
  if (!ranges) return null;
  // Fewer, tighter runs = a closer guess. `ranges.length` is the gap count + 1.
  const compactness = Math.max(0, 100 - (ranges.length - 1) * 10);
  return { tier: 'subsequence', score: TIER_SCORE.subsequence + compactness, ranges };
}

function mergeRanges(ranges: NavMatchRange[]): NavMatchRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: NavMatchRange[] = [sorted[0]!];
  for (const [start, end] of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (start <= last[1]) out[out.length - 1] = [last[0], Math.max(last[1], end)];
    else out.push([start, end]);
  }
  return out;
}

/** Match a whole (possibly multi-token) query against one item. */
export function matchNavItem(item: NavSearchable, query: string): NavMatch | null {
  const normalized = normalizeNavQuery(query);
  if (!normalized) return null;
  const tokens = normalized.split(' ').filter(Boolean);

  let total = 0;
  let weakest = NAV_MATCH_TIERS.length - 1;
  const ranges: NavMatchRange[] = [];

  for (const token of tokens) {
    const onLabel = matchNavToken(item.label, token);
    let best = onLabel;
    let bestScore = onLabel ? onLabel.score : -1;

    for (const keyword of item.keywords ?? []) {
      const hit = matchNavToken(keyword, token);
      if (!hit) continue;
      const scored = hit.score - KEYWORD_PENALTY;
      if (scored > bestScore) {
        bestScore = scored;
        // Keyword hits carry no label ranges — nothing visible to mark.
        best = { tier: hit.tier, score: scored, ranges: [] };
      }
    }

    if (!best) return null; // AND: one unmatched token disqualifies the row.
    total += bestScore;
    weakest = Math.min(weakest, NAV_MATCH_TIERS.indexOf(best.tier));
    ranges.push(...best.ranges);
  }

  return {
    tier: NAV_MATCH_TIERS[weakest]!,
    score: total / tokens.length,
    ranges: mergeRanges(ranges),
  };
}

interface NavSearchResult<T> {
  item: T;
  match: NavMatch;
}

/** Rank items against a query. */
export function searchNav<T extends NavSearchable>(
  items: readonly T[],
  query: string,
): NavSearchResult<T>[] {
  const normalized = normalizeNavQuery(query);
  if (!normalized) {
    return items.map((item) => ({
      item,
      match: { tier: 'exact', score: 0, ranges: [] },
    }));
  }

  const hits: Array<NavSearchResult<T> & { index: number }> = [];
  items.forEach((item, index) => {
    const match = matchNavItem(item, normalized);
    if (match) hits.push({ item, match, index });
  });

  hits.sort((a, b) => {
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    if (a.item.label.length !== b.item.label.length) {
      return a.item.label.length - b.item.label.length;
    }
    return a.index - b.index;
  });

  return hits.map(({ item, match }) => ({ item, match }));
}

/**
 * Split a label into alternating plain / highlighted segments for rendering.
 * Views map this to `<mark>`-style spans; the matcher owns the offsets so every
 * surface highlights the same characters.
 */
export function splitNavHighlight(
  label: string,
  ranges: readonly NavMatchRange[],
): Array<{ text: string; hit: boolean }> {
  if (ranges.length === 0) return [{ text: label, hit: false }];
  const out: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) out.push({ text: label.slice(cursor, start), hit: false });
    out.push({ text: label.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < label.length) out.push({ text: label.slice(cursor), hit: false });
  return out;
}
