import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { safeRandomUUID } from '@/lib/safe-uuid';

const LocationScanProofClaims = z.object({
  v: z.literal(1),
  organizationId: z.string().min(1),
  staffId: z.number().int().positive(),
  locationCode: z.string().trim().min(1).max(200),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().min(16).max(200),
}).strict();

export type LocationScanProofClaims = z.infer<typeof LocationScanProofClaims>;

function configuredSecret(): string {
  const secret = (process.env.WMS_GATEWAY_SECRET || process.env.CRON_SECRET)?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('WMS_GATEWAY_SECRET must contain at least 32 characters.');
  }
  return secret;
}

function canonicalLocation(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Proof that the signed-in operator physically scanned this location. It is
 * bound to tenant, staff member, and location so copying a URL cannot
 * authorize another person or another bin. Age does not revoke it.
 */
export function signLocationScanProof(
  identity: { organizationId: string; staffId: number; locationCode: string },
  options: { secret?: string; now?: number; ttlSeconds?: number; nonce?: string } = {},
): { token: string; expiresAt: string } {
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const claims = LocationScanProofClaims.parse({
    v: 1,
    organizationId: identity.organizationId,
    staffId: identity.staffId,
    locationCode: canonicalLocation(identity.locationCode),
    issuedAt: now,
    expiresAt: now + (options.ttlSeconds ?? 5 * 60),
    nonce: options.nonce ?? safeRandomUUID(),
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', options.secret ?? configuredSecret())
    .update(payload)
    .digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: new Date(claims.expiresAt * 1_000).toISOString() };
}

export function verifyLocationScanProof(
  token: string,
  expected: { organizationId: string; staffId: number; locationCode: string },
  options: { secret?: string; now?: number } = {},
): LocationScanProofClaims {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw new Error('Scan this location again to edit stock.');
  const expectedSignature = createHmac('sha256', options.secret ?? configuredSecret()).update(payload).digest();
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    throw new Error('Scan this location again to edit stock.');
  }
  const claims = LocationScanProofClaims.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  // A location scan stays valid for that staff member and that bin. Age is not
  // a reason to stop adjusting; a stamp from the future is.
  if (claims.issuedAt > now + 5) throw new Error('This scan does not authorize changes at this location.');
  if (
    claims.organizationId !== expected.organizationId
    || claims.staffId !== expected.staffId
    || claims.locationCode !== canonicalLocation(expected.locationCode)
  ) {
    throw new Error('This scan does not authorize changes at this location.');
  }
  return claims;
}
