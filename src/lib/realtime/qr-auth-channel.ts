/**
 * The QR sign-in push channel — pure naming + capability, no I/O.
 *
 * The desktop polling for phone approval is the slow half of QR sign-in
 * (~1.5s worst case). The fast half is Ably: the phone's authorization
 * publishes `session.authorized` and the desktop completes on the websocket,
 * sub-50ms.
 *
 * ## Why the channel is anonymous, and why that is safe
 *
 * The desktop is PRE-AUTH — it cannot hold an org-scoped grant. The boundary
 * is therefore the channel name itself: `qr-auth:<sha256(token) truncated>`.
 * The token is a 128-bit+ server secret that BOTH sides already share (it is
 * the QR code), so knowing the channel name is equivalent to knowing the
 * login token — and the grant is SUBSCRIBE-ONLY with a TTL that ends with
 * the QR session. A leaked channel name lets an attacker learn what the
 * desktop already shows; it lets them sign in exactly never. Publishing stays
 * server-side (the REST key), never in the browser grant.
 *
 * Pure module: no React, no Ably import. Unit-tested in
 * `qr-auth-channel.test.ts`.
 */

import { createHash } from 'node:crypto';

/** Subscribe-only on exactly one QR channel — the anonymous desktop grant. */
export const QR_AUTH_CHANNEL_OPS = ['subscribe'] as const;

/** Channel name for one QR login session's push events. */
export function qrAuthChannelName(tokenHash: string): string {
  return `qr-auth:${tokenHash}`;
}

/** Stable, opaque channel handle for a QR login token. */
export function hashQrToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 24);
}

/** The capability map for the desktop's token: one channel, subscribe only. */
export function qrAuthCapability(tokenHash: string): Record<string, string[]> {
  return { [qrAuthChannelName(tokenHash)]: [...QR_AUTH_CHANNEL_OPS] };
}
