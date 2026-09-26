/** Payload shape for `receiving_photo.reassign`. */

type ReassignTargetType = 'RECEIVING' | 'RECEIVING_LINE';

interface ReassignMove {
  photoId: number;
  targetEntityType: ReassignTargetType;
  targetEntityId: number;
}

type NormalizeResult =
  | { ok: true; moves: ReassignMove[] }
  | { ok: false; error: string };

/** Upper bound on one mutation. */
export const MAX_REASSIGN_MOVES = 50;

function isTargetType(v: unknown): v is ReassignTargetType {
  return v === 'RECEIVING' || v === 'RECEIVING_LINE';
}

function positiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizeReassignPayload(payload: Record<string, unknown>): NormalizeResult {
  const rawMoves = payload.moves;

  // Canonical form — also what an inverse always carries.
  if (Array.isArray(rawMoves)) {
    if (rawMoves.length === 0) return { ok: false, error: 'moves must not be empty' };
    if (rawMoves.length > MAX_REASSIGN_MOVES) {
      return {
        ok: false,
        error: `too many photos in one change (${rawMoves.length}); the limit is ${MAX_REASSIGN_MOVES}. Split it into batches.`,
      };
    }
    const moves: ReassignMove[] = [];
    for (const [i, raw] of rawMoves.entries()) {
      if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: `moves[${i}] must be an object` };
      }
      const m = raw as Record<string, unknown>;
      const photoId = positiveInt(m.photoId);
      const targetEntityId = positiveInt(m.targetEntityId);
      if (photoId == null) return { ok: false, error: `moves[${i}].photoId must be a positive number` };
      if (!isTargetType(m.targetEntityType)) {
        return {
          ok: false,
          error: `moves[${i}].targetEntityType must be 'RECEIVING' (carton) or 'RECEIVING_LINE'`,
        };
      }
      if (targetEntityId == null) {
        return { ok: false, error: `moves[${i}].targetEntityId must be a positive number` };
      }
      moves.push({ photoId, targetEntityType: m.targetEntityType, targetEntityId });
    }
    return dedupe(moves);
  }

  // Sugar — one destination for one or many photos.
  const targetEntityType = payload.targetEntityType;
  const targetEntityId = positiveInt(payload.targetEntityId);
  if (!isTargetType(targetEntityType)) {
    return {
      ok: false,
      error: "targetEntityType must be 'RECEIVING' (carton) or 'RECEIVING_LINE'",
    };
  }
  if (targetEntityId == null) {
    return { ok: false, error: 'targetEntityId must be a positive number' };
  }

  const ids: unknown[] = Array.isArray(payload.photoIds)
    ? payload.photoIds
    : payload.photoId !== undefined
      ? [payload.photoId]
      : [];
  if (ids.length === 0) return { ok: false, error: 'photoIds must name at least one photo' };
  if (ids.length > MAX_REASSIGN_MOVES) {
    return {
      ok: false,
      error: `too many photos in one change (${ids.length}); the limit is ${MAX_REASSIGN_MOVES}. Split it into batches.`,
    };
  }

  const moves: ReassignMove[] = [];
  for (const [i, raw] of ids.entries()) {
    const photoId = positiveInt(raw);
    if (photoId == null) return { ok: false, error: `photoIds[${i}] must be a positive number` };
    moves.push({ photoId, targetEntityType, targetEntityId });
  }
  return dedupe(moves);
}

/**
 * A photo named twice is a mistake, not an instruction to move it twice.
 * Rejecting beats silently keeping the last one: the operator asked for
 * something incoherent and should hear so.
 */
function dedupe(moves: ReassignMove[]): NormalizeResult {
  const seen = new Set<number>();
  for (const m of moves) {
    if (seen.has(m.photoId)) {
      return { ok: false, error: `photo ${m.photoId} appears more than once` };
    }
    seen.add(m.photoId);
  }
  return { ok: true, moves };
}
