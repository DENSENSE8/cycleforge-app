/** Wedge detection INSIDE a find field — the pure half. */

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

/** Decide what a committed burst means. */
export function resolveFindFieldScan(
  state: FindFieldBurst,
  minLength: number = WEDGE_MIN_LENGTH,
): FindFieldScan {
  const raw = state.buffer.trim();
  if (raw.length < minLength) return { kind: 'find' };
  const route = decodedHandle(raw);
  return route ? { kind: 'handle', route, raw } : { kind: 'find' };
}

/**
 * Any committed burst at wedge speed, decoded or not — what a list's Find
 * hands to the scan kernel instead of filtering on it (`FindField`). `null`
 * when the run is shorter than a scan (human typing never accumulates).
 */
export function findFieldBurstValue(state: FindFieldBurst, minLength: number = WEDGE_MIN_LENGTH): string | null {
  const raw = state.buffer.trim();
  return raw.length >= minLength ? raw : null;
}
