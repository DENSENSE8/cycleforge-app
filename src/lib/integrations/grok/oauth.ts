/**
 * SuperGrok / X Premium+ subscription OAuth.
 *
 * This is the subscription path, not the metered developer API:
 *   - Identity: auth.x.ai (public Grok CLI OIDC client, PKCE / device-code)
 *   - Inference: https://cli-chat-proxy.grok.com/v1  (billed on SuperGrok)
 *   - Never:     https://api.x.ai/v1 + XAI_API_KEY   (metered credits)
 *
 * Tokens live ONLY in organization_integrations (provider='grok'). The host
 * file ~/.grok/auth.json is a connect-time import, not a runtime token home.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { OrgId } from '@/lib/tenancy/constants';
import type { GrokCredentials } from '@/lib/integrations/credentials';
import type { HealthResult, TokenEnvelope } from '@/lib/integrations/connectors/types';
import type { AiProviderConfig } from '@/lib/ai/provider';

export type GrokChatConfig = AiProviderConfig & { source: 'grok' };

export const GROK_OIDC_ISSUER = 'https://auth.x.ai';
/** Public Grok CLI client — no secret; PKCE / device-code (RFC 8628). */
export const GROK_OIDC_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const GROK_CLI_PROXY_BASE = 'https://cli-chat-proxy.grok.com/v1';
export const GROK_DEFAULT_CHAT_MODEL = 'grok-4.6';
export const GROK_OAUTH_SCOPES =
  'openid profile email offline_access grok-cli:access api:access';

export const GROK_PENDING_COOKIE = 'cf_grok_oauth_pending';
export const GROK_PENDING_TTL_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

const DEVICE_CODE_URL = `${GROK_OIDC_ISSUER}/oauth2/device/code`;
const TOKEN_URL = `${GROK_OIDC_ISSUER}/oauth2/token`;
const USERINFO_URL = `${GROK_OIDC_ISSUER}/oauth2/userinfo`;

export interface GrokDeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  intervalSec: number;
  expiresAt: number;
}

export interface GrokPendingDevice {
  organizationId: string;
  createdBy: number | null;
  issuedAt: number;
  deviceCode: string;
  intervalSec: number;
  expiresAt: number;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
}

export interface GrokTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountEmail?: string;
  accountName?: string;
}

export type GrokPollResult =
  | { status: 'pending'; intervalSec?: number }
  | { status: 'denied'; error: string }
  | { status: 'expired'; error: string }
  | { status: 'error'; error: string }
  | { status: 'authorized'; tokens: GrokTokenSet };

export function grokIssuer(): string {
  return (process.env.GROK_OAUTH_ISSUER || GROK_OIDC_ISSUER).replace(/\/+$/, '');
}

export function grokClientId(): string {
  return (process.env.GROK_OAUTH_CLIENT_ID || GROK_OIDC_CLIENT_ID).trim();
}

export function grokProxyBase(): string {
  return (process.env.GROK_CLI_CHAT_PROXY_BASE_URL || GROK_CLI_PROXY_BASE).replace(/\/+$/, '');
}

export function grokHomeDir(): string {
  const override = process.env.GROK_HOME?.trim();
  return override || join(homedir(), '.grok');
}

export function isGrokTokenFresh(expiresAt: number | undefined, now = Date.now()): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > now + ACCESS_TOKEN_SKEW_MS;
}

