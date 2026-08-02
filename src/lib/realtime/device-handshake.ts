/**
 * Desk → phone **send-to-device handshake** — one ACK grammar for every Station
 * bench.
 *
 * ### The problem this closes
 *
 * An Ably `publish()` resolves whether or not anything is listening. So a desk
 * that published a capture request and showed "Sent to phone" was reporting
 * that it *spoke*, not that anyone *heard* — and the operator learned the phone
 * was locked, signed out, or on the wrong account only by standing there
 * waiting for a camera that never opened.
 *
 * The receiving **share** path already solved this correctly, inline in
 * `useReceivingLineCore`: subscribe to an ACK before publishing, race it against
 * a 6s timeout, and tell the truth either way. This module is that pattern
 * lifted out of the one hook that had it, so the photo-request and pack paths —
 * which published blind — participate in the same grammar instead of each
 * growing their own.
 *
 * ### One ACK family, deliberately
 *
 * `station_device_ack` is THE reply event, carrying the `request_id` it answers.
 * Every new participant publishes it; the waiter also accepts the legacy
 * `receiving_share_ack` so the live share path keeps working with no flag day.
 * Adding a third ack event name for a fourth bench would re-create exactly the
 * per-domain sprawl this consolidation removes — extend `DeviceAckKind` instead.
 *
 * Channel and payload stay ephemeral Ably (D3): no claim row, no outbox. The
 * channel name is still the pairing gate (`staffstation:{staffId}` /
 * `packer:{staffId}`), and with multiple phones on one staff id the fastest to
 * answer wins (D11) — which is the honest answer to "is *a* phone there?", the
 * only question the desk is actually asking.
 *
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`
 * (P1 · D2 · D3 · D11).
 */

/** THE ack event. New participants publish this one. */
export const STATION_DEVICE_ACK_EVENT = 'station_device_ack';

/**
 * The receiving-share path's original ack. Kept as an accepted INBOUND name so
 * a phone running older code still satisfies a fresh desk. Do not add more.
 */
export const LEGACY_RECEIVING_SHARE_ACK_EVENT = 'receiving_share_ack';

/** Every event name a desk-side waiter listens on. */
export const DEVICE_ACK_EVENTS = [
  STATION_DEVICE_ACK_EVENT,
  LEGACY_RECEIVING_SHARE_ACK_EVENT,
] as const;

/**
 * How long the desk waits before calling the phone unreachable.
 *
 * 6s is inherited from the share path rather than re-derived: it is long enough
 * for a backgrounded phone to wake its websocket and short enough that an
 * operator does not stand at the bench guessing. Changing it changes the
 * false-"unreachable" rate, so change it here — never per call site.
 */
const SEND_TO_DEVICE_TIMEOUT_MS = 6_000;

/** Which desk action is being acknowledged. Extend this, not the event list. */
export type DeviceAckKind = 'receiving_photo' | 'receiving_share' | 'pack_scan' | 'unit_photo';

/**
 * `idle → request_sent → peer_active | timed_out`.
 *
 * `peer_active` means a phone ANSWERED, not that a photo arrived — those are
 * different facts with different failure modes, and collapsing them would make
 * "the operator never took the picture" look identical to "the phone never woke
 * up". Upload progress is the capture-upload card's job (P0).
 */
export type SendToDeviceState = 'idle' | 'request_sent' | 'peer_active' | 'timed_out';

type AckMessage = { data?: { request_id?: string | null } | null };
type AckHandler = (msg: AckMessage) => void;

/** The slice of an Ably channel this module needs — keeps it testable. */
export interface DeviceAckChannel {
  publish(event: string, data: Record<string, unknown>): Promise<unknown>;
  subscribe(event: string, handler: AckHandler): Promise<unknown> | unknown;
  unsubscribe(event: string, handler: AckHandler): unknown;
}

/** Does this message acknowledge exactly `requestId`? */
export function isAckFor(msg: AckMessage, requestId: string): boolean {
  const id = String(msg?.data?.request_id ?? '').trim();
  return id.length > 0 && id === requestId;
}

/**
 * Phone side: confirm receipt. Never throws — a failed ack must not break the
 * capture flow the operator actually cares about; the desk simply falls back to
 * reporting the phone unreachable, which is the safe direction to be wrong in.
 */
export async function publishDeviceAck(
  channel: DeviceAckChannel | null | undefined,
  requestId: string | null | undefined,
  kind: DeviceAckKind,
): Promise<void> {
  const id = String(requestId ?? '').trim();
  if (!channel || !id) return;
  try {
    await channel.publish(STATION_DEVICE_ACK_EVENT, { request_id: id, kind });
  } catch {
    /* best-effort by design — see docblock */
  }
}

interface SendToDeviceArgs {
  channel: DeviceAckChannel;
  requestId: string;
  /** Publishes the actual request. Runs AFTER the ack subscription is live. */
  publish: () => Promise<void>;
  timeoutMs?: number;
}

/**
 * Desk side: publish a request and wait for a phone to answer.
 *
 * Returns `true` when a phone acked within the window. **Subscribes before
 * publishing** — a phone on the same LAN can ack in single-digit milliseconds,
 * so subscribing afterwards loses the race and reports a reachable phone as
 * unreachable. That ordering is the whole reason this is a function and not two
 * lines at each call site.
 *
 * Throws only what `publish` throws (a genuine send failure the caller should
 * surface differently from silence).
 */
export async function sendToDevice({
  channel,
  requestId,
  publish,
  timeoutMs = SEND_TO_DEVICE_TIMEOUT_MS,
}: SendToDeviceArgs): Promise<boolean> {
  // Ref so the finally block can release the promise — a bare `let settle = null`
  // stays typed as `null` after the Promise executor (TS does not track the sync assign).
  const settleRef: { current: ((acked: boolean) => void) | null } = { current: null };
  const handlers: Array<[string, AckHandler]> = [];

  const acked = new Promise<boolean>((resolve) => {
    settleRef.current = resolve;
    for (const event of DEVICE_ACK_EVENTS) {
      const handler: AckHandler = (msg) => {
        if (isAckFor(msg, requestId)) resolve(true);
      };
      handlers.push([event, handler]);
      try {
        const maybe = channel.subscribe(event, handler);
        // A rejected subscribe must not leave the caller hanging until timeout.
        if (maybe && typeof (maybe as Promise<unknown>).catch === 'function') {
          void (maybe as Promise<unknown>).catch(() => resolve(false));
        }
      } catch {
        resolve(false);
      }
    }
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await publish();
    return await Promise.race([
      acked,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    settleRef.current?.(false); // release the ack promise so its closure can be collected
    for (const [event, handler] of handlers) {
      try {
        channel.unsubscribe(event, handler);
      } catch {
        /* channel already torn down */
      }
    }
  }
}
