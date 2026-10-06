/** Desktop ↔ phone handoff for scanning a serial into the desk prepack form. */

import { getStaffStationBridgeChannelName, safeChannelName } from './channels';
import { prepackHref } from '@/lib/nav/route-tree';

export const PREPACK_SERIAL_REQUEST_EVENT = 'prepack_serial_request';
export const PREPACK_SERIAL_SELECTED_EVENT = 'prepack_serial_selected';
const LOCAL_PREPACK_SERIAL_REQUEST_KEY = 'cf:local-prepack-serial-request';
const LOCAL_REQUEST_TTL_MS = 60_000;

interface BridgeClient {
  channels: { get: (name: string) => { publish: (event: string, data: Record<string, unknown>) => Promise<void> } };
}

export interface PrepackSerialRequest {
  requestId: string;
}

function channelName(orgId: string | null | undefined, staffId: number): string {
  if (!orgId || staffId <= 0) return '';
  return safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId));
}

function markLocal(key: string, requestId: string): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ requestId, at: Date.now() }));
  } catch {
    // Echo protection is best-effort; another signed-in device still receives the handoff.
  }
}

function consumeLocal(key: string, requestId: string): boolean {
  if (!requestId) return false;
  try {
    const raw = sessionStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) as { requestId?: string; at?: number } : null;
    if (saved?.requestId !== requestId) return false;
    if (!Number.isFinite(saved.at) || Date.now() - Number(saved.at) > LOCAL_REQUEST_TTL_MS) {
      sessionStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Caller mints `requestId` (useSendToDevice) so the ack waiter can match it. */
export async function publishPrepackSerialRequest(
  client: BridgeClient | null,
  orgId: string | null | undefined,
  staffId: number,
  input: PrepackSerialRequest,
): Promise<void> {
  const channel = channelName(orgId, staffId);
  const requestId = input.requestId.trim();
  if (!client || !channel || !requestId) return;
  markLocal(LOCAL_PREPACK_SERIAL_REQUEST_KEY, requestId);
  await client.channels.get(channel).publish(PREPACK_SERIAL_REQUEST_EVENT, {
    request_id: requestId,
    requested_by_staff_id: staffId,
  });
}

export async function publishPrepackSerialSelected(
  client: BridgeClient | null,
  orgId: string | null | undefined,
  staffId: number,
  requestId: string,
  serial: string,
): Promise<void> {
  const channel = channelName(orgId, staffId);
  if (!client || !channel || !requestId.trim() || !serial.trim()) return;
  await client.channels.get(channel).publish(PREPACK_SERIAL_SELECTED_EVENT, {
    request_id: requestId.trim(),
    serial: serial.trim(),
    selected_by_staff_id: staffId,
  });
}

export function parsePrepackSerialRequest(data: unknown): PrepackSerialRequest | null {
  if (!data || typeof data !== 'object') return null;
  const requestId = String((data as Record<string, unknown>).request_id ?? '').trim();
  return requestId ? { requestId } : null;
}

export function prepackSerialHandoffHref(request: PrepackSerialRequest): string {
  return prepackHref('mobile', { serialRequestId: request.requestId });
}

export function prepackSerialBridgeChannel(
  orgId: string | null | undefined,
  staffId: number,
): string {
  return channelName(orgId, staffId);
}

/** True once, only in the tab that dispatched the handoff. */
export function consumeLocalPrepackSerialRequest(requestId: string): boolean {
  return consumeLocal(LOCAL_PREPACK_SERIAL_REQUEST_KEY, requestId);
}
