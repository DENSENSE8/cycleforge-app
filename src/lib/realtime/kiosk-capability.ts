/**
 * Ably capabilities for the desk↔tablet counter bridge.
 * the entire security boundary of a realtime channel — Ably enforces exactly
 */

import { getKioskBridgeChannelName, orgChannelPrefix } from './channels';

/** Ably capability map: channel name → allowed operations. */
export type AblyCapability = Record<string, string[]>;

/** Both peers may talk and listen on the bridge; nothing else is granted. */
const BRIDGE_OPS = ['subscribe', 'publish'] as const;

/** What a tablet may reach: */
export function kioskDeviceCapability(orgId: string, deviceId: number): AblyCapability {
  return { [getKioskBridgeChannelName(orgId, deviceId)]: [...BRIDGE_OPS] };
}

/**
 * What a desk may reach: the bridges of the devices it currently holds.
 *
 * `deviceIds` comes from the lease table, never from the request — a device id
 * in a query string would make this grant self-service.
 */
export function deskKioskCapability(orgId: string, deviceIds: readonly number[]): AblyCapability {
  const capability: AblyCapability = {};
  for (const deviceId of deviceIds) {
    capability[getKioskBridgeChannelName(orgId, deviceId)] = [...BRIDGE_OPS];
  }
  return capability;
}

/** Defense in depth: */
export function capabilityLeaksOutsideOrg(orgId: string, capability: AblyCapability): string | null {
  const prefix = `${orgChannelPrefix(orgId)}:`;
  for (const resource of Object.keys(capability)) {
    if (!resource.startsWith(prefix)) return resource;
  }
  return null;
}

/** The Ably `clientId` stamped on every message a tablet publishes. */
export function kioskClientId(orgId: string, deviceId: number): string {
  return `org:${String(orgId).trim().toLowerCase()}:kiosk:${deviceId}`;
}
