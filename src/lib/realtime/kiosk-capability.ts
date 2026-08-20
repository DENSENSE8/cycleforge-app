/**
 * Ably capabilities for the desk↔tablet counter bridge.
 *
 * Split out of the token routes as pure functions because a capability grant is
 * the entire security boundary of a realtime channel — Ably enforces exactly
 * what the token says and nothing else — and a boundary that can only be
 * exercised by standing up a route, a session, and an Ably key is a boundary
 * nobody tests.
 *
 * ### The asymmetry, and why it is deliberate
 *
 * A **device** gets one channel: its own. It knows its device id from its own
 * principal, so there is nothing to look up and nothing to widen.
 *
 * A **desk** gets one channel per device it has actually CLAIMED, resolved
 * server-side from the lease. Never `kiosk:*`. A wildcard would let any staffer
 * with `walk_in.view` watch every counter in the org — including the customer
 * identity and signature traffic on tablets they are not standing at — which is
 * the same mistake the per-staff bridges avoided by refusing a cross-staff
 * wildcard (`staffstation:` exists because `station:*` would have widened).
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P3 · D2).
 */

import { getKioskBridgeChannelName, orgChannelPrefix } from './channels';

/** Ably capability map: channel name → allowed operations. */
export type AblyCapability = Record<string, string[]>;

/** Both peers may talk and listen on the bridge; nothing else is granted. */
const BRIDGE_OPS = ['subscribe', 'publish'] as const;

/**
 * What a tablet may reach: its own bridge, full stop.
 *
 * No org broadcast feeds, no `db:*` row stream, no dashboard channel. The
 * device principal is unattended-capable, so every channel it can subscribe to
 * is a channel a stranger can read by walking up to the tablet.
 */
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

/**
 * Defense in depth: every granted resource must sit inside this org's prefix.
 *
 * The token route already asserts this over its whole capability map; this is
 * the same check as a reusable function so the kiosk route inherits it rather
 * than reimplementing it slightly differently. A future builder regression that
 * leaked a bare or cross-tenant name fails closed here instead of minting a
 * token that can read another tenant's counter.
 */
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
