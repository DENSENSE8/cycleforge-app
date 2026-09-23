'use client';

/** One mobile exception task: repair identity, then pair it to the catalog. */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, PackageCheck, RefreshCw } from '@/components/Icons';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { SearchableSelectField } from '@/design-system/components';
import { Button, TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import { toast } from '@/lib/toast';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  exceptionPairingResolveCount,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.ok === false || data.success === false) {
    throw new Error(String(data.error || `Request failed (${response.status})`));
  }
  return data;
}

async function fetchException(orderId: number): Promise<OrderExceptionRow> {
  const data = await requestJson(`/api/orders/exceptions?orderId=${orderId}`, { cache: 'no-store' });
  return data.exception as OrderExceptionRow;
}

export function MobileOrderExceptionTask({ orderId }: { orderId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canPair = has('sku_stock.manage');
  const exception = useQuery({
    queryKey: ['order-exceptions', 'mobile-record', orderId],
    queryFn: () => fetchException(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 0,
  });
  const row = exception.data ?? null;

  const [itemNumber, setItemNumber] = useState('');
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [debouncedCatalogQuery, setDebouncedCatalogQuery] = useState('');
  const [working, setWorking] = useState<'pair' | 'create' | null>(null);

  useEffect(() => {
    if (!row) return;
    setItemNumber(row.itemNumber ?? '');
    setSku(row.sku ?? '');
    setTitle(row.productTitle ?? '');
  }, [row]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCatalogQuery(catalogQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [catalogQuery]);

  const catalog = useSkuCatalogSearch(debouncedCatalogQuery, {
    limit: 15,
    searchField: 'zoho_catalog',
  });
  const options = useMemo(
    () =>
      (catalog.data ?? []).map((hit) => ({
        value: String(hit.id),
        label: hit.sku,
        meta: hit.product_title,
      })),
    [catalog.data],
  );

  const saveIdentity = async () => {
    if (!row) throw new Error('Order is not loaded.');
    const nextItemNumber = itemNumber.trim();
    const nextSku = sku.trim();
    const nextTitle = title.trim();
    if (!nextItemNumber && !nextSku) {
      throw new Error('Add an item number or SKU before pairing.');
    }
    const patch: Record<string, string | null> = {};
    if (nextItemNumber !== (row.itemNumber ?? '')) patch.itemNumber = nextItemNumber || null;
    if (nextSku !== (row.sku ?? '')) patch.sku = nextSku || null;
    if (nextTitle !== (row.productTitle ?? '')) patch.productTitle = nextTitle;
    if (Object.keys(patch).length > 0) {
      await requestJson(`/api/orders/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    }
    return nextItemNumber || nextSku;
  };

  const finish = async (resolvedCount: number) => {
    await queryClient.invalidateQueries({ queryKey: ['order-exceptions'] });
    toast.success(
      resolvedCount > 1
        ? `Paired — cleared ${resolvedCount} held orders.`
        : 'Paired to catalog.',
    );
    router.replace('/m/exceptions');
  };

  const pairTo = async (skuCatalogId: number) => {
    if (!row || !canPair || working) return;
    setWorking('pair');
    try {
      const itemKey = await saveIdentity();
      const data = await requestJson('/api/sku-catalog/pair', {
        method: 'POST',
        body: JSON.stringify({
          skuCatalogId,
          itemNumber: itemKey,
          platform: (row.accountSource || 'manual').toLowerCase(),
        }),
      });
      const updated = Math.max(
        exceptionPairingResolveCount(row),
        Number(data.ordersUpdated ?? 0),
      );
      await finish(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not pair this order.');
    } finally {
      setWorking(null);
    }
  };

  const createAndPair = async () => {
    if (!row || !canPair || working) return;
    const nextSku = sku.trim();
    const nextTitle = title.trim();
    if (!nextSku || !nextTitle) {
      toast.error('A new catalog item needs both a SKU and a title.');
      return;
    }
    setWorking('create');
    try {
      const itemKey = await saveIdentity();
      const created = await requestJson('/api/sku-catalog', {
        method: 'POST',
        body: JSON.stringify({ sku: nextSku, productTitle: nextTitle }),
      });
      const catalogId = Number((created.catalog as { id?: number } | undefined)?.id);
      if (!Number.isFinite(catalogId) || catalogId <= 0) {
        throw new Error('Catalog item was created without an id.');
      }
      const paired = await requestJson('/api/sku-catalog/pair', {
        method: 'POST',
        body: JSON.stringify({
          skuCatalogId: catalogId,
          itemNumber: itemKey,
          platform: (row.accountSource || 'manual').toLowerCase(),
        }),
      });
      await finish(Math.max(exceptionPairingResolveCount(row), Number(paired.ordersUpdated ?? 0)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the catalog item.');
    } finally {
      setWorking(null);
    }
  };

  if (exception.isPending) {
    return (
      <div className="flex h-full flex-col bg-surface-card">
        <MobileDetailTopBar title="Loading…" subtitle="Order exception" backHref="/m/exceptions" />
        <p className="px-3 py-6 text-role-caption text-text-muted">Loading held order…</p>
      </div>
    );
  }

  if (exception.isError || !row) {
    return (
      <div className="flex h-full flex-col bg-surface-card">
        <MobileDetailTopBar title="Exception unavailable" subtitle="Order exception" backHref="/m/exceptions" />
        <div className="flex flex-col items-start gap-3 px-3 py-6">
          <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
            <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load this held order.
          </p>
          <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void exception.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const blockerText = row.blockers
    .map((blocker) => ORDER_EXCEPTION_BLOCKER_LABEL[blocker])
    .join(' · ');
  const resolveCount = exceptionPairingResolveCount(row);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-order-exception-task">
      <MobileDetailTopBar
        title={row.productTitle || row.orderNumber || `Order ${row.id}`}
        subtitle="Order exception"
        meta={row.orderNumber || `#${row.id}`}
        backHref="/m/exceptions"
      />
      <main className="min-h-0 flex-1 overflow-y-auto pb-8">
        <section className="border-b border-border-warning bg-surface-warning px-3 py-2 text-role-caption text-text-warning">
          <p className="font-semibold">{blockerText || 'Catalog pairing required'}</p>
          <p className="mt-0.5">
            Pairing resolves {resolveCount} held order{resolveCount === 1 ? '' : 's'}.
          </p>
        </section>

        <section aria-labelledby="exception-identity-heading" className="border-b border-border-hairline">
          <h2 id="exception-identity-heading" className="px-3 py-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
            Order identity
          </h2>
          <div className="border-y border-border-hairline">
            <TextField appearance="flush" label="Item number" value={itemNumber} onChange={setItemNumber} mono />
            <div className="border-t border-border-hairline">
              <TextField appearance="flush" label="SKU" value={sku} onChange={setSku} mono />
            </div>
            <div className="border-t border-border-hairline">
              <TextField appearance="flush" label="Product title" value={title} onChange={setTitle} />
            </div>
          </div>
        </section>

        <section aria-labelledby="exception-pair-heading" className="px-3 py-4">
          <h2 id="exception-pair-heading" className="mb-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
            Catalog pairing
          </h2>
          {!canPair ? (
            <p className="border border-border-danger bg-surface-danger px-3 py-2 text-role-caption text-text-danger">
              Your role can view this exception but cannot change catalog pairing.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <SearchableSelectField
                value={null}
                onChange={(value) => {
                  if (value != null) void pairTo(Number(value));
                }}
                options={options}
                onSearchChange={setCatalogQuery}
                loading={catalog.isFetching && Boolean(debouncedCatalogQuery)}
                disabled={working != null}
                placeholder="Link an existing catalog item…"
                searchPlaceholder="Search inventory by SKU or title…"
                emptyMessage={catalogQuery.trim() ? 'Nothing matches.' : 'Type to search inventory.'}
                ariaLabel="Link an existing catalog item"
                testId="mobile-exception-catalog-search"
                appearance="flush"
                className="h-11"
              />
              <Button
                variant="secondary"
                radius="flush"
                size="lg"
                icon={<PackageCheck />}
                loading={working === 'create'}
                disabled={working != null}
                onClick={() => void createAndPair()}
              >
                Create SKU and pair
              </Button>
              <p className="text-role-caption text-text-muted">
                <Link2 className="mr-1 inline h-3.5 w-3.5" /> Pairing uses the same item-number mapping as the desktop exception desk.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
