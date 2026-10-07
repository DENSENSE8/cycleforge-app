/** eBay Marketplace Account Deletion / Closure notifications. */
import { createHash, createVerify } from 'node:crypto';
import { normalizeEnvValue } from '@/lib/env-utils';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ebayTokenEndpoint,
  isEbaySandbox,
  normalizeEbayEnvironment,
  type EbayEnvironment,
} from './oauth-config';
import { EBAY_PLATFORM_PREDICATE, deleteEbayAccount } from './credentials';

const DEFAULT_ENDPOINT_URL =
  'https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion';

const PUBLIC_KEY_PRODUCTION =
  'https://api.ebay.com/commerce/notification/v1/public_key/';
const PUBLIC_KEY_SANDBOX =
  'https://api.sandbox.ebay.com/commerce/notification/v1/public_key/';

const APP_SCOPE = 'https://api.ebay.com/oauth/api_scope';

/** eBay's documented verify algorithm name (OpenSSL alias for SHA1-with-RSA). */
const SIGNATURE_ALGORITHM = 'ssl3-sha1';

interface AppTokenCacheEntry {
  token: string;
  expiresAt: number;
}
const appTokenCache = new Map<string, AppTokenCacheEntry>();

interface PublicKeyCacheEntry {
  key: string;
  algorithm?: string;
  digest?: string;
  expiresAt: number;
}
const publicKeyCache = new Map<string, PublicKeyCacheEntry>();

interface MarketplaceDeletionConfig {
  verificationToken: string;
  endpointUrl: string;
  environment: EbayEnvironment;
  appId: string | null;
  certId: string | null;
}

export function getMarketplaceDeletionConfig(): MarketplaceDeletionConfig {
  const verificationToken = normalizeEnvValue(process.env.EBAY_VERIFICATION_TOKEN) ?? '';
  const endpointUrl =
    normalizeEnvValue(process.env.EBAY_MARKETPLACE_DELETION_ENDPOINT_URL) ??
    DEFAULT_ENDPOINT_URL;
  return {
    verificationToken,
    endpointUrl,
    environment: normalizeEbayEnvironment(process.env.EBAY_ENVIRONMENT),
    appId: normalizeEnvValue(process.env.EBAY_APP_ID),
    certId: normalizeEnvValue(process.env.EBAY_CERT_ID),
  };
}

/**
 * SHA-256(challengeCode + verificationToken + endpointUrl) as hex.
 * Uses sequential hash.update() to match eBay's official Node SDK exactly.
 */
export function buildChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpointUrl: string,
): string {
  const hash = createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpointUrl);
  return hash.digest('hex');
}

export function isValidVerificationToken(token: string): boolean {
  // Portal: 32–80 chars, letters / digits / underscore / hyphen only.
  return /^[A-Za-z0-9_-]{32,80}$/.test(token);
}

interface EbaySignatureHeader {
  alg?: string;
  kid: string;
  signature: string;
  digest?: string;
}

/** Base64-decode the X-EBAY-SIGNATURE header into its JSON payload. */
export function parseEbaySignatureHeader(header: string): EbaySignatureHeader | null {
  try {
    const json = Buffer.from(header, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as EbaySignatureHeader;
    if (!parsed?.kid || !parsed?.signature) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Match eBay event-notification-nodejs-sdk `formatKey`: */
function formatPemPublicKey(key: string): string {
  const trimmed = key.trim();
  const withBegin = trimmed.replace(
    /-----BEGIN PUBLIC KEY-----/,
    '-----BEGIN PUBLIC KEY-----\n',
  );
  const withEnds = withBegin.includes('BEGIN PUBLIC KEY')
    ? withBegin.replace(/-----END PUBLIC KEY-----/, '\n-----END PUBLIC KEY-----')
    : `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
  // Collapse accidental blank double-newlines from keys that already had breaks.
  return withEnds.replace(/\n{3,}/g, '\n\n');
}

async function getApplicationAccessToken(
  appId: string,
  certId: string,
  environment: EbayEnvironment,
): Promise<string> {
  const cacheKey = `${environment}:${appId}`;
  const cached = appTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const basic = Buffer.from(`${appId}:${certId}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: APP_SCOPE,
  });
  const res = await fetch(ebayTokenEndpoint(environment), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay app-token for notification public key failed: HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const ttlMs = Math.max(60, (data.expires_in || 7200) - 60) * 1000;
  appTokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + ttlMs });
  return data.access_token;
}

