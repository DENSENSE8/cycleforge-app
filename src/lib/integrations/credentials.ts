/** Per-tenant integration credentials. */

import pool from '@/lib/db';
import { parseIntegrationPayload, serializeIntegrationPayload } from './crypto';
import { DOGFOOD_ORG_ID, type OrgId } from '../tenancy/constants';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { captureError } from '@/lib/observability/errors';

// ─── Provider payload shapes ───────────────────────────────────────────────
// One discriminated union so callers get type-checked credentials back.

export type IntegrationProvider =
  | 'ebay'
  | 'amazon'
  | 'zoho'
  | 'ecwid'
  | 'square'
  | 'shopify'
  | 'ups'
  | 'fedex'
  | 'usps'
  | 'zendesk'
  | 'google_sheets'
  | 'google_drive'
  | 'ably'
  | 'ollama'
  | 'stripe'
  | 'nextiva'
  | 'shipstation'
  // Email inbox — the PO mailbox (Gmail). Legacy token home is the
  // google_oauth_tokens table; src/lib/po-gmail/client.ts dual-reads
  // (vault first) during the migration.
  | 'gmail'
  // AI search providers (per-org BYOK — docs/ai-search-modernization-plan.md).
  // 'ollama' above doubles as the self-hosted/custom OpenAI-compatible slot.
  | 'ai_gateway'
  | 'openai'
  | 'anthropic';

/**
 * Shared / BYO eBay **app** credentials (Client ID / Cert / RuName). Stored at
 * `organization_integrations` scope=NULL. Not per-seller tokens.
 */
export interface EbayCredentials {
  appId: string;
  certId: string;
  ruName: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  /** @deprecated Legacy USAV env bootstrap — per-account tokens use EbayUserCredentials. */
  refreshToken?: string;
}

/**
 * Per-account eBay **user** OAuth tokens (seller or buyer consent). Stored at
 * `organization_integrations` scope=`seller:{slug}` | `buyer:{slug}` (see
 * ebayScopeForAccount). This is the SoT for refresh/access after the vault migration.
 */
export interface EbayUserCredentials {
  refreshToken: string;
  accessToken?: string;
  /** Access-token expiry, epoch ms (also mirrored to organization_integrations.expires_at). */
  expiresAt?: number;
  /** Refresh-token expiry, epoch ms (~18 months from consent). */
  refreshTokenExpiresAt?: number;
  scopes?: string[];
  /** eBay user id / username from identity probe. */
  accountRef?: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  accountRole: 'seller' | 'buyer';
}

/** Amazon Selling Partner API credentials. */
export interface AmazonCredentials {
  lwaClientId: string;
  lwaClientSecret: string;
  refreshToken?: string;
  region: 'NA' | 'EU' | 'FE';
  marketplaceIds: string[];
  sellerId?: string;
}

export interface ZohoCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
  domain?: string;
  /** Per-tenant webhook identity (Wave 3). */
  webhookToken?: string;
  webhookSecret?: string;
}

/** Ecwid storefront — store id + secret API token (vault-first; env fallback
 *  for the dogfood org lives in fetchEcwidTransferRows, not here). */
export interface EcwidCredentials { storeId: string; apiToken: string }

/** Shopify storefront — the `orders` sales channel (catalog / stock push-out is a later phase). */
export interface ShopifyCredentials {
  shopDomain: string;
  nangoConnectionId?: string;
  accessToken?: string;
  scope?: string;
  apiVersion?: string;
}

interface UpsCredentials { clientId: string; clientSecret: string; webhookSecret?: string }
interface FedexCredentials { clientId: string; clientSecret: string; env: 'production' | 'sandbox' }
interface UspsCredentials { consumerKey: string; consumerSecret: string }
export interface ZendeskCredentials { subdomain: string; email: string; apiToken: string }
export interface GoogleSheetsCredentials { clientEmail: string; privateKey: string; defaultSpreadsheetId?: string }

/** Google Drive photo-backup credentials. */
export interface GoogleDriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  /** Access-token expiry, epoch ms. */
  expiresAt?: number;
  accountEmail?: string;
  rootFolderId: string;
  scope?: string;
}
interface AblyCredentials { apiKey: string }

