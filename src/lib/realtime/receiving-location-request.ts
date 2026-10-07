/**
 * Desk → phone **location scan request** over the `staffstation:{staffId}`
 * bridge (the same channel the photo requests and their acks ride). The Unbox
 * Location pill sends it; the phone bridge acks it as `receiving_location` and
 * opens the LPN location screen.
 */

import { getStaffStationBridgeChannelName, safeChannelName } from './channels';
import { receivingHandle } from '@/lib/barcode-routing';

export const RECEIVING_LOCATION_REQUEST_EVENT = 'receiving_location_request';

interface BridgeClient {
  channels: { get: (name: string) => { publish: (event: string, data: Record<string, unknown>) => Promise<void> } };
}

export interface ReceivingLocationRequest {
  receivingId: number;
  /** The open receiving line to place, or null to place the LPN itself. */
  lineId: number | null;
  /** The R-* plate the phone paints (`R-53426`). */
  license: string;
  requestId: string;
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The bridge channel both the request and its ack ride; '' when there is no pairing gate. */
export function receivingLocationRequestChannel(orgId: string | null | undefined, staffId: number): string {
  if (!orgId || staffId <= 0) return '';
  return safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId));
}

/** Wire payload (snake_case). Null when the receiving id is not a real one. */
export function buildReceivingLocationRequestPayload(input: {
  receivingId: number;
  lineId: number | null | undefined;
  requestId: string;
  staffId: number;
}): Record<string, unknown> | null {
  const receivingId = positiveInt(input.receivingId);
  const requestId = String(input.requestId ?? '').trim();
  if (receivingId == null || !requestId) return null;
  const lineId = positiveInt(input.lineId);
  return {
    receiving_id: receivingId,
    receiving_line_id: lineId,
    license: receivingHandle(receivingId),
    request_id: requestId,
    requested_by_staff_id: input.staffId,
  };
}

/** Phone side: parse a request; null for anything that is not one. */
export function parseReceivingLocationRequest(data: unknown): ReceivingLocationRequest | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const receivingId = positiveInt(raw.receiving_id);
  const requestId = String(raw.request_id ?? '').trim();
  if (receivingId == null || !requestId) return null;
  return {
    receivingId,
    lineId: positiveInt(raw.receiving_line_id),
    // The plate is derived, never trusted from the wire — one helper names it.
    license: receivingHandle(receivingId),
    requestId,
  };
}

/** Caller mints `requestId` (useSendToDevice) so the ack waiter can match it. */
export async function publishReceivingLocationRequest(
  client: BridgeClient | null,
  orgId: string | null | undefined,
  staffId: number,
  input: { receivingId: number; lineId: number | null | undefined; requestId: string },
): Promise<void> {
  const channel = receivingLocationRequestChannel(orgId, staffId);
  const payload = buildReceivingLocationRequestPayload({ ...input, staffId });
  if (!client || !channel || !payload) return;
  await client.channels.get(channel).publish(RECEIVING_LOCATION_REQUEST_EVENT, payload);
}
