/** The QR sign-in push channel — pure naming + capability, no I/O. */

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
