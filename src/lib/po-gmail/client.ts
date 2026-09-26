/** PO Gmail mailbox — auth plumbing only. */

import pool from '@/lib/db';
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

const PROVIDER = 'po_gmail';

/** Thrown when the PO mailbox can't be reached because it's not connected or its Google refresh token was revoked/expired (invalid_grant —… */
export class PoGmailNotConnectedError extends Error {
  constructor(message: string, public readonly needsReconnect: boolean) {
    super(message);
    this.name = 'PoGmailNotConnectedError';
  }
}

/** Thrown when a tenant OTHER than USAV tries to read or refresh the PO mailbox token. */
export class PoGmailWrongTenantError extends Error {
  constructor() {
    super('PO mailbox is not configured for this workspace');
    this.name = 'PoGmailWrongTenantError';
  }
}

/** Singleton-mailbox tenant guard. */
export function assertDogfoodMailbox(orgId: string): void {
  if (orgId !== DOGFOOD_ORG_ID) {
    throw new PoGmailWrongTenantError();
  }
}

/**
 * Soft, non-throwing companion to {@link assertDogfoodMailbox}.
 * so security is unchanged — this predicate just lets callers degrade gracefully
 */
function isPoGmailAvailableForOrg(orgId: string): boolean {
  return orgId === DOGFOOD_ORG_ID;
}

// ─── Vault path (organization_integrations, provider='gmail') ───────────────

/**
 * The vault row for this org's PO mailbox, or null when the org hasn't been
 * migrated / connected through the vault yet (→ legacy-table fallback).
 * Caller must have already run the assertDogfoodMailbox tenant guard.
 */
async function loadVaultCreds(orgId: string): Promise<GmailCredentials | null> {
  const creds = await getIntegrationCredentials<GmailCredentials>(orgId, 'gmail');
  return creds?.refreshToken ? creds : null;
}

/** Access token off the vault row: */
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

// ─── Legacy path (google_oauth_tokens, provider='po_gmail') ─────────────────

interface TokenRow {
  id: number;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  account_email: string | null;
}

async function loadActiveToken(): Promise<TokenRow> {
  const { rows } = await pool.query<TokenRow>(
    `SELECT id, refresh_token, access_token, expires_at, account_email
       FROM google_oauth_tokens
      WHERE provider = $1
      LIMIT 1`,
    [PROVIDER],
  );
  if (!rows[0]) {
    throw new PoGmailNotConnectedError(
      'PO mailbox is not connected. Connect it at Admin → PO Mailbox.',
      false,
    );
  }
  return rows[0];
}

async function markNeedsReconnect(reason: string): Promise<void> {
  await pool.query(
    `UPDATE google_oauth_tokens
        SET needs_reconnect = TRUE,
            needs_reconnect_reason = $1
      WHERE provider = $2`,
    [reason.slice(0, 500), PROVIDER],
  );
}

async function clearNeedsReconnect(): Promise<void> {
  await pool.query(
    `UPDATE google_oauth_tokens
        SET needs_reconnect = FALSE,
            needs_reconnect_reason = NULL
      WHERE provider = $1 AND needs_reconnect = TRUE`,
    [PROVIDER],
  );
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.PO_GMAIL_CLIENT_ID;
  const clientSecret = process.env.PO_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PO_GMAIL_CLIENT_ID / PO_GMAIL_CLIENT_SECRET are not set');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    // 400 / 401 here means the refresh token was revoked or rotated
    // (Google rotates test-mode tokens every 7 days). Flag the row so
    // the admin UI can surface a reconnect prompt.
    if (res.status === 400 || res.status === 401) {
      await markNeedsReconnect(`Token refresh rejected (${res.status}): ${text.slice(0, 200)}`);
      throw new PoGmailNotConnectedError(
        'PO mailbox needs reconnect — its Google token expired or was revoked. Reconnect at Admin → PO Mailbox.',
        true,
      );
    }
    throw new Error(`PO Gmail token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  await clearNeedsReconnect();
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
  };
}

async function getAccessToken(orgId: string = DOGFOOD_ORG_ID): Promise<string> {
  assertDogfoodMailbox(orgId);

  // Vault-preferred: when an organization_integrations row exists, it is the
  // token SoT. Legacy google_oauth_tokens is only read when no vault row.
  const vault = await loadVaultCreds(orgId);
  if (vault) {
    return getAccessTokenFromVault(orgId, vault);
  }

  const row = await loadActiveToken();
  const now = Date.now();
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() > now + 30_000) {
    return row.access_token;
  }
  const { accessToken, expiresAt } = await refreshAccessToken(row.refresh_token);
  await pool.query(
    `UPDATE google_oauth_tokens
        SET access_token = $1,
            expires_at = $2
      WHERE id = $3`,
    [accessToken, expiresAt.toISOString(), row.id],
  );
  return accessToken;
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

async function getConnectedEmail(orgId: string = DOGFOOD_ORG_ID): Promise<string | null> {
  // Non-USAV tenants must not learn anything about USAV's mailbox — return
  // empty rather than throwing so connection-status reads degrade quietly.
  if (orgId !== DOGFOOD_ORG_ID) return null;
  const vault = await loadVaultCreds(orgId);
  if (vault) return vault.accountEmail ?? null;
  const { rows } = await pool.query<{ account_email: string | null }>(
    `SELECT account_email FROM google_oauth_tokens WHERE provider = $1 LIMIT 1`,
    [PROVIDER],
  );
  return rows[0]?.account_email ?? null;
}
