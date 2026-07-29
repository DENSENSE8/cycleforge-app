'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import { RefreshCw, ExternalLink, Link2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { authKindLabel } from '@/lib/integrations/credential-form-defs';
import { hasTypedCredentialForm } from '@/lib/integrations/credential-form-defs';
import type { IntegrationSummary } from '@/lib/integrations/integration-summary';
import type { ProviderDef, AccountSummary } from '../registry';
import { managePermission } from '../registry';
import { VaultConnectSheet } from '../VaultConnectSheet';
import { AmazonConnectModal } from '../AmazonConnectModal';
import { EbayConnectPopover, EbayAccountNameChip } from '../EbayAccountPopover';
import { IntegrationConnectSuccess } from '../IntegrationConnectSuccess';
import { parseHealthResult } from '../integration-health';

const STATUS_PILL: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  active: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Connected' },
  error: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', label: 'Needs attention' },
  revoked: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Revoked' },
  disconnected: { dot: 'bg-surface-strong', text: 'text-text-soft', bg: 'bg-surface-sunken', label: 'Not connected' },
};

interface IntegrationDetailClientProps {
  def: ProviderDef;
  summary: IntegrationSummary;
  nangoReady?: boolean;
}

function toAccountSummary(acct: IntegrationSummary['accounts'][number]): AccountSummary {
  return {
    id: acct.id,
    label: acct.label,
    status: (acct.status as AccountSummary['status']) || 'unknown',
    detail: acct.detail,
    role: acct.role,
    ebayUserId: acct.ebayUserId,
  };
}

