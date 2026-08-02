'use client';

/**
 * Per-provider integration card. Renders a monogram badge, status pill, the
 * connected accounts, and an action set driven by the provider's `connect`
 * method (registry.ts).
 */
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { RefreshCw, Trash2, ExternalLink, Link2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { hasTypedCredentialForm } from '@/lib/integrations/credential-form-defs';
import { parseHealthResult } from './integration-health';
import type { ProviderDef, ProviderState, AccountSummary } from './registry';
import { monogram, managePermission } from './registry';
import { AmazonConnectModal } from './AmazonConnectModal';
import { VaultConnectSheet } from './VaultConnectSheet';
import { EbayConnectPopover, EbayAccountNameChip } from './EbayAccountPopover';
import { IntegrationConnectSuccess } from './IntegrationConnectSuccess';

const PILL: Record<ProviderState['status'], { dot: string; text: string; bg: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Connected' },
  error: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', label: 'Needs attention' },
  not_connected: { dot: 'bg-surface-strong', text: 'text-text-soft', bg: 'bg-surface-sunken', label: 'Not connected' },
};

const ACCOUNT_DOT: Record<AccountSummary['status'], string> = {
  active: 'bg-emerald-500',
  error: 'bg-red-500',
  expiring: 'bg-amber-500',
  revoked: 'bg-border-emphasis',
  unknown: 'bg-surface-strong',
};

export function IntegrationCard({
  def,
  state,
  nangoReady,
  canSync,
  capabilities = [],
}: {
  def: ProviderDef;
  state: ProviderState;
  nangoReady?: boolean;
  canSync?: boolean;
  capabilities?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [amazonOpen, setAmazonOpen] = useState(false);
  const [ebayOpen, setEbayOpen] = useState<'seller' | 'buyer' | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const sellerConnectRef = useRef<HTMLButtonElement>(null);
  const buyerConnectRef = useRef<HTMLButtonElement>(null);

  const auth = useAuth();
  const canManage = auth.isLoaded ? auth.has(managePermission(def)) : false;
  const pill = PILL[state.status];
  const connected = state.status !== 'not_connected';
  const detailHref = `/settings/integrations/${def.key}`;

  const runHealth = useCallback(async () => {
    if (!def.healthPath) return;
    setBusy(true);
    try {
      const res = await fetch(def.healthPath);
      const data = await res.json().catch(() => ({}));
      const result = parseHealthResult(data, def.label);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setBusy(false);
    }
  }, [def]);

  const runSync = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/${def.key}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const bits = [
          data.imported ? `${data.imported} imported` : null,
          data.updated ? `${data.updated} updated` : null,
        ].filter(Boolean).join(', ');
        toast.success(`${def.label} synced${bits ? ` — ${bits}` : ''}.`);
      } else {
        toast.error(`${def.label} sync failed: ${data.error || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'sync failed');
    } finally {
      setBusy(false);
    }
  }, [def]);

  const vaultDisconnect = useCallback(async () => {
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
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  }, [def]);

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
        setBusy(false);
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
              toast.success(`${def.label} connected.`);
              window.location.reload();
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
      toast.error(err instanceof Error ? err.message : 'connect failed');
    } finally {
      setBusy(false);
    }
  }, [def]);

  const ebayDisconnect = useCallback(async (id: number, label: string) => {
    if (!confirm(`Disconnect eBay account "${label}"? Its stored tokens will be removed.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ebay/accounts?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast.success(`Disconnected ${label}.`);
        window.location.reload();
      } else if (res.status === 403 && data?.error === 'STEPUP_REQUIRED') {
        toast.error('Re-verification required to disconnect — please re-authenticate and retry.');
      } else {
        toast.error(data?.error || `Disconnect failed (HTTP ${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  }, []);

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

  const amazonDisconnect = useCallback(async (id: number, label: string) => {
    if (!confirm(`Disconnect Amazon account "${label}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/amazon/accounts?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast.success(`Disconnected ${label}.`);
        window.location.reload();
      } else {
        toast.error(data?.error || `Disconnect failed (HTTP ${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const openVaultConnect = useCallback(() => setVaultOpen(true), []);

  return (
    <div id={def.key} className="flex h-full scroll-mt-6 flex-col rounded-2xl border border-border-soft bg-surface-card p-4 shadow-sm shadow-gray-900/[0.02]">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-role-body font-semibold ${def.badge}`}>
          {monogram(def.label)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={detailHref} className="truncate text-role-body font-semibold text-text-default hover:text-blue-600">
              {def.label}
            </Link>
            {def.docsUrl && (
              <HoverTooltip label="Provider docs" asChild>
                <a href={def.docsUrl} target="_blank" rel="noreferrer" aria-label="Provider docs" className="text-text-faint hover:text-text-soft">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </HoverTooltip>
            )}
          </div>
          <p className="mt-0.5 text-role-caption leading-snug text-text-soft">{def.description}</p>
          {capabilities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {capabilities.map((cap) => (
                <span key={cap} className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-wider text-text-faint">
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ${pill.bg} px-2 py-1 text-role-micro ${pill.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
          {pill.label}
        </span>
      </div>

      {connectSuccess && (
        <div className="mt-3">
          <IntegrationConnectSuccess message={connectSuccess} confettiBurst={false} />
        </div>
      )}

      {state.accounts.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-xl bg-surface-canvas/70 p-2">
          {state.accounts.map((acct, i) => (
            <div key={acct.id ?? `${acct.label}-${i}`} className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCOUNT_DOT[acct.status]}`} />
              {def.connect === 'ebay' ? (
                <EbayAccountNameChip
                  account={acct}
                  canManage={canManage}
                  busy={busy}
                  onRefresh={() => ebayRefresh(acct.label)}
                  onDisconnect={acct.id != null ? () => ebayDisconnect(acct.id!, acct.label) : undefined}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-role-caption font-medium text-text-default">{acct.label}</span>
              )}
              {def.connect === 'ebay' && acct.role === 'buyer' && (
                <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-indigo-700 ring-1 ring-inset ring-indigo-200">Purchasing</span>
              )}
              {acct.detail && def.connect !== 'ebay' && <span className="shrink-0 text-role-caption text-text-faint">{acct.detail}</span>}
              {canManage && def.connect === 'amazon' && acct.id != null && (
                <HoverTooltip label="Disconnect account" asChild>
                  <IconButton
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => amazonDisconnect(acct.id!, acct.label)}
                    disabled={busy}
                    ariaLabel="Disconnect account"
                    className="shrink-0 hover:text-red-600"
                  />
                </HoverTooltip>
              )}
            </div>
          ))}
        </div>
      )}

      {state.displayLabel && state.accounts.length === 0 && (
        <div className="mt-2 text-role-caption text-text-muted">{state.displayLabel}</div>
      )}
      {state.lastError && (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-role-caption text-red-700">{state.lastError}</div>
      )}
      {state.lastUsedAt && (
        <div className="mt-2 text-role-caption text-text-faint">
          Last used {formatDistanceToNow(new Date(state.lastUsedAt), { addSuffix: true })}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-border-hairline pt-3">
        {!canManage ? (
          <span className="text-role-caption text-text-faint">Read-only — requires elevated access</span>
        ) : (
          <>
            {connected ? (
              <Link
                href={detailHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-role-caption font-medium text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500"
              >
                Manage
              </Link>
            ) : (
              <>
                {def.connect === 'amazon' && (
                  <Button variant="primary" size="sm" icon={<Link2 />} onClick={() => setAmazonOpen(true)}>Connect</Button>
                )}
                {def.connect === 'ebay' && (
                  <>
                    <Button ref={sellerConnectRef} variant="primary" size="sm" icon={<Link2 />} onClick={() => setEbayOpen('seller')}>Connect</Button>
                    <Button ref={buyerConnectRef} variant="secondary" size="sm" icon={<Link2 />} onClick={() => setEbayOpen('buyer')}>Add purchasing</Button>
                  </>
                )}
                {def.connect === 'oauth' && (
                  <Button variant="primary" size="sm" icon={<Link2 />} onClick={oauthConnect}>Connect</Button>
                )}
                {def.connect === 'vault' && hasTypedCredentialForm(def.key) && (
                  <Button variant="primary" size="sm" onClick={openVaultConnect}>Connect</Button>
                )}
                {def.connect === 'nango' && (
                  nangoReady ? (
                    <Button variant="primary" size="sm" icon={<Link2 />} loading={busy} onClick={connectViaNango}>Connect</Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={openVaultConnect}>Connect</Button>
                  )
                )}
              </>
            )}

            {def.healthPath && (
              <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={runHealth}>Check</Button>
            )}

            {canSync && (
              <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={runSync}>Sync now</Button>
            )}

            <span className="flex-1" />

            {connected && (def.connect === 'vault' || def.connect === 'oauth' || def.connect === 'nango') && (
              <Button variant="ghost" size="sm" onClick={vaultDisconnect} disabled={busy} className="text-text-soft hover:text-red-600">
                Disconnect
              </Button>
            )}
          </>
        )}
      </div>

      {amazonOpen && <AmazonConnectModal onClose={() => setAmazonOpen(false)} />}

      {vaultOpen && (
        <VaultConnectSheet
          provider={def.key}
          providerLabel={def.label}
          onClose={() => setVaultOpen(false)}
          isUpdate={connected}
          onSuccess={() => {
            setVaultOpen(false);
            setConnectSuccess(`${def.label} credentials saved.`);
            setTimeout(() => window.location.reload(), 1400);
          }}
        />
      )}

      {ebayOpen && (
        <EbayConnectPopover
          role={ebayOpen}
          existingLabels={state.accounts.filter((a) => (a.role ?? 'seller') === ebayOpen).map((a) => a.label)}
          oauthStartPath={def.oauthStartPath ?? '/api/ebay/connect'}
          open={ebayOpen != null}
          onClose={() => setEbayOpen(null)}
          anchorRef={ebayOpen === 'buyer' ? buyerConnectRef : sellerConnectRef}
        />
      )}
    </div>
  );
}