/** JWT `exp` in epoch ms, or null when the bearer is not a JWT. */
export function grokAccessTokenExpiryMs(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp > 0) {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

export function grokAccessIsLive(
  creds: { accessToken?: string; expiresAt?: number },
  now = Date.now(),
): boolean {
  const jwtExp = creds.accessToken ? grokAccessTokenExpiryMs(creds.accessToken) : null;
  return isGrokTokenFresh(jwtExp ?? creds.expiresAt, now);
}

/**
 * Headers the CLI chat proxy requires so it treats the bearer as a SuperGrok
 * session rather than a metered api.x.ai key. Missing `x-grok-client-version`
 * is reported as version `(none)` and rejected with HTTP 426.
 */
export const GROK_CLI_VERSION = '1.0.13';

export function grokProxyHeaders(model: string = GROK_DEFAULT_CHAT_MODEL): Record<string, string> {
  const version = (process.env.GROK_CLI_VERSION || GROK_CLI_VERSION).trim() || GROK_CLI_VERSION;
  return {
    'X-XAI-Token-Auth': 'xai-grok-cli',
    'x-grok-model-override': model,
    'x-grok-client-version': version,
    'x-grok-client-identifier': 'grok-shell',
    'User-Agent': `xai-grok-cli/${version}`,
  };
}

export function grokChatConfig(creds: Pick<GrokCredentials, 'accessToken' | 'chatModel'>): GrokChatConfig {
  const model = creds.chatModel || GROK_DEFAULT_CHAT_MODEL;
  return {
    source: 'grok',
    baseURL: grokProxyBase(),
    apiKey: creds.accessToken,
    model,
    headers: grokProxyHeaders(model),
  };
}

interface HostAuthEntry {
  key?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  email?: unknown;
  first_name?: unknown;
  oidc_issuer?: unknown;
  oidc_client_id?: unknown;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseExpiresAt(raw: unknown, now: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  // Host sessions without expiry: treat as already-stale so we refresh.
  return now;
}

/**
 * Pick the SuperGrok OIDC session out of ~/.grok/auth.json. Prefers
 * `https://auth.x.ai::<client-id>`, then the legacy `https://accounts.x.ai/sign-in`
 * key the grok CLI README still documents.
 */
export function parseHostGrokSession(
  raw: unknown,
  now = Date.now(),
): GrokTokenSet | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as Record<string, HostAuthEntry>;
  const preferredKey = `${GROK_OIDC_ISSUER}::${GROK_OIDC_CLIENT_ID}`;
  const order = [
    preferredKey,
    'https://accounts.x.ai/sign-in',
    ...Object.keys(file).filter((k) => k !== preferredKey && k !== 'https://accounts.x.ai/sign-in'),
  ];
  for (const key of order) {
    const entry = file[key];
    if (!entry || typeof entry !== 'object') continue;
    const accessToken = asString(entry.key);
    const refreshToken = asString(entry.refresh_token);
    if (!accessToken || !refreshToken) continue;
    const issuer = asString(entry.oidc_issuer);
    if (issuer && issuer !== GROK_OIDC_ISSUER && !issuer.startsWith('https://auth.x.ai')) {
      continue;
    }
    const jwtExp = grokAccessTokenExpiryMs(accessToken);
    return {
      accessToken,
      refreshToken,
      expiresAt: jwtExp ?? parseExpiresAt(entry.expires_at, now),
      accountEmail: asString(entry.email) || undefined,
      accountName: asString(entry.first_name) || undefined,
    };
  }
  return null;
}

async function formPost(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function tokenSetFromResponse(json: Record<string, unknown>, now = Date.now()): GrokTokenSet | null {
  const accessToken = asString(json.access_token);
  const refreshToken = asString(json.refresh_token);
  if (!accessToken || !refreshToken) return null;
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in);
  const ttlSec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt: now + ttlSec * 1000,
  };
}

