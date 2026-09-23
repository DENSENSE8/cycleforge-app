import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { OrgId } from '@/lib/tenancy/constants';

export const WmsGatewayTicketClaimsSchema = z.object({
  v: z.literal(1),
  organizationId: z.string().min(1),
  staffId: z.number().int().positive(),
  deviceId: z.string().min(1).max(200),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().min(16).max(200),
}).strict();

export type WmsGatewayTicketClaims = z.infer<typeof WmsGatewayTicketClaimsSchema>;

function configuredSecret(): string {
  // CRON_SECRET is a server-only compatibility fallback for existing installs.
  // A dedicated key wins as soon as it is provisioned; neither leaves CycleForge.
  const secret = (process.env.WMS_GATEWAY_SECRET || process.env.CRON_SECRET)?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('WMS_GATEWAY_SECRET must contain at least 32 characters.');
  }
  return secret;
}

export function verifyWmsGatewayTicket(
  token: string,
  options: { secret?: string; now?: number } = {},
): WmsGatewayTicketClaims {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw new Error('Malformed WMS gateway ticket.');
  const expected = createHmac('sha256', options.secret ?? configuredSecret()).update(payload).digest();
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid WMS gateway ticket signature.');
  }
  const claims = WmsGatewayTicketClaimsSchema.parse(
    JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  );
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  if (claims.expiresAt < now || claims.issuedAt > now + 5) {
    throw new Error('Expired or not-yet-valid WMS gateway ticket.');
  }
  return claims;
}

export function signWmsGatewayTicket(
  identity: { organizationId: OrgId; staffId: number; deviceId: string },
  options: { secret?: string; now?: number; ttlSeconds?: number; nonce?: string } = {},
): { token: string; expiresAt: string } {
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds = options.ttlSeconds ?? 30;
  const claims = WmsGatewayTicketClaimsSchema.parse({
    v: 1,
    ...identity,
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    nonce: options.nonce ?? safeRandomUUID(),
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', options.secret ?? configuredSecret())
    .update(payload)
    .digest('base64url');
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(claims.expiresAt * 1_000).toISOString(),
  };
}
