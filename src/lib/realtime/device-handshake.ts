/** Desk → phone **send-to-device handshake** — one ACK grammar for every Station bench. */

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

/** How long the desk waits before calling the phone unreachable. */
const SEND_TO_DEVICE_TIMEOUT_MS = 6_000;

/** Which desk action is being acknowledged. Extend this, not the event list. */
export type DeviceAckKind =
  | 'receiving_photo'
  | 'receiving_share'
  | 'pack_scan'
  | 'unit_photo'
  | 'stock_photo'
  | 'print_job'
  | 'prepack_serial';

/** `idle → request_sent → peer_active | timed_out`. */
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

/** Desk side: publish a request and wait for a phone to answer. */
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