export async function startGrokDeviceCode(
  fetchImpl: typeof fetch = fetch,
): Promise<GrokDeviceStart> {
  const { status, json } = await formPost(
    DEVICE_CODE_URL,
    { client_id: grokClientId(), scope: GROK_OAUTH_SCOPES },
    fetchImpl,
  );
  const deviceCode = asString(json.device_code);
  const userCode = asString(json.user_code);
  const verificationUri = asString(json.verification_uri) || `${GROK_OIDC_ISSUER}/device`;
  const verificationUriComplete =
    asString(json.verification_uri_complete) || `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;
  const interval = typeof json.interval === 'number' ? json.interval : Number(json.interval) || 5;
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in) || 900;
  if (!deviceCode || !userCode) {
    const err = asString(json.error_description) || asString(json.error) || `device code HTTP ${status}`;
    throw new Error(err);
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    intervalSec: Math.max(2, interval),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function pollGrokDeviceCode(
  deviceCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GrokPollResult> {
  const { status, json } = await formPost(
    TOKEN_URL,
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: grokClientId(),
    },
    fetchImpl,
  );
  if (status === 200) {
    const tokens = tokenSetFromResponse(json);
    if (!tokens) return { status: 'error', error: 'Token response missing access or refresh token.' };
    const profile = await fetchGrokUserinfo(tokens.accessToken, fetchImpl).catch(() => null);
    if (profile?.email) tokens.accountEmail = profile.email;
    if (profile?.name) tokens.accountName = profile.name;
    return { status: 'authorized', tokens };
  }
  const code = asString(json.error);
  if (code === 'authorization_pending') return { status: 'pending' };
  if (code === 'slow_down') {
    const interval = typeof json.interval === 'number' ? json.interval : undefined;
    return { status: 'pending', intervalSec: interval };
  }
  if (code === 'expired_token' || code === 'expired') {
    return { status: 'expired', error: 'The sign-in code expired — start Connect again.' };
  }
  if (code === 'access_denied') {
    return { status: 'denied', error: 'Grok sign-in was cancelled.' };
  }
  return {
    status: 'error',
    error: asString(json.error_description) || code || `token HTTP ${status}`,
  };
}

export async function refreshGrokAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GrokTokenSet> {
  const { status, json } = await formPost(
    TOKEN_URL,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: grokClientId(),
    },
    fetchImpl,
  );
  const tokens = tokenSetFromResponse(json);
  if (!tokens) {
    throw new Error(asString(json.error_description) || asString(json.error) || `refresh HTTP ${status}`);
  }
  // xAI rotates the refresh token on every refresh — keep the old one only
  // if the response omitted a replacement (should not happen).
  if (!tokens.refreshToken) tokens.refreshToken = refreshToken;
  return tokens;
}

async function fetchGrokUserinfo(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ email?: string; name?: string } | null> {
  const res = await fetchImpl(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    email: asString(json.email) || undefined,
    name: asString(json.name) || asString(json.given_name) || undefined,
  };
}

export async function readHostGrokAuthFile(): Promise<unknown | null> {
  const path = join(grokHomeDir(), 'auth.json');
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Load this machine's `grok login` session and mint a vault payload. Refreshes
 * when the cached access token is stale. Returns null when no host session
 * exists (caller falls through to device-code).
 */
export async function importHostGrokSession(
  fetchImpl: typeof fetch = fetch,
): Promise<GrokCredentials | null> {
  const raw = await readHostGrokAuthFile();
  if (!raw) return null;
  const parsed = parseHostGrokSession(raw);
  if (!parsed) return null;
  let tokens = parsed;
  if (!grokAccessIsLive(tokens)) {
    tokens = await refreshGrokAccessToken(tokens.refreshToken, fetchImpl);
    tokens.accountEmail = tokens.accountEmail || parsed.accountEmail;
    tokens.accountName = tokens.accountName || parsed.accountName;
  }
  return credentialsFromTokenSet(tokens, 'host');
}

export function credentialsFromTokenSet(
  tokens: GrokTokenSet,
  connectedVia: GrokCredentials['connectedVia'],
  existing?: GrokCredentials | null,
): GrokCredentials {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    accountEmail: tokens.accountEmail || existing?.accountEmail,
    accountName: tokens.accountName || existing?.accountName,
    oidcIssuer: grokIssuer(),
    oidcClientId: grokClientId(),
    chatModel: existing?.chatModel || GROK_DEFAULT_CHAT_MODEL,
    connectedVia: connectedVia ?? existing?.connectedVia,
  };
}

export function grokDisplayLabel(creds: Pick<GrokCredentials, 'accountEmail' | 'accountName'>): string {
  if (creds.accountEmail) return `SuperGrok · ${creds.accountEmail}`;
  if (creds.accountName) return `SuperGrok · ${creds.accountName}`;
  return 'SuperGrok connected';
}

export async function persistGrokCredentials(args: {
  orgId: OrgId;
  creds: GrokCredentials;
  createdBy?: number | null;
}): Promise<void> {
  const { upsertIntegrationCredentials } = await import('@/lib/integrations/credentials');
  await upsertIntegrationCredentials({
    orgId: args.orgId,
    provider: 'grok',
    payload: args.creds,
    displayLabel: grokDisplayLabel(args.creds),
    createdBy: args.createdBy ?? null,
    expiresAt: new Date(args.creds.expiresAt),
  });
}

/**
 * Return a live OpenAI-wire config for this org's SuperGrok session, refreshing
 * the access token when it is inside the skew window. Null when not connected.
 */
export async function ensureGrokChatConfig(orgId: OrgId): Promise<GrokChatConfig | null> {
  const { getIntegrationCredentials } = await import('@/lib/integrations/credentials');
  const creds = await getIntegrationCredentials<GrokCredentials>(orgId, 'grok');
  if (!creds?.refreshToken && !creds?.accessToken) return null;
  let fresh = creds;
  if (!grokAccessIsLive(creds)) {
    if (!creds.refreshToken) return null;
    try {
      const tokens = await refreshGrokAccessToken(creds.refreshToken);
      fresh = credentialsFromTokenSet(tokens, creds.connectedVia, creds);
      await persistGrokCredentials({ orgId, creds: fresh });
    } catch (err) {
      // xAI rotates refresh tokens; the host CLI may already have spent this
      // one. A still-valid access JWT can serve Ask until the next login.
      if (creds.accessToken && grokAccessIsLive({ accessToken: creds.accessToken, expiresAt: creds.expiresAt })) {
        return grokChatConfig(creds);
      }
      const { markIntegrationError } = await import('@/lib/integrations/credentials');
      await markIntegrationError(
        orgId,
        'grok',
        err instanceof Error ? err.message : 'Grok token refresh failed',
      );
      return null;
    }
  }
  if (!fresh.accessToken) return null;
  return grokChatConfig(fresh);
}

export async function refreshGrokCredentials(orgId: OrgId): Promise<TokenEnvelope | null> {
  const { getIntegrationCredentials } = await import('@/lib/integrations/credentials');
  const creds = await getIntegrationCredentials<GrokCredentials>(orgId, 'grok');
  if (!creds?.refreshToken) return null;
  const tokens = await refreshGrokAccessToken(creds.refreshToken);
  const next = credentialsFromTokenSet(tokens, creds.connectedVia, creds);
  await persistGrokCredentials({ orgId, creds: next });
  return {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
  };
}

export async function validateGrokConnection(orgId: OrgId): Promise<HealthResult> {
  const config = await ensureGrokChatConfig(orgId);
  if (!config) return { ok: false, error: 'Grok (SuperGrok) is not connected.' };
  try {
    const res = await fetch(`${config.baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        ...(config.headers ?? {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `Grok proxy HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ''}` };
    }
    return { ok: true, detail: { model: config.model, account: grokDisplayLabel({ accountEmail: undefined }) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Grok health check failed' };
  }
}
