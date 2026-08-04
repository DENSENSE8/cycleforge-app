/**
 * The ONE tracking-paste parser, and the `?tracking_in=` URL vocabulary built
 * on top of it.
 *
 * Two operator questions share one input — *"are these received upstream?"*
 * (the ERP check) and *"show me these rows"* (the bulk list filter) — so they
 * share one splitter. A second parser is a second set of paste bugs and a
 * second answer to "is `1Z999 AA1 01` one tracking or three".
 *
 * **Altitude:** dependency-free apart from {@link canonicalizeTrackingKey}
 * (itself pure), because the paste panel is a CLIENT component. This lived in
 * `check-zoho-received.ts` until 2026-08-02; that module reaches the Zoho
 * client and `tenantQuery` (lazily, but the graph is still there), so a client
 * import of the parser would have dragged it along — the bundle-altitude trap
 * in `build-gotchas.md`. `check-zoho-received.ts` re-exports both names, so
 * every existing server import path is unchanged.
 */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/**
 * Cap on unique trackings per paste — shared by the ERP check and the list
 * filter, because they are the same paste. 100 keys is ~2KB of `?tracking_in=`,
 * which every browser and proxy carries comfortably.
 */
export const CHECK_ZOHO_RECEIVED_MAX_INPUTS = 100;

/** The list-filter URL param. One name, imported — never re-typed at a call site. */
export const TRACKING_IN_PARAM = 'tracking_in';

/**
 * Expand one paste token into tracking string(s).
 * Newline / comma / semicolon are hard separators. Within a token, whitespace
 * splits only when every piece looks like its own tracking (canon length ≥ 8);
 * otherwise spaces are treated as formatting inside one tracking
 * (e.g. `1Z999 AA1 01 2345 6789`).
 */
function expandPasteToken(token: string): string[] {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [trimmed];
  const canons = parts.map((p) => canonicalizeTrackingKey(p));
  if (canons.every((c) => c.length >= 8)) return parts;
  return [trimmed];
}

type ParseTrackingPasteOk = {
  ok: true;
  /** First-seen original string per unique canonical key. */
  trackings: string[];
  input_count: number;
  unique_count: number;
};

type ParseTrackingPasteErr = {
  ok: false;
  error: string;
};

type ParseTrackingPasteResult = ParseTrackingPasteOk | ParseTrackingPasteErr;

/**
 * Split a paste blob (or array) into unique tracking strings.
 * Separators: newline, comma, semicolon; whitespace when each piece is a full tracking.
 * Cap: {@link CHECK_ZOHO_RECEIVED_MAX_INPUTS} unique keys.
 */
export function parseTrackingPaste(
  input: string | string[],
  maxInputs: number = CHECK_ZOHO_RECEIVED_MAX_INPUTS,
): ParseTrackingPasteResult {
  const rough: string[] =
    typeof input === 'string'
      ? input.split(/[\n\r,;]+/)
      : input.flatMap((s) => String(s).split(/[\n\r,;]+/));

  const parts = rough.flatMap(expandPasteToken);

  const seen = new Set<string>();
  const trackings: string[] = [];
  let input_count = 0;

  for (const raw of parts) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    input_count += 1;
    const canon = canonicalizeTrackingKey(trimmed);
    if (!canon) continue;
    if (seen.has(canon)) continue;
    seen.add(canon);
    trackings.push(trimmed);
  }

  if (trackings.length === 0) {
    return { ok: false, error: 'Paste at least one tracking number' };
  }
  if (trackings.length > maxInputs) {
    return {
      ok: false,
      error: `Too many tracking numbers (max ${maxInputs}; got ${trackings.length})`,
    };
  }

  return {
    ok: true,
    trackings,
    input_count,
    unique_count: trackings.length,
  };
}

/**
 * A paste resolved into the canonical keys the list filter sends, with the
 * truncation stated rather than swallowed.
 *
 * `truncated > 0` is a fact the operator MUST be shown ("showing the first 100
 * of 137"). A paste that silently loses its tail reads as "those 37 aren't in
 * the system", which is the same false-certainty this whole initiative exists
 * to remove — see `verify.md` → no silent caps.
 */
interface TrackingKeySelection {
  /** Canonical (upper-alnum) keys, deduped, capped at {@link CHECK_ZOHO_RECEIVED_MAX_INPUTS}. */
  keys: string[];
  /** Original strings for the kept keys, index-aligned with {@link keys}. */
  display: string[];
  /** Unique keys the operator actually supplied, BEFORE the cap. */
  requested: number;
  /** How many unique keys the cap dropped. */
  truncated: number;
}

const EMPTY_SELECTION: TrackingKeySelection = {
  keys: [],
  display: [],
  requested: 0,
  truncated: 0,
};

/**
 * Paste blob → capped canonical key selection.
 *
 * Deliberately does NOT reuse `parseTrackingPaste`'s over-cap ERROR: the ERP
 * check refuses an oversize paste because every key past the cap is an
 * unanswered lookup, while the list filter can honestly answer "here are the
 * first 100". Same splitter (called with the cap lifted), different policy at
 * the boundary.
 */
export function parseTrackingKeys(
  input: string | string[],
  maxInputs: number = CHECK_ZOHO_RECEIVED_MAX_INPUTS,
): TrackingKeySelection {
  const parsed = parseTrackingPaste(input, Number.MAX_SAFE_INTEGER);
  if (!parsed.ok) return EMPTY_SELECTION;

  const display = parsed.trackings.slice(0, Math.max(0, maxInputs));
  return {
    keys: display.map((t) => canonicalizeTrackingKey(t)),
    display,
    requested: parsed.trackings.length,
    truncated: Math.max(0, parsed.trackings.length - display.length),
  };
}

/** Canonical keys → the `?tracking_in=` value. */
export function serializeTrackingIn(keys: readonly string[]): string {
  return keys.join(',');
}

/**
 * `?tracking_in=` → canonical keys. Malformed input degrades to an empty
 * selection (the lane simply does not filter) rather than 400-ing — a
 * hand-edited or truncated deep link must never break the page.
 */
export function parseTrackingInParam(
  raw: string | null | undefined,
  maxInputs: number = CHECK_ZOHO_RECEIVED_MAX_INPUTS,
): TrackingKeySelection {
  const value = String(raw ?? '').trim();
  if (!value) return EMPTY_SELECTION;
  return parseTrackingKeys(value, maxInputs);
}
