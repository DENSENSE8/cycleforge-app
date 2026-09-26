'use client';

/** ShipStation store → platform links (`integration_store_links`). */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Loader2 } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { useInvalidateCatalog, usePlatformAccountCatalog, usePlatformCatalog, useStoreLinks } from '@/hooks/useCatalog';
import { shipstationStoresQuery } from '@/lib/queries/catalog-queries';
import { isPlatformDefaultAccount } from '@/lib/platform-display';

/** The account picker's "no account" row — the store is the platform itself. */
const PLATFORM_ONLY = 0;

export function ShipStationStoreLinks({ canEdit = true }: { canEdit?: boolean }) {
  const invalidate = useInvalidateCatalog();
  const storesQ = useQuery(shipstationStoresQuery());
  const { rows: platforms } = usePlatformCatalog();
  const { rows: accounts } = usePlatformAccountCatalog();
  const { rows: links, isLoading: linksLoading } = useStoreLinks();
  const [busyStore, setBusyStore] = useState<number | null>(null);

  const linkByStore = useMemo(
    () => new Map(links.filter((l) => l.provider === 'shipstation').map((l) => [l.external_store_id, l])),
    [links],
  );
  const platformOptions = useMemo(
    () => platforms.filter((p) => p.is_active).map((p) => ({ value: String(p.id), label: p.label })),
    [platforms],
  );

  async function save(storeId: number, platformId: number, platformAccountId: number | null) {
    setBusyStore(storeId);
    try {
      const res = await fetch('/api/catalog/store-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'shipstation',
          externalStoreId: String(storeId),
          platformId,
          platformAccountId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) toast.error(data?.error || `Link failed (${res.status})`);
      else invalidate();
    } finally {
      setBusyStore(null);
    }
  }

  if (storesQ.isLoading || linksLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-role-caption text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading ShipStation stores…
      </div>
    );
  }
  if (storesQ.isError) {
    return <p className="text-role-caption text-red-700">Could not reach ShipStation to list its stores.</p>;
  }
  if (!storesQ.data?.connected) {
    return (
      <p className="text-role-caption text-text-soft">
        <Link href="/settings/integrations/shipstation" className="font-semibold text-blue-600 hover:underline">
          Connect ShipStation
        </Link>{' '}
        to link its stores.
      </p>
    );
  }

  const stores = storesQ.data.stores;
  const retired = stores.filter((s) => !s.active);
  // Retired stores still own historical orders, so they stay linkable — but
  // folded away: a dozen dead "New eBay Store" rows are not today's decision.
  const renderStore = (store: (typeof stores)[number]) => {
    const name = store.storeName?.trim() || `Store ${store.storeId}`;
    const link = linkByStore.get(String(store.storeId));
    const platform = link ? platforms.find((p) => String(p.id) === String(link.platform_id)) : undefined;
    const accountOptions = [
      { value: PLATFORM_ONLY, label: 'Platform only' },
      ...(platform
        ? accounts
            .filter((a) => String(a.platform_id) === String(platform.id) && !isPlatformDefaultAccount(platform, a))
            .map((a) => ({ value: Number(a.id), label: a.label }))
        : []),
    ];
    const busy = busyStore === store.storeId;
    return (
      <li
        key={store.storeId}
        data-store-id={store.storeId}
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,11rem)] items-center gap-2 rounded-lg border border-border-soft bg-surface-card inset-cozy"
      >
        <span className="flex min-w-0 items-center gap-2 text-role-caption">
          <span className="truncate font-semibold text-text-default">{name}</span>
          <span className="shrink-0 text-text-faint">{store.marketplaceName ?? store.marketplace}</span>
          {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-faint" /> : null}
        </span>
        <SearchableSelectField
          value={link ? String(link.platform_id) : null}
          onChange={(next) => {
            if (next == null || (link && String(next) === String(link.platform_id))) return;
            void save(store.storeId, Number(next), null);
          }}
          options={platformOptions}
          disabled={!canEdit || busy}
          placeholder="Pick a platform"
          searchPlaceholder="Platform…"
          emptyMessage="No matching platform"
          ariaLabel={`Platform for ${name}`}
        />
        <SearchableSelectField
          value={link ? Number(link.platform_account_id ?? PLATFORM_ONLY) : null}
          onChange={(next) => {
            if (!link || next == null) return;
            const accountId = Number(next) === PLATFORM_ONLY ? null : Number(next);
            if (accountId === (link.platform_account_id ?? null)) return;
            void save(store.storeId, Number(link.platform_id), accountId);
          }}
          options={accountOptions}
          disabled={!canEdit || busy || !link}
          placeholder="Platform only"
          searchPlaceholder="Account…"
          emptyMessage="No matching account"
          ariaLabel={`Account for ${name}`}
        />
      </li>
    );
  };

  return (
    <div className="space-y-3" data-testid="shipstation-store-links">
      <ul className="space-y-1.5">{stores.filter((s) => s.active).map(renderStore)}</ul>
      {retired.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-role-eyebrow uppercase tracking-widest text-text-faint">
            Retired stores ({retired.length})
          </summary>
          <ul className="mt-1.5 space-y-1.5">{retired.map(renderStore)}</ul>
        </details>
      ) : null}
    </div>
  );
}
