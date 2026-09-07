/**
 * PO Gmail mailbox — auth plumbing only.
 *
 * Token home is the integrations VAULT, read exclusively:
 * organization_integrations (provider='gmail', GmailCredentials), written by
 * the oauth-callback and backfilled from the legacy google_oauth_tokens
 * plaintext columns before those were dropped (2026-09-06). When present the
 * vault row is the source of truth: refresh uses the row's clientId/
 * clientSecret, refreshed access tokens persist back via
 * upsertIntegrationCredentials, and invalid_grant flags the row via
 * markIntegrationError. When NO vault row exists the mailbox is NOT
 * configured — there is deliberately no fallback path (fail closed).
 *
 * Exposes:
 *   - getAccessToken(): refreshes when expired, persists the new token
 *   - poGmailFetch(): Bearer-authed wrapper around fetch() for Gmail API
 *
 * Gmail-specific helpers (list messages, modify labels, etc.) live in
 * messages.ts — this module is auth only.
 */

import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  upsertIntegrationCredentials,
  markIntegrationError,
  type GmailCredentials,
} from '@/lib/integrations/credentials';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const PO_GMAIL_SCOPE = [
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
].join(' ');

/**
 * Thrown when the PO mailbox can't be reached because it's not connected or its
 * Google refresh token was revoked/expired (invalid_grant — Google rotates
 * test-mode refresh tokens ~weekly). Callers map this to a 409 with a reconnect
 * prompt instead of an opaque 500, so the operator knows the fix is "reconnect
 * at Admin → PO Mailbox", not "retry".
 */
export class PoGmailNotConnectedError extends Error {
  constructor(message: string, public readonly needsReconnect: boolean) {
    super(message);
    this.name = 'PoGmailNotConnectedError';
  }
}

/**
 * Thrown when a tenant OTHER than USAV tries to read or refresh the PO
 * mailbox token. The mailbox is a deliberate singleton — one Gmail account
 * owned by USAV, not one per org — so that ownership is enforced here in
 * code: every token accessor takes an `orgId` (defaulting to USAV's) and
 * asserts it through here. A non-USAV org throws before a single byte of the
 * token is read or refreshed, even though the vault row itself is org-scoped.
 */
export class PoGmailWrongTenantError extends Error {
  constructor() {
    super('PO mailbox is not configured for this workspace');
    this.name = 'PoGmailWrongTenantError';
  }
}

/**
 * Singleton-mailbox tenant guard. The PO Gmail mailbox is a global singleton
 * owned by USAV, so every token accessor takes an `orgId` (defaulting to
 * USAV's) and asserts it through here. Any non-USAV org throws before a
 * single byte of the token is read or refreshed.
 */
export function assertDogfoodMailbox(orgId: string): void {
  if (orgId !== DOGFOOD_ORG_ID) {
    throw new PoGmailWrongTenantError();
  }
}

/**
 * Soft, non-throwing companion to {@link assertDogfoodMailbox}. The PO Gmail
 * mailbox is a global singleton owned by USAV (see {@link PoGmailWrongTenantError}),
 * so it is only ever "available" to USAV today.
 *
 * Route handlers should call this FIRST and, when it returns false, short-circuit
 * with a clean "not configured for this org" result (empty list / `{ configured:
 * false }`) BEFORE invoking any token-touching function (`getAccessToken`,
 * `poGmailFetch`, …). Those functions still hard-guard via `assertDogfoodMailbox`,
 * so security is unchanged — this predicate just lets callers degrade gracefully
 * instead of catching a thrown `PoGmailWrongTenantError`.
 *
 * Note: this answers "is the PO mailbox feature available to this org at all",
 * NOT "is a mailbox currently connected" (that's a vault-row read gated by the
 * hard guard). A non-USAV org is never available regardless of connection state.
 */
export function isPoGmailAvailableForOrg(orgId: string): boolean {
  return orgId === DOGFOOD_ORG_ID;
}

// ─── Vault path (organization_integrations, provider='gmail') ───────────────

/**
 * The vault row for this org's PO mailbox, or null when the mailbox is not
 * connected (no active vault row). Caller must have already run the
 * assertDogfoodMailbox tenant guard.
 */
async function loadVaultCreds(orgId: string): Promise<GmailCredentials | null> {
  const creds = await getIntegrationCredentials<GmailCredentials>(orgId, 'gmail');
  return creds?.refreshToken ? creds : null;
}

/**
 * Access token off the vault row: reuse the stored short-lived token when
 * fresh, otherwise refresh with the row's own clientId/clientSecret (falling
 * back to the app-level PO_GMAIL_* env pair) and persist the new
 * accessToken/expiresAt back into the vault. invalid_grant (400/401) marks
 * the row status='error' so the admin/settings UI surfaces a reconnect prompt.
 */
async function getAccessTokenFromVault(orgId: string, creds: GmailCredentials): Promise<string> {
  const now = Date.now();
  if (creds.accessToken && creds.expiresAt && creds.expiresAt > now + 30_000) {
    return creds.accessToken;
  }

  const clientId = creds.clientId || process.env.PO_GMAIL_CLIENT_ID || '';
  const clientSecret = creds.clientSecret || process.env.PO_GMAIL_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    throw new Error('PO mailbox OAuth client is not configured (no clientId/clientSecret in the vault row or PO_GMAIL_CLIENT_ID / PO_GMAIL_CLIENT_SECRET env)');
  }

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // 400 / 401 here means the refresh token was revoked or rotated.
    if (res.status === 400 || res.status === 401) {
      await markIntegrationError(orgId, 'gmail', `Token refresh rejected (${res.status}): ${text.slice(0, 200)}`);
      throw new PoGmailNotConnectedError(
        'PO mailbox needs reconnect — its Google token expired or was revoked. Reconnect at Admin → PO Mailbox.',
        true,
      );
    }
    throw new Error(`PO Gmail token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const accessToken = json.access_token;
  const expiresAt = Date.now() + (json.expires_in - 60) * 1000;

  const payload: GmailCredentials = { ...creds, accessToken, expiresAt };
  await upsertIntegrationCredentials({
    orgId,
    provider: 'gmail',
    payload,
    displayLabel: creds.accountEmail ?? null,
  });
  return accessToken;
}

export async function getAccessToken(orgId: string = DOGFOOD_ORG_ID): Promise<string> {
  assertDogfoodMailbox(orgId);

  // Vault-only (fail closed): no vault row means the mailbox is not
  // configured. There is no plaintext fallback — the legacy token columns
  // are gone.
  const vault = await loadVaultCreds(orgId);
  if (!vault) {
    throw new PoGmailNotConnectedError(
      'PO mailbox is not connected. Connect it at Admin → PO Mailbox.',
      false,
    );
  }
  return getAccessTokenFromVault(orgId, vault);
}

export async function poGmailFetch(
  url: string,
  init: RequestInit = {},
  orgId: string = DOGFOOD_ORG_ID,
): Promise<Response> {
  assertDogfoodMailbox(orgId);
  const token = await getAccessToken(orgId);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function getConnectedEmail(orgId: string = DOGFOOD_ORG_ID): Promise<string | null> {
  // Non-USAV tenants must not learn anything about USAV's mailbox — return
  // empty rather than throwing so connection-status reads degrade quietly.
  if (orgId !== DOGFOOD_ORG_ID) return null;
  const vault = await loadVaultCreds(orgId);
  return vault?.accountEmail ?? null;
}
