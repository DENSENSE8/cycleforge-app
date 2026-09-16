/**
 * /settings/integrations — org Settings → Integrations.
 *
 * Server component. Builds per-provider connection status from three sources —
 * the encrypted credential vault (organization_integrations), the per-account
 * tables (amazon_accounts / ebay_accounts), and the env-fallback resolver
 * (getIntegrationCredentials, which covers USAV's env-based config) — then
 * renders a category-grouped catalog of provider cards. The connect / disconnect
 * / health actions live in the client cards.
 *
 * Gated by admin.view at the page level; individual mutations are gated server
 * side (integrations.*, admin.manage_features, CRON_SECRET).
 */

import { requirePermission } from '@/lib/auth/page-guard';
import pool from '@/lib/db';
import Link from 'next/link';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';
import { getIntegrationCredentials, type IntegrationProvider } from '@/lib/integrations/credentials';
import { isNangoConfigured } from '@/lib/integrations/nango';
import { getConnector } from '@/lib/integrations/connectors/registry';
import { integrationLimitStatus } from '@/lib/integrations/connectors/connections';
import { IntegrationCard } from './IntegrationCard';
import { ResultBanner } from './ResultBanner';
import { CsvOrderImport } from '@/components/orders/CsvOrderImport';
import {
  PROVIDER_CATALOG,
  INTEGRATION_CATEGORIES,
  type ProviderDef,
  type ProviderState,
  type AccountSummary,
} from './registry';
import { Panel } from '@/design-system/primitives';


interface OrgRow {
  provider: string;
  status: string;
  display_label: string | null;
  last_error: string | null;
  scope: string | null;
  updated_at: Date | null;
  last_used_at: Date | null;
  last_synced_at: Date | null;
}
interface AmazonRow {
  id: number; account_name: string; seller_id: string | null; region: string | null;
  status: string | null; last_error: string | null; last_sync_at: Date | null;
}
interface EbayRow {
  id: number; account_name: string; ebay_user_id: string | null; token_expires_at: Date | null; is_active: boolean | null; last_sync_date: Date | null; account_role: string | null;
}