async function fetchNotificationPublicKey(
  kid: string,
  config: MarketplaceDeletionConfig,
): Promise<string> {
  const cached = publicKeyCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  if (!config.appId || !config.certId) {
    throw new Error('EBAY_APP_ID / EBAY_CERT_ID required to verify notification signatures');
  }

  const token = await getApplicationAccessToken(config.appId, config.certId, config.environment);
  const base = isEbaySandbox(config.environment) ? PUBLIC_KEY_SANDBOX : PUBLIC_KEY_PRODUCTION;
  const res = await fetch(`${base}${encodeURIComponent(kid)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay public key fetch failed: HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as { key: string; algorithm?: string; digest?: string };
  if (!data?.key) throw new Error('eBay public key response missing key');
  publicKeyCache.set(kid, {
    key: data.key,
    algorithm: data.algorithm,
    digest: data.digest,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return data.key;
}

/** Verify X-EBAY-SIGNATURE over the exact raw request body bytes eBay signed. */
export async function verifyEbayNotificationSignature(
  rawBody: string,
  signatureHeader: string,
  config: MarketplaceDeletionConfig = getMarketplaceDeletionConfig(),
  parsedFallback?: unknown,
): Promise<boolean> {
  const parsed = parseEbaySignatureHeader(signatureHeader);
  if (!parsed) return false;

  const publicKey = await fetchNotificationPublicKey(parsed.kid, config);
  const pem = formatPemPublicKey(publicKey);

  // Official SDK verifies with ALGORITHM='ssl3-sha1' over JSON.stringify(parsed).
  // Also try raw body (exact bytes eBay may have signed) and RSA-SHA1 aliases.
  const algorithms = [
    SIGNATURE_ALGORITHM, // ssl3-sha1 — eBay SDK default
    parsed.alg === 'sha1' || parsed.digest === 'SHA1' ? 'RSA-SHA1' : null,
    'RSA-SHA1',
    'sha1',
  ].filter((v, i, arr): v is string => typeof v === 'string' && arr.indexOf(v) === i);

  const payloads: string[] = [];
  if (parsedFallback !== undefined) payloads.push(JSON.stringify(parsedFallback));
  payloads.push(rawBody);

  for (const payload of payloads) {
    for (const algorithm of algorithms) {
      try {
        const verifier = createVerify(algorithm);
        verifier.update(payload);
        if (verifier.verify(pem, parsed.signature, 'base64')) return true;
      } catch {
        /* try next algorithm / payload */
      }
    }
  }

  return false;
}

export interface MarketplaceDeletionNotification {
  metadata?: { topic?: string; schemaVersion?: string; deprecated?: boolean };
  notification?: {
    notificationId?: string;
    eventDate?: string;
    publishDate?: string;
    publishAttemptCount?: number;
    data?: {
      username?: string;
      userId?: string;
      eiasToken?: string;
    };
  };
}

export function extractDeletionSubjects(
  payload: MarketplaceDeletionNotification,
): { userId: string | null; username: string | null; notificationId: string | null } {
  const data = payload?.notification?.data;
  const userId = typeof data?.userId === 'string' && data.userId.trim() ? data.userId.trim() : null;
  const username =
    typeof data?.username === 'string' && data.username.trim() ? data.username.trim() : null;
  const notificationId =
    typeof payload?.notification?.notificationId === 'string'
      ? payload.notification.notificationId
      : null;
  return { userId, username, notificationId };
}

interface PurgedEbayAccount {
  organizationId: OrgId;
  accountId: number;
  accountName: string;
  accountRole: string | null;
  ebayUserId: string | null;
}

/**
 * Hard-delete every ebay_accounts row whose ebay_user_id matches the notified
 * eBay user (seller or buyer). Also deactivates mirrored platform_accounts.
 * Idempotent: no matching rows → empty result, still a success for eBay.
 */
export async function purgeEbayUserData(opts: {
  userId: string | null;
  username: string | null;
  notificationId?: string | null;
}): Promise<PurgedEbayAccount[]> {
  const ids = [opts.userId, opts.username].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (ids.length === 0) return [];

  // Cross-org lookup on the owner pool — eBay notifies by eBay user, not CF org.
  const found = await pool.query<{
    id: number;
    organization_id: string;
    account_name: string;
    ebay_user_id: string | null;
    account_role: string | null;
  }>(
    `SELECT id, organization_id, account_name, ebay_user_id, account_role
       FROM ebay_accounts
      WHERE ebay_user_id = ANY($1::text[])
        AND ${EBAY_PLATFORM_PREDICATE}`,
    [ids],
  );

  const purged: PurgedEbayAccount[] = [];
  for (const row of found.rows) {
    const orgId = row.organization_id as OrgId;
    const accountName = await deleteEbayAccount(orgId, row.id);
    if (!accountName) continue;

    // Best-effort catalog deactivate — the connect mirror may place this
    // account on ANY platform (connect-popover pairing via store links), not
    // just the seeded 'ebay' one. Scope prefixes prove a row is this account's
    // mirror; a bare-slug row only counts on the platform its store link names.
    try {
      await tenantQuery(
        orgId,
        `UPDATE platform_accounts pa
            SET is_active = false, updated_at = NOW()
          WHERE pa.organization_id = $1
            AND (
              pa.integration_scope = ('seller:' || $2)
              OR pa.integration_scope = ('buyer:' || $2)
              OR (pa.slug = $2 AND EXISTS (
                    SELECT 1 FROM integration_store_links l
                     WHERE l.organization_id = $1
                       AND l.provider = 'ebay'
                       AND l.external_store_id = $2
                       AND l.platform_id = pa.platform_id))
            )`,
        [orgId, accountName],
      );
    } catch {
      /* non-fatal — token purge is the compliance requirement */
    }

    try {
      await recordAudit(pool, null, null, {
        source: 'ebay.marketplace_account_deletion',
        action: AUDIT_ACTION.INTEGRATION_DISCONNECT,
        entityType: AUDIT_ENTITY.INTEGRATION,
        entityId: row.id,
        organizationIdOverride: orgId,
        method: 'system',
        reasonCode: 'marketplace_account_deletion',
        extra: {
          provider: 'ebay',
          accountName,
          accountRole: row.account_role,
          ebayUserId: row.ebay_user_id,
          notificationId: opts.notificationId ?? null,
        },
      });
    } catch {
      /* audit must not block compliance ack */
    }

    purged.push({
      organizationId: orgId,
      accountId: row.id,
      accountName,
      accountRole: row.account_role,
      ebayUserId: row.ebay_user_id,
    });
  }

  return purged;
}
