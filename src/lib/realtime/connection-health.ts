/** Connection health — the pure model behind offline / degraded chrome. */

/** Ably's `connection.state` vocabulary, kept as a widened `string` at the boundary — this module must not import `ably` (bundle altitude: */
export type RealtimeLinkHealth = 'unknown' | 'healthy' | 'wobbling' | 'degraded';

/** Ably state → house health. */
export function classifyRealtimeState(state: string | null | undefined): RealtimeLinkHealth {
  switch (String(state ?? '').trim()) {
    case 'connected':
      return 'healthy';
    case 'disconnected':
    case 'closing':
      return 'wobbling';
    case 'suspended':
    case 'failed':
    case 'closed':
      return 'degraded';
    default:
      // 'initialized' | 'connecting' | anything Ably adds later.
      return 'unknown';
  }
}

/** How long a `wobbling` link must stay wobbling before the operator is told. */
export const REALTIME_DEGRADE_GRACE_MS = 8_000;

interface RealtimeDegradeInput {
  health: RealtimeLinkHealth;
  /** How long `health` has been continuously held, in ms. */
  heldMs: number;
  graceMs?: number;
}

/** Should the surface say the realtime link is down? */
export function isRealtimeDegraded({
  health,
  heldMs,
  graceMs = REALTIME_DEGRADE_GRACE_MS,
}: RealtimeDegradeInput): boolean {
  if (health === 'degraded') return true;
  if (health === 'wobbling') return heldMs >= graceMs;
  return false;
}

/**
 * The wall/pill-scale label for a degraded realtime link. A 40-ft board has no
 * room for a full sentence, but it must not invent a second word for the same
 * fact (D12: Monitor shows connection status read-only).
 */
export const REALTIME_DEGRADED_LABEL = 'Sync paused';