function relTime(d: Date | null): string | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('admin.view');
  const orgId = user.organizationId;
  const sp = await searchParams;
  const success = typeof sp.success === 'string' ? sp.success : undefined;
  const error = typeof sp.error === 'string' ? sp.error : undefined;
  const ebayOauthError =
    typeof sp.ebay_oauth_error === 'string' ? sp.ebay_oauth_error : undefined;
  const nangoReady = isNangoConfigured();

  const [orgRowsR, amazonR, ebayR] = await Promise.all([
    pool.query<OrgRow>(
      `SELECT provider, status, display_label, last_error, scope, updated_at, last_used_at, last_synced_at
         FROM organization_integrations
        WHERE organization_id = $1
        ORDER BY provider ASC, scope NULLS FIRST`,
      [orgId],
    ),
    pool.query<AmazonRow>(
      `SELECT id, account_name, seller_id, region, status, last_error, last_sync_at
         FROM amazon_accounts WHERE organization_id = $1 AND is_active = true ORDER BY account_name`,
      [orgId],
    ),
    pool.query<EbayRow>(
      `SELECT id, account_name, ebay_user_id, token_expires_at, is_active, last_sync_date, account_role
         FROM ebay_accounts
        WHERE organization_id = $1 AND (platform = 'EBAY' OR platform IS NULL)
        ORDER BY account_role DESC, account_name`,
      [orgId],
    ),
  ]);

  const limit = await integrationLimitStatus(orgId);

  const orgByProvider = new Map<string, OrgRow>();
  for (const row of orgRowsR.rows) if (!orgByProvider.has(row.provider)) orgByProvider.set(row.provider, row);

  // Env-fallback resolver covers USAV's env-based config for vault/oauth providers.
  const resolverKeys = PROVIDER_CATALOG.filter((p) => p.connect === 'vault' || p.connect === 'oauth').map((p) => p.key);
  const configured = new Map<string, boolean>(
    await Promise.all(
      resolverKeys.map(async (k) =>
        [k, (await getIntegrationCredentials(orgId, k as IntegrationProvider)) != null] as const,
      ),
    ),
  );

  const buildState = (def: ProviderDef): ProviderState => {
    if (def.connect === 'amazon') {
      const accounts: AccountSummary[] = amazonR.rows.map((a) => ({
        id: a.id,
        label: a.account_name,
        status: a.status === 'active' ? 'active' : a.status === 'revoked' ? 'revoked' : 'error',
        detail: [a.region, a.last_error ? 'error' : a.last_sync_at ? `synced ${relTime(a.last_sync_at)}` : null]
          .filter(Boolean).join(' · ') || undefined,
      }));
      const status: ProviderState['status'] = accounts.length === 0
        ? 'not_connected'
        : accounts.some((a) => a.status === 'error') ? 'error' : 'connected';
      return { status, displayLabel: null, lastError: amazonR.rows.find((a) => a.last_error)?.last_error ?? null, updatedAt: null, accounts };
    }

    if (def.connect === 'ebay') {
      const accounts: AccountSummary[] = ebayR.rows.map((e) => {
        const minutesLeft = e.token_expires_at ? Math.round((new Date(e.token_expires_at).getTime() - Date.now()) / 60000) : null;
        const status: AccountSummary['status'] = e.is_active === false ? 'revoked' : minutesLeft != null && minutesLeft < 60 ? 'expiring' : 'active';
        const detail = e.is_active === false ? 'inactive' : minutesLeft == null ? undefined : minutesLeft <= 0 ? 'token expired' : `token ${minutesLeft}m left`;
        const role: AccountSummary['role'] = e.account_role === 'buyer' ? 'buyer' : 'seller';
        return { id: e.id, label: e.account_name, status, detail, role, ebayUserId: e.ebay_user_id };
      });
      const status: ProviderState['status'] = accounts.length === 0
        ? 'not_connected'
        : accounts.every((a) => a.status === 'revoked') ? 'error' : 'connected';
      return { status, displayLabel: null, lastError: null, updatedAt: null, accounts };
    }

    // vault / oauth (single credential row + env fallback)
    const row = orgByProvider.get(def.key) ?? null;
    const isConfigured = configured.get(def.key) ?? false;
    // Only an 'active' row counts as connected — 'revoked'/'error' rows must
    // surface as needs-attention, never silently read as connected.
    const status: ProviderState['status'] = row
      ? (row.status === 'active' ? 'connected' : 'error')
      : (isConfigured ? 'connected' : 'not_connected');
    const lastError = row
      ? row.last_error ?? (row.status !== 'active' ? `Connection ${row.status} — reconnect to resume syncing.` : null)
      : null;
    return {
      status,
      displayLabel: row?.display_label ?? (isConfigured && !row ? 'Configured via environment' : null),
      lastError,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      lastUsedAt: row?.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      accounts: [],
    };
  };

  const connectedCount = PROVIDER_CATALOG.filter((p) => buildState(p).status === 'connected').length;

  return (
    <div className={cn('flex h-full min-h-0 flex-col antialiased', SETTINGS_FLOOR_CLASS)}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <SettingsSectionHeader title="Apps & integrations" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-role-data text-text-soft">
            Connect this workspace to the marketplaces and services it runs on. Credentials are encrypted at rest in the workspace vault.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/integrations/sync"
              className="text-role-caption font-semibold text-blue-600 hover:underline"
            >
              Sync tools →
            </Link>
            <Link
              href="/settings/integrations/diagnostics"
              className="text-role-caption font-semibold text-blue-600 hover:underline"
            >
              Connection diagnostics →
            </Link>
            {!limit.unlimited && (
              <span className={`rounded-full px-2.5 py-1 text-role-caption font-semibold ${limit.atLimit ? 'bg-amber-100 text-amber-700' : 'bg-surface-sunken text-text-muted'}`}>
                {limit.used} / {limit.max} integrations{limit.atLimit ? ' · upgrade to add more' : ''}
              </span>
            )}
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-role-caption font-semibold text-text-muted">
              {connectedCount} / {PROVIDER_CATALOG.length} connected
            </span>
          </div>
        </div>

        {(success || error) && (
          <ResultBanner success={success} error={error} ebayOauthError={ebayOauthError} />
        )}

        {INTEGRATION_CATEGORIES.map((category) => {
          const providers = PROVIDER_CATALOG.filter((p) => p.category === category);
          if (providers.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <h2 className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-faint">{category}</h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {providers.map((def) => {
                  const state = buildState(def);
                  const connector = getConnector(def.key);
                  return (
                    <IntegrationCard
                      key={def.key}
                      def={def}
                      state={state}
                      nangoReady={nangoReady}
                      canSync={state.status === 'connected' && !!connector?.sync}
                      capabilities={[...(connector?.capabilities ?? [])]}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="space-y-3">
          <h2 className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-faint">Import</h2>
          <Panel radius="xl" padding="sm">
            <CsvOrderImport />
          </Panel>
        </section>
        </div>
      </main>
    </div>
  );
}
