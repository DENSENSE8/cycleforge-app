/**
 * Connection health — the pure model behind every offline / degraded banner.
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
 * and the banner keeps saying nothing — so the operator learns from the work not
 * arriving, which is the slowest possible signal.
 *
 * No React, no Ably import, no DOM: the precedence ladder and the debounce are
 * the parts that must be provable by a test rather than by unplugging a router
 * (`.claude/rules/display/station.md` §8 — station-down is first-class and
 * degrade-not-block).
 *
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`
 * (P2 · D4 · D12).
 */

/**
 * Ably's `connection.state` vocabulary, kept as a widened `string` at the
 * boundary — this module must not import `ably` (bundle altitude: every banner
 * consumer would inherit the whole client), and an unknown future state must
 * degrade to "unknown", never throw.
 */
export type RealtimeLinkHealth = 'unknown' | 'healthy' | 'wobbling' | 'degraded';

/**
 * Ably state → house health.
 *
 * The three-way split is the whole reason a `wobbling` tier exists: Ably
 * reconnects routinely, and `disconnected` is what a *normal* wifi hiccup looks
 * like for a second or two. Treating it as degraded would flash the banner
 * several times a shift and train operators to ignore the one signal that
 * matters when the link is genuinely down — the exact failure mode this program
 * exists to close.
 *
 * `suspended` is already debounced by Ably itself (it only arrives after the
 * client has retried for ~30s), so it is degraded on sight. `failed` is an auth
 * or config failure that will not self-heal.
 *
 * **Pre-init is `unknown`, never `healthy`.** The client is created inside an
 * effect behind a dynamic `import('ably')`, and `AuthenticatedAblyProvider` does
 * not mount it at all for a signed-out visitor — so "we have not heard yet" must
 * be its own answer. `unknown` never shows a banner (a sign-in page must not
 * claim the station link is down) and never claims health either.
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
 * moved. Change it here, never per surface — two banners disagreeing about when
 * the link counts as down is worse than either threshold.
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
 * The banner's identity — what it is telling the operator, not how it looks.
 * Surfaces pick their own geometry (a desk band, a phone slide-down, a wall
 * pill); they must not re-derive which of these is true.
 */
export type ConnectionChromeKind =
  | 'hidden'
  | 'offline'
  | 'realtime-degraded'
  | 'syncing'
  | 'recovered';

export interface ConnectionChrome {
  kind: ConnectionChromeKind;
  tone: 'danger' | 'warning' | 'success';
  /** One line, operator language, legible at ~3 ft. Never Ably jargon. */
  message: string;
}

interface ConnectionChromeInput {
  /** `navigator.onLine`. */
  online: boolean;
  /** Already debounced — see {@link isRealtimeDegraded}. */
  realtimeDegraded: boolean;
  /** Offline write-queue depth. */
  queueDepth: number;
  /** True for a brief beat after coming back online, to confirm recovery. */
  recovered: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fold the three facts into the one line a banner shows.
 *
 * **Precedence, and why:**
 * 1. `offline` — the device has no network. It explains every other symptom, so
 *    saying anything else first would be describing a consequence as a cause.
 * 2. `realtime-degraded` — this outranks a draining queue deliberately. A queue
 *    with depth drains itself and is visibly self-resolving; a paused link is
 *    the silent one, and the silent failure is the one that needs the banner.
 * 3. `syncing` — edits still landing.
 * 4. `recovered` — the transient all-clear.
 *
 * The degraded copy must say what still WORKS. An operator who reads "sync
 * paused" and stops scanning has been made worse off than one who was told
 * nothing: scans still record locally and land when the link returns
 * (degrade-not-block, `station.md` §8).
 */
export function resolveConnectionChrome({
  online,
  realtimeDegraded,
  queueDepth,
  recovered,
}: ConnectionChromeInput): ConnectionChrome {
  if (!online) {
    return {
      kind: 'offline',
      tone: 'danger',
      message:
        queueDepth > 0
          ? `Offline — ${plural(queueDepth, 'change')} queued`
          : 'Offline — edits queue until you reconnect',
    };
  }

  if (realtimeDegraded) {
    return {
      kind: 'realtime-degraded',
      tone: 'warning',
      message: REALTIME_DEGRADED_MESSAGE,
    };
  }

  if (queueDepth > 0) {
    return {
      kind: 'syncing',
      tone: 'warning',
      message: `Syncing ${plural(queueDepth, 'queued change')}…`,
    };
  }

  if (recovered) {
    return { kind: 'recovered', tone: 'success', message: '✓ Back online' };
  }

  return { kind: 'hidden', tone: 'success', message: '' };
}

/**
 * The degraded line, in one place.
 *
 * "Station sync paused" names the consequence; "scans still save" names what is
 * unaffected. Neither half is optional — the first without the second reads as
 * "stop working", and the second without the first explains nothing.
 */
export const REALTIME_DEGRADED_MESSAGE = 'Station sync paused — scans still save';

/**
 * The wall/pill-scale label for the same state. A 40-ft board has no room for
 * the full sentence, but it must not invent a second word for the same fact
 * (D12: Monitor shows connection status read-only).
 */
export const REALTIME_DEGRADED_LABEL = 'Sync paused';