export function IntegrationDetailClient({ def, summary, nangoReady }: IntegrationDetailClientProps) {
  const router = useRouter();
  const auth = useAuth();
  const canManage = auth.isLoaded ? auth.has(managePermission(def)) : false;
  const [busy, setBusy] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [amazonOpen, setAmazonOpen] = useState(false);
  const [ebayOpen, setEbayOpen] = useState<'seller' | 'buyer' | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const sellerConnectRef = useRef<HTMLButtonElement>(null);
  const buyerConnectRef = useRef<HTMLButtonElement>(null);

  const pill = STATUS_PILL[summary.status] ?? STATUS_PILL.disconnected;

  const refresh = useCallback(() => router.refresh(), [router]);

  const runHealth = useCallback(async () => {
    if (!summary.healthPath) return;
    setBusy(true);
    try {
      const res = await fetch(summary.healthPath);
      const data = await res.json().catch(() => ({}));
      const result = parseHealthResult(data, def.label);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setBusy(false);
    }
  }, [summary.healthPath, def.label]);

  const runSync = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/${def.key}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const bits = [data.imported ? `${data.imported} imported` : null, data.updated ? `${data.updated} updated` : null].filter(Boolean).join(', ');
        toast.success(`${def.label} synced${bits ? ` — ${bits}` : ''}.`);
        refresh();
      } else {
        toast.error(`${def.label} sync failed: ${data.error || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }, [def, refresh]);

  const disconnect = useCallback(async () => {
    if (!confirm(`Disconnect ${def.label}? Sync jobs will fail until reconnected.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/integrations/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: def.key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`Couldn't disconnect: ${data.error || res.status}`);
      } else {
        toast.success(`${def.label} disconnected.`);
        router.push('/settings/integrations');
      }
    } finally {
      setBusy(false);
    }
  }, [def, router]);

  const oauthConnect = useCallback(() => {
    if (def.oauthStartPath) window.location.href = def.oauthStartPath;
  }, [def]);

  const connectViaNango = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/nango/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: def.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error === 'NANGO_NOT_CONFIGURED' ? 'Nango is not configured on the server.' : data.error || `HTTP ${res.status}`);
        return;
      }
      const { default: Nango } = await import('@nangohq/frontend');
      const nango = new Nango();
      nango.openConnectUI({
        sessionToken: data.token,
        ...(process.env.NEXT_PUBLIC_NANGO_CONNECT_BASE_URL ? { baseURL: process.env.NEXT_PUBLIC_NANGO_CONNECT_BASE_URL } : {}),
        ...(process.env.NEXT_PUBLIC_NANGO_API_URL ? { apiURL: process.env.NEXT_PUBLIC_NANGO_API_URL } : {}),
        onEvent: async (event) => {
          if (event.type === 'connect') {
            const m = await fetch('/api/integrations/nango/connected', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                provider: def.key,
                providerConfigKey: event.payload.providerConfigKey,
                connectionId: event.payload.connectionId,
              }),
            });
            if (m.ok) {
              setConnectSuccess(`${def.label} connected.`);
              setTimeout(() => refresh(), 1400);
            } else {
              const md = await m.json().catch(() => ({}));
              toast.error(md.error || 'Failed to record connection');
            }
          } else if (event.type === 'error') {
            toast.error(event.payload.errorMessage || 'Connection failed');
          }
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  }, [def, refresh]);

  const ebayDisconnect = useCallback(async (id: number, label: string) => {
    if (!confirm(`Disconnect eBay account "${label}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ebay/accounts?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast.success(`Disconnected ${label}.`);
        refresh();
      } else {
        toast.error(data?.error || `Disconnect failed (HTTP ${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const ebayRefresh = useCallback(async (accountName: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/ebay/refresh-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) toast.success(`Refreshed ${accountName}.`);
      else toast.error(data?.error || `Refresh failed (HTTP ${res.status})`);
    } finally {
      setBusy(false);
    }
  }, []);

  const initialVaultValues = Object.fromEntries(
    summary.configuredFields
      .filter((f) => f.value)
      .map((f) => [f.key, f.value!]),
  );

  return (
    <div className="space-y-6">
      {connectSuccess && (
        <IntegrationConnectSuccess message={connectSuccess} confettiBurst={false} />
      )}

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full ${pill.bg} px-3 py-1.5 text-role-caption font-semibold ${pill.text}`}>
          <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
          {pill.label}
        </span>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-role-caption font-medium text-text-muted">
          {authKindLabel(summary.authKind)}
        </span>
        {summary.capabilities.map((cap) => (
          <span key={cap} className="rounded-full bg-blue-50 px-2.5 py-1 text-role-caption font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            {cap}
          </span>
        ))}
      </div>

      {/* Identity */}
      <section className="rounded-xl border border-border-soft bg-surface-card p-4 space-y-2">
        <p className="text-role-micro uppercase tracking-widest text-text-faint">Connection identity</p>
        {summary.displayLabel && (
          <p className="text-role-body font-semibold text-text-default">{summary.displayLabel}</p>
        )}
        {summary.configuredFields
          .filter((f) => f.value)
          .map((f) => (
            <p key={f.key} className="text-role-caption text-text-soft">
              <span className="font-medium text-text-muted">{f.key}:</span> {f.value}
            </p>
          ))}
        {summary.configuredFields
          .filter((f) => f.hint)
          .map((f) => (
            <p key={f.key} className="text-role-caption text-text-soft">
              <span className="font-medium text-text-muted">{f.key}:</span> {f.hint}
            </p>
          ))}
        {summary.accounts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {summary.accounts.map((acct) => (
              <div key={acct.id ?? acct.label} className="flex items-center gap-2 text-role-caption">
                {def.connect === 'ebay' ? (
                  <EbayAccountNameChip
                    account={toAccountSummary(acct)}
                    canManage={canManage}
                    busy={busy}
                    onRefresh={() => ebayRefresh(acct.label)}
                    onDisconnect={acct.id != null ? () => ebayDisconnect(acct.id!, acct.label) : undefined}
                  />
                ) : (
                  <span className="font-medium text-text-default">{acct.label}</span>
                )}
                {acct.role === 'buyer' && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-widest text-indigo-700">Purchasing</span>
                )}
                {acct.detail && def.connect !== 'ebay' && <span className="text-text-faint">{acct.detail}</span>}
              </div>
            ))}
          </div>
        )}
        {!summary.connected && !summary.displayLabel && summary.accounts.length === 0 && (
          <p className="text-role-caption text-text-soft">Not connected yet.</p>
        )}
      </section>

      {/* Health */}
      <section className="rounded-xl border border-border-soft bg-surface-card p-4 space-y-1">
        <p className="text-role-micro uppercase tracking-widest text-text-faint">Health</p>
        {summary.lastError && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-role-caption text-red-700">{summary.lastError}</p>
        )}
        {summary.lastUsedAt && (
          <p className="text-role-caption text-text-soft">
            Last used {formatDistanceToNow(new Date(summary.lastUsedAt), { addSuffix: true })}
          </p>
        )}
        {summary.lastSyncedAt && (
          <p className="text-role-caption text-text-soft">
            Last synced {formatDistanceToNow(new Date(summary.lastSyncedAt), { addSuffix: true })}
          </p>
        )}
        {summary.connectedAt && (
          <p className="text-role-caption text-text-faint">
            Connected {formatDistanceToNow(new Date(summary.connectedAt), { addSuffix: true })}
          </p>
        )}
      </section>

      {/* Webhook */}
      {summary.webhookUrl && (
        <section className="rounded-xl border border-border-soft bg-surface-card p-4 space-y-2">
          <p className="text-role-micro uppercase tracking-widest text-text-faint">Webhook URL</p>
          <code className="block break-all rounded-lg bg-surface-canvas px-3 py-2 text-role-caption text-text-default">{summary.webhookUrl}</code>
          <p className="text-role-caption text-text-faint">Copy this URL into your provider&apos;s webhook settings.</p>
        </section>
      )}

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {def.connect === 'amazon' && (
            <Button variant="primary" size="sm" icon={<Link2 />} onClick={() => setAmazonOpen(true)}>
              {summary.connected ? 'Add account' : 'Connect'}
            </Button>
          )}
          {def.connect === 'ebay' && (
            <>
              <Button ref={sellerConnectRef} variant="primary" size="sm" icon={<Link2 />} onClick={() => setEbayOpen('seller')}>Add selling account</Button>
              <Button ref={buyerConnectRef} variant="secondary" size="sm" icon={<Link2 />} onClick={() => setEbayOpen('buyer')}>Add purchasing account</Button>
            </>
          )}
          {def.connect === 'oauth' && (
            <Button variant="primary" size="sm" icon={<Link2 />} onClick={oauthConnect}>
              {summary.connected ? 'Reconnect' : 'Connect with OAuth'}
            </Button>
          )}
          {def.connect === 'vault' && hasTypedCredentialForm(def.key) && (
            <Button variant={summary.connected ? 'secondary' : 'primary'} size="sm" onClick={() => setVaultOpen(true)}>
              {summary.connected ? 'Update credentials' : 'Connect'}
            </Button>
          )}
          {def.connect === 'nango' && (
            nangoReady ? (
              <Button variant="primary" size="sm" icon={<Link2 />} loading={busy} onClick={connectViaNango}>
                {summary.connected ? 'Reconnect' : 'Connect with OAuth'}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setVaultOpen(true)}>Connect</Button>
            )
          )}
          {summary.healthPath && (
            <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={runHealth}>Check</Button>
          )}
          {summary.canSync && (
            <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={runSync}>Sync now</Button>
          )}
          {summary.connected && (def.connect === 'vault' || def.connect === 'oauth' || def.connect === 'nango') && (
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy} className="text-text-soft hover:text-red-600">
              Disconnect
            </Button>
          )}
        </div>
      )}

      {!canManage && (
        <p className="text-role-caption text-text-faint">Read-only — requires elevated access to connect or disconnect.</p>
      )}

      {/* Footer links */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border-hairline pt-4 text-role-caption">
        {def.docsUrl && (
          <a href={def.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline">
            Provider docs <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Link href="/settings/integrations/diagnostics" className="font-semibold text-text-muted hover:text-text-default">
          Connection diagnostics →
        </Link>
        <Link href="/settings/integrations" className="font-semibold text-text-muted hover:text-text-default">
          ← All integrations
        </Link>
      </div>

      {vaultOpen && (
        <VaultConnectSheet
          provider={def.key}
          providerLabel={def.label}
          onClose={() => setVaultOpen(false)}
          onSuccess={() => {
            setVaultOpen(false);
            setConnectSuccess(`${def.label} credentials saved.`);
            setTimeout(() => refresh(), 1400);
          }}
          isUpdate={summary.connected}
          configuredFields={summary.configuredFields}
          initialValues={initialVaultValues}
        />
      )}
      {amazonOpen && <AmazonConnectModal onClose={() => setAmazonOpen(false)} />}
      {ebayOpen && (
        <EbayConnectPopover
          role={ebayOpen}
          existingLabels={summary.accounts.filter((a) => (a.role ?? 'seller') === ebayOpen).map((a) => a.label)}
          oauthStartPath={def.oauthStartPath ?? '/api/ebay/connect'}
          open={ebayOpen != null}
          onClose={() => setEbayOpen(null)}
          anchorRef={ebayOpen === 'buyer' ? buyerConnectRef : sellerConnectRef}
        />
      )}
    </div>
  );
}
