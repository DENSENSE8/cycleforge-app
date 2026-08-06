/**
 * Connection health — the pure model behind offline / degraded chrome.
 *
 * Three facts, one answer. A bench can be wrong in three independent ways and
 * they are NOT the same problem:
 *
 * | Fact | Question | Owner |
 * |---|---|---|
 * | `navigator.onLine` | does this device have a network at all | the browser |
 * | Ably connection state | is this station's realtime link alive | {@link classifyRealtimeState} |
 * | offline write-queue depth | are there edits still waiting to land | the queue |
 *
 * The defect this closes: a dropped Ably connection is invisible while
 * `navigator.onLine === true`. Live updates stop, phone pairing stops answering,
 * and chrome that only watched the browser kept saying nothing — so the operator
 * learned from the work not arriving, which is the slowest possible signal.
 *
 * No React, no Ably import, no DOM: the debounce is the part that must be
 * provable by a test rather than by unplugging a router
 * (`.claude/rules/display/station.md` §8 — station-down is first-class and
 * degrade-not-block). Visible chrome today is the Operations TV pill + mobile
 * `NetworkChip` — there is no app-root banner.
 *
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`
 * (P2 · D4 · D12).
 */

/**
 * Ably's `connection.state` vocabulary, kept as a widened `string` at the
 * boundary — this module must not import `ably` (bundle altitude: every chrome
 * consumer would inherit the whole client), and an unknown future state must
 * degrade to "unknown", never throw.
 */
export type RealtimeLinkHealth = 'unknown' | 'healthy' | 'wobbling' | 'degraded';

/**
 * Ably state → house health.
 *
 * The three-way split is the whole reason a `wobbling` tier exists: Ably
 * reconnects routinely, and `disconnected` is what a *normal* wifi hiccup looks
 * like for a second or two. Treating it as degraded would flash chrome several
 * times a shift and train operators to ignore the one signal that matters when
 * the link is genuinely down — the exact failure mode this program exists to
 * close.
 *
 * `suspended` is already debounced by Ably itself (it only arrives after the
 * client has retried for ~30s), so it is degraded on sight. `failed` is an auth
 * or config failure that will not self-heal.
 *
 * **Pre-init is `unknown`, never `healthy`.** The client is created inside an
 * effect behind a dynamic `import('ably')`, and `AuthenticatedAblyProvider` does
 * not mount it at all for a signed-out visitor — so "we have not heard yet" must
 * be its own answer. `unknown` never claims the station link is down (a sign-in
 * page has no station link) and never claims health either.
 */
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

/**
 * How long a `wobbling` link must stay wobbling before the operator is told.
 *
 * 8s sits above a routine reconnect (single-digit seconds on a healthy LAN) and
 * below the point where someone has started re-scanning to find out why nothing
 * moved. Change it here, never per surface — two chrome faces disagreeing about
 * when the link counts as down is worse than either threshold.
 */
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
