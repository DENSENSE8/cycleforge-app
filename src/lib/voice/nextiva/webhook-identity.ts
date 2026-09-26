/** Per-tenant Nextiva webhook identity — mirrors the Zoho Wave-3 model (src/lib/zoho/webhooks/zoho-webhook-credentials.ts). */

import { randomBytes } from 'node:crypto';
import pool from '@/lib/db';
import {
  getIntegrationCredentials,
  invalidateCredentialCache,
  type NextivaCredentials,
} from '@/lib/integrations/credentials';
import { encryptIntegrationPayload } from '@/lib/integrations/crypto';
import type { OrgId } from '@/lib/tenancy/constants';

interface NextivaWebhookIdentity {
  webhookToken: string;
  webhookSigningSecret: string;
}

function mintToken(): string {
  return randomBytes(32).toString('base64url');
}
function mintSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Ensure the org's Nextiva connection has a webhook token + secret, minting on
 * first call. Idempotent. Throws if Nextiva isn't connected for the org.
 */
async function ensureNextivaWebhookIdentity(orgId: OrgId): Promise<NextivaWebhookIdentity> {
  const creds = await getIntegrationCredentials<NextivaCredentials>(orgId, 'nextiva');
  if (!creds) {
    throw new Error(`Nextiva is not connected for org ${orgId}; cannot mint webhook identity.`);
  }
  if (creds.webhookToken && creds.webhookSigningSecret) {
    return { webhookToken: creds.webhookToken, webhookSigningSecret: creds.webhookSigningSecret };
  }

  const identity: NextivaWebhookIdentity = {
    webhookToken: creds.webhookToken || mintToken(),
    webhookSigningSecret: creds.webhookSigningSecret || mintSecret(),
  };

  const merged: NextivaCredentials = { ...creds, ...identity };
  const enc = encryptIntegrationPayload(merged);
  await pool.query(
    `UPDATE organization_integrations
        SET payload_encrypted = $3,
            webhook_token      = $4,
            updated_at         = now()
      WHERE organization_id = $1
        AND provider = $2
        AND COALESCE(scope, '') = ''`,
    [orgId, 'nextiva', enc, identity.webhookToken],
  );
  invalidateCredentialCache(orgId, 'nextiva');
  return identity;
}

/**
 * Resolve the org that owns a Nextiva webhook token. O(1) via the unique index
 * on organization_integrations.webhook_token. Only active connections match.
 */
export async function resolveOrgByNextivaWebhookToken(token: string): Promise<OrgId | null> {
  const clean = (token || '').trim();
  if (!clean) return null;
  const { rows } = await pool.query<{ organization_id: string }>(
    `SELECT organization_id
       FROM organization_integrations
      WHERE webhook_token = $1
        AND provider = 'nextiva'
        AND status = 'active'
      LIMIT 1`,
    [clean],
  );
  return (rows[0]?.organization_id as OrgId | undefined) ?? null;
}
