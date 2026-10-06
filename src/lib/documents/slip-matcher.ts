/**
 * Packing-slip page → order. Pure: the caller passes the open orders a slip
 * may belong to, the uploaded file's name and the page's text; this answers
 * with ONE order, an ambiguity, or nothing. It never picks among several — an
 * ambiguous or unmatched slip stays unlinked.
 *
 * Evidence order: the filename wins (an operator or a channel export named the
 * file for its order); the page text is read only when the filename names no
 * candidate.
 *
 * Reference normalization: upper-case, punctuation out, leading zeros out —
 * so `#001234`, `1234` and `00-1234` are one reference. A reference shorter
 * than four characters, or without a digit, never matches. A digit run is
 * atomic: `1234` never matches inside `12345` or `91234`, so a short order
 * number cannot hit a tracking or phone number's middle; a candidate whose
 * only hit lies inside another candidate's longer hit is dropped.
 */

export interface SlipCandidate {
  orderId: number;
  /** Every reference the order is known by (its order number, …). */
  refs: string[];
}

export type SlipMatch = { orderId: number } | { ambiguous: number[] } | null;

/** Shorter references (after normalization) name too many things to match on sight. */
const MIN_REF_LENGTH = 4;

/** `#001234` / `113-1234567-1234567` → `1234` / `11312345671234567`. */
export function normalizeSlipRef(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

/** A matchable reference: long enough, and carries a digit (a bare word is not an order number). */
function usableRef(ref: string): boolean {
  return ref.length >= MIN_REF_LENGTH && /\d/.test(ref);
}

interface Span {
  start: number;
  end: number;
}

interface Segment extends Span {
  text: string;
  /** Whether this segment may join the NEXT one into a reference (letter↔digit, `-`, whitespace). */
  joinsNext: boolean;
}

/**
 * Letter runs and digit runs, in order. A run joins the next across a
 * letter↔digit change or a soft separator (`-`, whitespace); anything else
 * (`_`, `/`, `#`, `.`, `:` …) ends a reference.
 */
function segmentsOf(haystack: string): Segment[] {
  const upper = haystack.toUpperCase();
  const segments: Segment[] = [];
  const pattern = /[A-Z]+|[0-9]+/g;
  for (let match = pattern.exec(upper); match; match = pattern.exec(upper)) {
    const start = match.index;
    const previous = segments[segments.length - 1];
    if (previous) {
      const gap = upper.slice(previous.end, start);
      previous.joinsNext = gap === '' || /^[-\s]+$/.test(gap);
    }
    segments.push({ text: match[0], start, end: start + match[0].length, joinsNext: false });
  }
  return segments;
}

/** Every normalized reference the haystack spells, with its spans: each run of joined segments, up to `maxLength`. */
function spelledRefs(haystack: string, maxLength: number): Map<string, Span[]> {
  const found = new Map<string, Span[]>();
  const segments = segmentsOf(haystack);
  for (let first = 0; first < segments.length; first += 1) {
    let compact = '';
    for (let last = first; last < segments.length; last += 1) {
      compact += segments[last]!.text;
      const normalized = compact.replace(/^0+/, '');
      if (normalized.length > maxLength) break;
      if (usableRef(normalized)) {
        const spans = found.get(normalized) ?? [];
        spans.push({ start: segments[first]!.start, end: segments[last]!.end });
        found.set(normalized, spans);
      }
      if (!segments[last]!.joinsNext) break;
    }
  }
  return found;
}

/** The candidates the haystack names; a hit strictly inside another candidate's longer hit does not count. */
function namedIn(haystack: string, candidates: ReadonlyArray<SlipCandidate>): number[] {
  const maxLength = Math.max(0, ...candidates.flatMap((candidate) => candidate.refs.map((ref) => ref.length)));
  if (!haystack || maxLength === 0) return [];
  const spelled = spelledRefs(haystack, maxLength);
  const hits = new Map<number, Span[]>();
  for (const candidate of candidates) {
    const spans = candidate.refs.flatMap((ref) => spelled.get(ref) ?? []);
    if (spans.length > 0) hits.set(candidate.orderId, [...(hits.get(candidate.orderId) ?? []), ...spans]);
  }
  const all = [...hits.entries()].flatMap(([orderId, spans]) => spans.map((span) => ({ orderId, ...span })));
  const inside = (span: Span, orderId: number) =>
    all.some(
      (other) =>
        other.orderId !== orderId &&
        other.start <= span.start &&
        other.end >= span.end &&
        other.end - other.start > span.end - span.start,
    );
  return [...hits.entries()].filter(([orderId, spans]) => spans.some((span) => !inside(span, orderId))).map(([orderId]) => orderId);
}

function verdict(orderIds: number[]): SlipMatch {
  if (orderIds.length === 1) return { orderId: orderIds[0]! };
  if (orderIds.length > 1) return { ambiguous: [...orderIds].sort((a, b) => a - b) };
  return null;
}

/** File name first, then page text; several orders → `ambiguous`, none → `null`. */
export function matchSlipFile(file: { filename: string; text: string }, candidates: ReadonlyArray<SlipCandidate>): SlipMatch {
  const indexed = candidates.map((candidate) => ({
    orderId: candidate.orderId,
    refs: [...new Set(candidate.refs.map(normalizeSlipRef).filter(usableRef))],
  }));
  const byName = namedIn(file.filename.replace(/\.[a-z0-9]+$/i, ''), indexed);
  if (byName.length > 0) return verdict(byName);
  return verdict(namedIn(file.text, indexed));
}
