/**
 * Wedge detection INSIDE a find field — the pure half.
 *
 * ## Why this is not `createWedgeKeyListener`
 *
 * The global wedge listener bails the moment focus is editable
 * (`wedgeReduce` → `event.editable` → reset), and that bail is a law, not an
 * oversight: a field the operator is typing into owns its own keys. The cost
 * is that ~30 workbench find fields decode NOTHING — a gun fired with the
 * cursor in the box types literal characters and no decoder ever runs. Unbox
 * History wired the right classifier (`classifyHistoryCommandScan`) and it is
 * unreachable the moment an operator clicks into the box it feeds.
 *
 * So a find field opts IN to its own detection, with the opposite contract:
 *
 *  - it never preventDefaults a character, so live filtering keeps working and
 *    a human's typing is untouched;
 *  - it only claims the value when the burst was machine-fast AND long enough
 *    AND decodes to one of our printed handles;
 *  - a human can never reach that branch: typing at human speed resets the
 *    buffer on every gap, so the accumulated run stays 1 char and fails
 *    {@link WEDGE_MIN_LENGTH}.
 *
 * Timing constants come from the wedge machine — one SoT for "what counts as a
 * burst", so the field and the global listener cannot drift on the answer.
 */

import { decodedHandle } from '@/lib/barcode-routing';
import type { ScanRoute } from '@/lib/barcode-routing';
import { WEDGE_MAX_INTER_KEY_MS, WEDGE_MIN_LENGTH } from '@/lib/keyboard/wedge-scan-machine';

/** Running burst state for one field. Reset on every non-burst keystroke. */
export interface FindFieldBurst {
  buffer: string;
  lastKeyAt: number;
}

export const FIND_FIELD_BURST_IDLE: FindFieldBurst = { buffer: '', lastKeyAt: 0 };

/**
 * Fold one character into the burst.
 *
 * Mirrors `wedgeReduce`'s append arm exactly — a gap wider than the wedge's
 * inter-key ceiling starts the run over — so human typing can never accumulate.
 */
export function appendFindFieldKey(
  state: FindFieldBurst,
  key: string,
  timeStamp: number,
  maxInterKeyMs: number = WEDGE_MAX_INTER_KEY_MS,
): FindFieldBurst {
  if (key.length !== 1) return FIND_FIELD_BURST_IDLE;
  const gap = state.lastKeyAt === 0 ? 0 : timeStamp - state.lastKeyAt;
  const buffer = gap > maxInterKeyMs && state.buffer.length > 0 ? '' : state.buffer;
  return { buffer: buffer + key, lastKeyAt: timeStamp };
}

/** Inferred at every call site — not exported until a caller needs to name it. */
type FindFieldScan =
  /** A printed handle — the field yields and the caller navigates / selects. */
  | { kind: 'handle'; route: ScanRoute; raw: string }
  /** Anything else, including a carrier tracking number: the field's own job. */
  | { kind: 'find' };

/**
 * Decide what a committed burst means.
 *
 * A carrier TRACKING number deliberately resolves to `find`, not `handle`:
 * `routeScan` carries no carrier vocabulary, so the only honest client answer
 * is "this is text for your query". Resolving tracking needs the server
 * (`POST /api/scan/resolve`) and is a separate, async arm.
 */
export function resolveFindFieldScan(
  state: FindFieldBurst,
  minLength: number = WEDGE_MIN_LENGTH,
): FindFieldScan {
  const raw = state.buffer.trim();
  if (raw.length < minLength) return { kind: 'find' };
  const route = decodedHandle(raw);
  return route ? { kind: 'handle', route, raw } : { kind: 'find' };
}