/** Gmail (PO mailbox) credentials — the email_inbox capability. */
export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  /** Access-token expiry, epoch ms. */
  expiresAt?: number;
  accountEmail?: string;
  scope?: string;
}
export interface OllamaCredentials {
  baseUrl: string;
  tunnelUrl?: string;
  model: string;
  /** Embedding model served by the same endpoint (e.g. nomic-embed-text). */
  embedModel?: string;
  /** Optional bearer for secured self-hosted endpoints. */
  apiKey?: string;
  /** Cloudflare Access service token, when the tenant fronts their self-hosted endpoint with CF Access (the usual way a tailnet/LAN model… */
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

/** Per-org AI search providers (BYOK). */
export interface AiGatewayCredentials { apiKey: string; chatModel?: string; embedModel?: string }
export interface OpenAiCredentials { apiKey: string; chatModel?: string; embedModel?: string }
export interface AnthropicCredentials { apiKey: string; chatModel?: string }
export interface StripeCredentials { secretKey: string; publishableKey: string; webhookSecret: string }

/** Nextiva (business phone) credentials. */
export interface NextivaCredentials {
  apiKey?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  accountId?: string;
  locationId?: string;
  /** Nextiva extension to originate click-to-call from, per agent (optional). */
  defaultExtension?: string;
  webhookToken?: string;
  webhookSigningSecret?: string;
}

/** ShipStation credentials. */
export interface ShipStationCredentials {
  apiKey: string;
  v1ApiKey?: string;
  v1ApiSecret?: string;
  webhookToken?: string;
  webhookSecret?: string;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

interface CacheEntry { value: unknown; expiresAt: number; }
const credCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(orgId: OrgId, provider: IntegrationProvider, scope: string | null): string {
  return `${orgId}:${provider}:${scope ?? ''}`;
}

export function invalidateCredentialCache(orgId?: OrgId, provider?: IntegrationProvider): void {
  if (!orgId) { credCache.clear(); return; }
  const prefix = provider ? `${orgId}:${provider}:` : `${orgId}:`;
  for (const k of credCache.keys()) {
    if (k.startsWith(prefix)) credCache.delete(k);
  }
}

// ─── Env-var fallback (USAV org only, transitional) ──────────────────────── Keep these tight — only USAV's existing single-tenant config…

function envFallback(provider: IntegrationProvider): unknown | null {
  switch (provider) {
    case 'ebay': {
      const appId = process.env.EBAY_APP_ID, certId = process.env.EBAY_CERT_ID, ruName = process.env.EBAY_RU_NAME;
      if (!appId || !certId || !ruName) return null;
      const cred: EbayCredentials = {
        appId, certId, ruName,
        environment: (process.env.EBAY_ENVIRONMENT || 'PRODUCTION') as EbayCredentials['environment'],
        refreshToken: process.env.EBAY_REFRESH_TOKEN_USAV || undefined,
      };
      return cred;
    }
    case 'amazon': {
      // App-level LWA creds are shared (one SP-API app); USAV's bootstrap
      // refresh token is the only per-seller secret mirrored from env.
      const lwaClientId = process.env.AMAZON_LWA_CLIENT_ID, lwaClientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
      if (!lwaClientId || !lwaClientSecret) return null;
      const cred: AmazonCredentials = {
        lwaClientId, lwaClientSecret,
        refreshToken: process.env.AMAZON_SP_API_REFRESH_TOKEN_USAV || undefined,
        region: (process.env.AMAZON_SP_API_REGION || 'NA') as AmazonCredentials['region'],
        marketplaceIds: (process.env.AMAZON_MARKETPLACE_IDS || 'ATVPDKIKX0DER')
          .split(',').map((s) => s.trim()).filter(Boolean),
      };
      return cred;
    }
    case 'ups': {
      const clientId = process.env.UPS_CLIENT_ID, clientSecret = process.env.UPS_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      const cred: UpsCredentials = {
        clientId, clientSecret,
        webhookSecret: process.env.UPS_WEBHOOK_BEARER || process.env.UPS_WEBHOOK_SECRET || undefined,
      };
      return cred;
    }
    case 'fedex': {
      const clientId = process.env.FEDEX_CLIENT_ID, clientSecret = process.env.FEDEX_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      const cred: FedexCredentials = {
        clientId, clientSecret,
        env: (process.env.FEDEX_ENV === 'production' ? 'production' : 'sandbox'),
      };
      return cred;
    }
    case 'usps': {
      const consumerKey = process.env.CONSUMER_KEY, consumerSecret = process.env.CONSUMER_SECRET;
      if (!consumerKey || !consumerSecret) return null;
      const cred: UspsCredentials = { consumerKey, consumerSecret };
      return cred;
    }
    case 'zendesk': {
      const subdomain = process.env.ZENDESK_SUBDOMAIN,
            email = process.env.ZENDESK_EMAIL || process.env.ZENDESK_API_USER,
            apiToken = process.env.ZENDESK_API_TOKEN;
      if (!subdomain || !email || !apiToken) return null;
      const cred: ZendeskCredentials = { subdomain, email, apiToken };
      return cred;
    }
    case 'ably': {
      const apiKey = getValidatedAblyApiKey();
      if (!apiKey) return null;
      const cred: AblyCredentials = { apiKey };
      return cred;
    }
    case 'ollama': {
      const baseUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_TUNNEL_URL,
            model = process.env.OLLAMA_MODEL;
      if (!baseUrl || !model) return null;
      // Single-tenant env bootstrap only (same posture as the other cases here).
      const cred: OllamaCredentials = {
        baseUrl,
        tunnelUrl: process.env.OLLAMA_TUNNEL_URL,
        model,
        cfAccessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID,
        cfAccessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET,
      };
      return cred;
    }
    case 'stripe': {
      const secretKey = process.env.STRIPE_SECRET_KEY,
            publishableKey = process.env.STRIPE_PUBLISHABLE_KEY,
            webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secretKey || !publishableKey || !webhookSecret) return null;
      const cred: StripeCredentials = { secretKey, publishableKey, webhookSecret };
      return cred;
    }
    case 'nextiva': {
      // Vault-only by default; an env bootstrap is supported for USAV's single
      // tenant so the connector can light up before the settings Connect flow.
      const apiKey = process.env.NEXTIVA_API_KEY;
      const webhookSigningSecret = process.env.NEXTIVA_WEBHOOK_SECRET;
      if (!apiKey) return null;
      const cred: NextivaCredentials = {
        apiKey,
        accountId: process.env.NEXTIVA_ACCOUNT_ID || undefined,
        webhookToken: process.env.NEXTIVA_WEBHOOK_TOKEN || undefined,
        webhookSigningSecret: webhookSigningSecret || undefined,
      };
      return cred;
    }
    case 'shipstation': {
      // USAV single-tenant env bootstrap (mirrors nextiva) so the label engine
      // can light up before the settings Connect flow. apiKey = v2 key; the v1
      // pair + webhook secret are optional.
      const apiKey = process.env.SHIPSTATION_API_KEY;
      if (!apiKey) return null;
      const cred: ShipStationCredentials = {
        apiKey,
        v1ApiKey: process.env.SHIPSTATION_V1_API_KEY || undefined,
        v1ApiSecret: process.env.SHIPSTATION_V1_API_SECRET || undefined,
        webhookToken: process.env.SHIPSTATION_WEBHOOK_TOKEN || undefined,
        webhookSecret: process.env.SHIPSTATION_WEBHOOK_SECRET || undefined,
      };
      return cred;
    }
    case 'zoho':
    case 'google_drive':
      // OAuth-only, connected per-tenant via Sign in with Google. No env bridge —
      // there is no single-tenant Drive backup to mirror from env.
      return null;
    case 'gmail':
      // OAuth-only (PO mailbox). Legacy tokens live in google_oauth_tokens and
      // are dual-read by the po-gmail client — never mirrored from env here.
      return null;
    case 'ecwid': case 'square':
      return null; // Add when needed.
    case 'shopify':
      // Nango-connected per-tenant (or vault paste-key). No single-tenant
      // Shopify store to mirror from env, so there is no env bridge.
      return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

interface IntegrationDbRow {
  payload_encrypted: string;
  display_label: string | null;
  status: string;
  scope: string | null;
}

export async function getIntegrationCredentials<T = unknown>(
  orgId: OrgId,
  provider: IntegrationProvider,
  options: { scope?: string | null; includeInactive?: boolean } = {},
): Promise<T | null> {
  const scope = options.scope ?? null;
  // `includeInactive` is for RECOVERY paths only (the self-heal sweep in connectors/self-heal.ts revalidating a row that got flipped to…
  const includeInactive = options.includeInactive === true;
  const key = `${cacheKey(orgId, provider, scope)}${includeInactive ? ':any' : ''}`;
  const cached = credCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T | null;

  try {
    const r = await pool.query<IntegrationDbRow>(
      `SELECT payload_encrypted, display_label, status, scope
         FROM organization_integrations
        WHERE organization_id = $1
          AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')
          ${includeInactive ? '' : "AND status = 'active'"}
        LIMIT 1`,
      [orgId, provider, scope],
    );
    const row = r.rows[0];
    if (row) {
      const value = parseIntegrationPayload<T>(row.payload_encrypted);
      credCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
  } catch (err) {
    // Decryption or DB errors are loud but non-fatal. Legacy env bridges may
    // still serve providers that explicitly define one; Google Sheets does not.
    console.warn(`[integrations] credentials lookup failed for ${orgId}/${provider}:`, err instanceof Error ? err.message : err);
  }

  // Transitional env-var fallback, USAV only.
  if (provider !== 'google_sheets' && provider !== 'zoho' && orgId === DOGFOOD_ORG_ID) {
    const fallback = envFallback(provider) as T | null;
    if (fallback) {
      credCache.set(key, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }
  }

  credCache.set(key, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
  return null;
}

interface UpsertIntegrationInput {
  orgId: OrgId;
  provider: IntegrationProvider;
  scope?: string | null;
  payload: unknown;
  displayLabel?: string | null;
  createdBy?: number | null;
  /** Access-token expiry — drives connectors/refresh-sweep.ts. */
  expiresAt?: Date | null;
}

export async function upsertIntegrationCredentials(input: UpsertIntegrationInput): Promise<void> {
  const enc = serializeIntegrationPayload(input.payload);
  await pool.query(
    `INSERT INTO organization_integrations
       (organization_id, provider, scope, payload_encrypted, display_label, status, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
     ON CONFLICT (organization_id, provider, COALESCE(scope, ''))
     DO UPDATE SET
       payload_encrypted = EXCLUDED.payload_encrypted,
       display_label    = EXCLUDED.display_label,
       status           = 'active',
       last_error       = NULL,
       expires_at       = COALESCE(EXCLUDED.expires_at, organization_integrations.expires_at),
       updated_at       = now()`,
    [
      input.orgId,
      input.provider,
      input.scope ?? null,
      enc,
      input.displayLabel ?? null,
      input.createdBy ?? null,
      input.expiresAt ?? null,
    ],
  );
  invalidateCredentialCache(input.orgId, input.provider);
}

/** Record a TRANSIENT provider failure (throttle, timeout, 5xx) without taking the connection offline. */
export async function noteIntegrationWarning(
  orgId: OrgId,
  provider: IntegrationProvider,
  error: string,
  scope: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE organization_integrations
        SET last_error = $1, updated_at = now()
      WHERE organization_id = $2 AND provider = $3
        AND COALESCE(scope, '') = COALESCE($4, '')
        AND status = 'active'`,
    [error.slice(0, 1000), orgId, provider, scope],
  );
}

/**
 * Heal a connection after proof it works (a successful token mint / API call).
 * Clears `last_error` and lifts a previously latched `error` back to `active`,
 * so a recovered throttle needs no human. Returns true when a row changed.
 */
export async function clearIntegrationError(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE organization_integrations
        SET status = 'active', last_error = NULL, updated_at = now()
      WHERE organization_id = $1 AND provider = $2
        AND COALESCE(scope, '') = COALESCE($3, '')
        AND (status <> 'active' OR last_error IS NOT NULL)
        AND status <> 'revoked'`,
    [orgId, provider, scope],
  );
  const changed = (res.rowCount ?? 0) > 0;
  if (changed) invalidateCredentialCache(orgId, provider);
  return changed;
}

export async function markIntegrationError(
  orgId: OrgId,
  provider: IntegrationProvider,
  error: string,
  scope: string | null = null,
): Promise<void> {
  const lastError = error.slice(0, 1000);
  await pool.query(
    `UPDATE organization_integrations
        SET status = 'error', last_error = $1, updated_at = now()
      WHERE organization_id = $2 AND provider = $3
        AND COALESCE(scope, '') = COALESCE($4, '')`,
    [lastError, orgId, provider, scope],
  );
  invalidateCredentialCache(orgId, provider);
  // Ops signal — Sentry when SENTRY_DSN is set; never throw from mark.
  try {
    captureError(new Error(`integration_mark_error:${provider}`), {
      orgId,
      provider,
      scope,
      lastError: lastError.slice(0, 500),
    });
  } catch {
    /* ignore */
  }
}

export async function deleteIntegrationCredentials(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
): Promise<void> {
  await pool.query(
    `DELETE FROM organization_integrations
      WHERE organization_id = $1 AND provider = $2
        AND COALESCE(scope, '') = COALESCE($3, '')`,
    [orgId, provider, scope],
  );
  invalidateCredentialCache(orgId, provider);
}
