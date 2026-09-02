/**
 * Connection health check — first QA Console tool.
 *
 * For every third-party connection: credentials present, token expiry,
 * expected scopes, a harmless provider probe, account identity, configured
 * environment, latency + HTTP status, last success/failure.
 *
 * Live probes reuse connector.validate() (same path as Settings health).
 * Injected failures are consumed at this boundary so they never corrupt DB
 * state. Secrets never leave this module.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listConnections } from '@/lib/integrations/connectors/connections';
import { getConnector } from '@/lib/integrations/connectors/registry';
import { getIntegrationCredentials, type IntegrationProvider } from '@/lib/integrations/credentials';
import {
  getEbayAppCreds,
  listActiveEbayAccounts,
} from '@/lib/ebay/credentials';
import { ebayScopesForRole, normalizeEbayEnvironment } from '@/lib/ebay/oauth-config';
import { consumeFailureInjection } from './failure-injection';
import { redactRecord } from './redact';

export interface ConnectionHealthReport {
  provider: string;
  scope: string;
  label: string;
  connected: boolean;
  identity: string | null;
  environment: string | null;
  scopesFound: number | null;
  scopesExpected: number | null;
  tokenExpiresAt: string | null;
  lastHttpStatus: number | null;
  lastLatencyMs: number | null;
  lastOk: boolean | null;
  lastErrorClass: string | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastCheckedAt: string | null;
  credentialsPresent: boolean;
  live: {
    ok: boolean;
    latencyMs: number;
    httpStatus: number | null;
    errorClass: string | null;
    error: string | null;
    injected: boolean;
  } | null;
}

interface HealthRow {
  provider: string;
  scope: string;
  connected: boolean;
  identity: string | null;
  environment: string | null;
  scopes_found: number | null;
  scopes_expected: number | null;
  token_expires_at: Date | null;
  last_http_status: number | null;
  last_latency_ms: number | null;
  last_ok: boolean | null;
  last_error_class: string | null;
  last_error: string | null;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  last_checked_at: Date | null;
}

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

function snapshotFromRow(row: HealthRow, extra: Partial<ConnectionHealthReport>): ConnectionHealthReport {
  return {
    provider: row.provider,
    scope: row.scope,
    label: extra.label ?? row.provider,
    connected: extra.connected ?? row.connected,
    identity: extra.identity ?? row.identity,
    environment: extra.environment ?? row.environment,
    scopesFound: extra.scopesFound ?? row.scopes_found,
    scopesExpected: extra.scopesExpected ?? row.scopes_expected,
    tokenExpiresAt: extra.tokenExpiresAt ?? iso(row.token_expires_at),
    lastHttpStatus: row.last_http_status,
    lastLatencyMs: row.last_latency_ms,
    lastOk: row.last_ok,
    lastErrorClass: row.last_error_class,
    lastError: row.last_error,
    lastSuccessAt: iso(row.last_success_at),
    lastFailureAt: iso(row.last_failure_at),
    lastCheckedAt: iso(row.last_checked_at),
    credentialsPresent: extra.credentialsPresent ?? row.connected,
    live: extra.live ?? null,
  };
}

export async function listConnectionHealth(orgId: OrgId): Promise<ConnectionHealthReport[]> {
  const connections = await listConnections(orgId);
  const stored = await withTenantTransaction(orgId, async (client) => {
    const r = await client.query<HealthRow>(
      `SELECT provider, scope, connected, identity, environment, scopes_found, scopes_expected,
              token_expires_at, last_http_status, last_latency_ms, last_ok, last_error_class,
              last_error, last_success_at, last_failure_at, last_checked_at
         FROM qa_connection_health
        WHERE organization_id = $1`,
      [orgId],
    );
    return r.rows;
  }).catch(() => [] as HealthRow[]);

  const byKey = new Map(stored.map((r) => [`${r.provider}:${r.scope}`, r]));
  const reports: ConnectionHealthReport[] = [];

  for (const conn of connections) {
    const scope = conn.scope ?? '';
    const key = `${conn.provider}:${scope}`;
    const row = byKey.get(key);
    const base: Partial<ConnectionHealthReport> = {
      label: conn.displayLabel ?? conn.provider,
      connected: conn.connected,
      credentialsPresent: conn.connected,
    };
    if (row) {
      reports.push(snapshotFromRow(row, base));
    } else {
      reports.push({
        provider: conn.provider,
        scope,
        label: base.label ?? conn.provider,
        connected: conn.connected,
        identity: null,
        environment: null,
        scopesFound: null,
        scopesExpected: null,
        tokenExpiresAt: iso(conn.expiresAt ?? null),
        lastHttpStatus: null,
        lastLatencyMs: null,
        lastOk: null,
        lastErrorClass: conn.lastError ? 'ConnectionError' : null,
        lastError: conn.lastError ?? null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastCheckedAt: null,
        credentialsPresent: conn.connected,
        live: null,
      });
    }
  }

  // eBay per-account rows may exist without an unscoped vault connection.
  if (!reports.some((r) => r.provider === 'ebay')) {
    const accounts = await listActiveEbayAccounts(orgId).catch(() => []);
    for (const acct of accounts) {
      const scope = `${acct.accountRole}:${acct.accountName}`;
      const row = byKey.get(`ebay:${scope}`);
      const extra: Partial<ConnectionHealthReport> = {
        label: `${acct.accountRole} · ${acct.accountName}`,
        connected: Boolean(acct.refreshToken),
        identity: acct.ebayUserId,
        credentialsPresent: Boolean(acct.refreshToken),
        tokenExpiresAt: iso(acct.tokenExpiresAt),
      };
      reports.push(
        row
          ? snapshotFromRow(row, extra)
          : {
              provider: 'ebay',
              scope,
              label: extra.label ?? acct.accountName,
              connected: extra.connected ?? false,
              identity: extra.identity ?? null,
              environment: null,
              scopesFound: null,
              scopesExpected: null,
              tokenExpiresAt: extra.tokenExpiresAt ?? null,
              lastHttpStatus: null,
              lastLatencyMs: null,
              lastOk: null,
              lastErrorClass: null,
              lastError: null,
              lastSuccessAt: null,
              lastFailureAt: null,
              lastCheckedAt: null,
              credentialsPresent: extra.credentialsPresent ?? false,
              live: null,
            },
      );
    }
  }

  reports.sort((a, b) => a.provider.localeCompare(b.provider) || a.scope.localeCompare(b.scope));
  return reports;
}

interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  httpStatus: number | null;
  errorClass: string | null;
  error: string | null;
  injected: boolean;
  identity: string | null;
  environment: string | null;
  scopesFound: number | null;
  scopesExpected: number | null;
  tokenExpiresAt: string | null;
  credentialsPresent: boolean;
}

async function probeEbayAccount(
  orgId: OrgId,
  accountName: string,
  role: 'seller' | 'buyer',
): Promise<ProbeResult> {
  const started = Date.now();
  const injected = await consumeFailureInjection(orgId, 'ebay', `${role}:${accountName}`);
  if (injected) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      httpStatus: injected.httpStatus,
      errorClass: injected.errorClass,
      error: injected.message,
      injected: true,
      identity: null,
      environment: null,
      scopesFound: null,
      scopesExpected: ebayScopesForRole(role).length,
      tokenExpiresAt: null,
      credentialsPresent: true,
    };
  }

  const [app, accounts] = await Promise.all([
    getEbayAppCreds(orgId),
    listActiveEbayAccounts(orgId),
  ]);
  const acct = accounts.find((a) => a.accountName === accountName);
  const expected = ebayScopesForRole(role);
  const creds = await getIntegrationCredentials<{
    scopes?: string[];
    environment?: string;
    accountRef?: string;
    expiresAt?: number;
    refreshToken?: string;
  }>(orgId, 'ebay', { scope: `${role}:${accountName}` });

  const environment = creds?.environment
    ? normalizeEbayEnvironment(creds.environment)
    : app
      ? app.environment
      : null;
  const scopesFound = creds?.scopes?.length ?? null;
  const tokenExpiresAt = creds?.expiresAt ? new Date(creds.expiresAt).toISOString() : iso(acct?.tokenExpiresAt ?? null);
  const credentialsPresent = Boolean(creds?.refreshToken || acct?.refreshToken);

  if (!credentialsPresent) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      httpStatus: null,
      errorClass: 'CredentialsMissing',
      error: 'No OAuth refresh token in the vault for this account.',
      injected: false,
      identity: acct?.ebayUserId ?? creds?.accountRef ?? null,
      environment,
      scopesFound,
      scopesExpected: expected.length,
      tokenExpiresAt,
      credentialsPresent: false,
    };
  }

  const connector = getConnector('ebay');
  let httpStatus: number | null = null;
  let ok = false;
  let error: string | null = null;
  let errorClass: string | null = null;
  try {
    const result = await connector?.validate?.(orgId);
    ok = Boolean(result?.ok);
    error = result?.ok ? null : (result?.error ?? 'Health probe failed');
    errorClass = result?.ok ? null : 'ProviderHealthFailed';
    const detail = result?.detail as { accounts?: Array<{ accountName: string; ok: boolean; error?: string }> } | undefined;
    const mine = detail?.accounts?.find((a) => a.accountName === accountName);
    if (mine) {
      ok = mine.ok;
      error = mine.ok ? null : (mine.error ?? error);
    }
    httpStatus = ok ? 200 : 401;
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
    errorClass = 'ProviderHealthFailed';
  }

  return {
    ok,
    latencyMs: Date.now() - started,
    httpStatus,
    errorClass,
    error,
    injected: false,
    identity: acct?.ebayUserId ?? creds?.accountRef ?? null,
    environment,
    scopesFound,
    scopesExpected: expected.length,
    tokenExpiresAt,
    credentialsPresent,
  };
}

async function probeGeneric(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null,
): Promise<ProbeResult> {
  const started = Date.now();
  const injected = await consumeFailureInjection(orgId, provider, scope);
  if (injected) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      httpStatus: injected.httpStatus,
      errorClass: injected.errorClass,
      error: injected.message,
      injected: true,
      identity: null,
      environment: null,
      scopesFound: null,
      scopesExpected: null,
      tokenExpiresAt: null,
      credentialsPresent: true,
    };
  }

  const creds = await getIntegrationCredentials<Record<string, unknown>>(orgId, provider, { scope });
  const credentialsPresent = creds != null;
  const connector = getConnector(provider);
  const environment =
    typeof creds?.environment === 'string'
      ? String(creds.environment)
      : typeof creds?.region === 'string'
        ? String(creds.region)
        : null;
  const identity =
    (typeof creds?.accountRef === 'string' && creds.accountRef)
    || (typeof creds?.orgId === 'string' && creds.orgId)
    || (typeof creds?.sellerId === 'string' && creds.sellerId)
    || (typeof creds?.storeId === 'string' && creds.storeId)
    || null;
  const scopes = Array.isArray(creds?.scopes) ? creds.scopes : null;
  const tokenExpiresAt =
    typeof creds?.expiresAt === 'number' ? new Date(creds.expiresAt).toISOString() : null;

  if (!credentialsPresent && !connector?.validate) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      httpStatus: null,
      errorClass: 'CredentialsMissing',
      error: 'No credentials in the vault for this connection.',
      injected: false,
      identity,
      environment,
      scopesFound: scopes?.length ?? null,
      scopesExpected: null,
      tokenExpiresAt,
      credentialsPresent: false,
    };
  }

  if (!connector?.validate) {
    return {
      ok: credentialsPresent,
      latencyMs: Date.now() - started,
      httpStatus: credentialsPresent ? 200 : null,
      errorClass: credentialsPresent ? null : 'CredentialsMissing',
      error: credentialsPresent ? null : 'No credentials in the vault for this connection.',
      injected: false,
      identity,
      environment,
      scopesFound: scopes?.length ?? null,
      scopesExpected: null,
      tokenExpiresAt,
      credentialsPresent,
    };
  }

  let ok = false;
  let error: string | null = null;
  let errorClass: string | null = null;
  let httpStatus: number | null = null;
  try {
    const result = await connector.validate(orgId, scope);
    ok = result.ok;
    error = result.ok ? null : (result.error ?? 'Health probe failed');
    errorClass = result.ok ? null : 'ProviderHealthFailed';
    httpStatus = result.ok ? 200 : 502;
    const detail = redactRecord(result.detail ?? {});
    const zohoId = (detail.connection as { zohoOrganizationId?: string } | undefined)?.zohoOrganizationId;
    return {
      ok,
      latencyMs: Date.now() - started,
      httpStatus,
      errorClass,
      error,
      injected: false,
      identity: zohoId ?? identity,
      environment:
        (detail.connection as { dataCenter?: string } | undefined)?.dataCenter ?? environment,
      scopesFound: scopes?.length ?? null,
      scopesExpected: null,
      tokenExpiresAt,
      credentialsPresent,
    };
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
    errorClass = 'ProviderHealthFailed';
    return {
      ok,
      latencyMs: Date.now() - started,
      httpStatus,
      errorClass,
      error,
      injected: false,
      identity,
      environment,
      scopesFound: scopes?.length ?? null,
      scopesExpected: null,
      tokenExpiresAt,
      credentialsPresent,
    };
  }
}

async function persistHealth(
  orgId: OrgId,
  report: {
    provider: string;
    scope: string;
    connected: boolean;
    identity: string | null;
    environment: string | null;
    scopesFound: number | null;
    scopesExpected: number | null;
    tokenExpiresAt: string | null;
    live: ProbeResult;
  },
): Promise<void> {
  const ok = report.live.ok;
  await withTenantTransaction(orgId, async (client) => {
    await client.query(
      `INSERT INTO qa_connection_health (
         organization_id, provider, scope, connected, identity, environment,
         scopes_found, scopes_expected, token_expires_at, last_http_status,
         last_latency_ms, last_ok, last_error_class, last_error,
         last_success_at, last_failure_at, last_checked_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         CASE WHEN $12 THEN now() ELSE NULL END,
         CASE WHEN $12 THEN NULL ELSE now() END,
         now(), now()
       )
       ON CONFLICT (organization_id, provider, scope) DO UPDATE SET
         connected = EXCLUDED.connected,
         identity = EXCLUDED.identity,
         environment = EXCLUDED.environment,
         scopes_found = EXCLUDED.scopes_found,
         scopes_expected = EXCLUDED.scopes_expected,
         token_expires_at = EXCLUDED.token_expires_at,
         last_http_status = EXCLUDED.last_http_status,
         last_latency_ms = EXCLUDED.last_latency_ms,
         last_ok = EXCLUDED.last_ok,
         last_error_class = EXCLUDED.last_error_class,
         last_error = EXCLUDED.last_error,
         last_success_at = CASE WHEN EXCLUDED.last_ok THEN now() ELSE qa_connection_health.last_success_at END,
         last_failure_at = CASE WHEN EXCLUDED.last_ok THEN qa_connection_health.last_failure_at ELSE now() END,
         last_checked_at = now(),
         updated_at = now()`,
      [
        orgId,
        report.provider,
        report.scope,
        report.connected,
        report.identity,
        report.environment,
        report.scopesFound,
        report.scopesExpected,
        report.tokenExpiresAt,
        report.live.httpStatus,
        report.live.latencyMs,
        ok,
        report.live.errorClass,
        report.live.error,
      ],
    );
  });
}

export async function runConnectionHealthChecks(
  orgId: OrgId,
  filter?: { provider?: string; scope?: string | null },
): Promise<ConnectionHealthReport[]> {
  const current = await listConnectionHealth(orgId);
  const targets = current.filter((r) => {
    if (filter?.provider && r.provider !== filter.provider) return false;
    if (filter?.scope != null && r.scope !== (filter.scope ?? '')) return false;
    return true;
  });

  // If the vault is empty but eBay accounts exist, listConnectionHealth already
  // synthesized them. If both are empty, still probe ebay/zoho/amazon defaults.
  const toProbe = targets.length > 0 ? targets : [
    { provider: 'ebay', scope: '', label: 'eBay' },
    { provider: 'zoho', scope: '', label: 'Zoho' },
    { provider: 'amazon', scope: '', label: 'Amazon' },
  ];

  const out: ConnectionHealthReport[] = [];
  for (const target of toProbe) {
    const ebayScope = /^(seller|buyer):(.+)$/.exec(target.scope);
    let live: ProbeResult;
    if (target.provider === 'ebay' && ebayScope) {
      live = await probeEbayAccount(orgId, ebayScope[2]!, ebayScope[1] as 'seller' | 'buyer');
    } else if (target.provider === 'ebay' && !target.scope) {
      const accounts = await listActiveEbayAccounts(orgId).catch(() => []);
      if (accounts.length === 0) {
        live = await probeGeneric(orgId, 'ebay', null);
      } else {
        // Probe each account as its own report.
        for (const acct of accounts) {
          const acctLive = await probeEbayAccount(orgId, acct.accountName, acct.accountRole);
          const report = {
            provider: 'ebay',
            scope: `${acct.accountRole}:${acct.accountName}`,
            connected: acctLive.credentialsPresent,
            identity: acctLive.identity ?? acct.ebayUserId,
            environment: acctLive.environment,
            scopesFound: acctLive.scopesFound,
            scopesExpected: acctLive.scopesExpected,
            tokenExpiresAt: acctLive.tokenExpiresAt,
            live: acctLive,
          };
          await persistHealth(orgId, report).catch(() => undefined);
          out.push({
            provider: report.provider,
            scope: report.scope,
            label: `${acct.accountRole} · ${acct.accountName}`,
            connected: report.connected,
            identity: report.identity,
            environment: report.environment,
            scopesFound: report.scopesFound,
            scopesExpected: report.scopesExpected,
            tokenExpiresAt: report.tokenExpiresAt,
            lastHttpStatus: acctLive.httpStatus,
            lastLatencyMs: acctLive.latencyMs,
            lastOk: acctLive.ok,
            lastErrorClass: acctLive.errorClass,
            lastError: acctLive.error,
            lastSuccessAt: acctLive.ok ? new Date().toISOString() : null,
            lastFailureAt: acctLive.ok ? null : new Date().toISOString(),
            lastCheckedAt: new Date().toISOString(),
            credentialsPresent: acctLive.credentialsPresent,
            live: {
              ok: acctLive.ok,
              latencyMs: acctLive.latencyMs,
              httpStatus: acctLive.httpStatus,
              errorClass: acctLive.errorClass,
              error: acctLive.error,
              injected: acctLive.injected,
            },
          });
        }
        continue;
      }
    } else {
      live = await probeGeneric(orgId, target.provider as IntegrationProvider, target.scope || null);
    }

    const report = {
      provider: target.provider,
      scope: target.scope,
      connected: live.credentialsPresent,
      identity: live.identity,
      environment: live.environment,
      scopesFound: live.scopesFound,
      scopesExpected: live.scopesExpected,
      tokenExpiresAt: live.tokenExpiresAt,
      live,
    };
    await persistHealth(orgId, report).catch(() => undefined);
    out.push({
      provider: report.provider,
      scope: report.scope,
      label: 'label' in target && typeof target.label === 'string' ? target.label : target.provider,
      connected: report.connected,
      identity: report.identity,
      environment: report.environment,
      scopesFound: report.scopesFound,
      scopesExpected: report.scopesExpected,
      tokenExpiresAt: report.tokenExpiresAt,
      lastHttpStatus: live.httpStatus,
      lastLatencyMs: live.latencyMs,
      lastOk: live.ok,
      lastErrorClass: live.errorClass,
      lastError: live.error,
      lastSuccessAt: live.ok ? new Date().toISOString() : null,
      lastFailureAt: live.ok ? null : new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      credentialsPresent: live.credentialsPresent,
      live: {
        ok: live.ok,
        latencyMs: live.latencyMs,
        httpStatus: live.httpStatus,
        errorClass: live.errorClass,
        error: live.error,
        injected: live.injected,
      },
    });
  }

  return out;
}
