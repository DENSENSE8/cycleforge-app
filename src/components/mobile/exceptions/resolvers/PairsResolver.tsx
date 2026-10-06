'use client';

/**
 * Missing pairs — two sources, one kind:
 * - an open order whose SKU is unpaired / has no item number: repair the
 *   order's identity, then pair it to a catalog item (or mint one and pair);
 *   pairing clears every held order carrying the same item number;
 * - a floor-minted `TMP-` placeholder: merge it into the permanent catalog SKU.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ClipboardList, Link2, PackageCheck } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { SearchableSelectField } from '@/design-system/components';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useResolvePairsException } from '@/hooks/exceptions';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { PairsExceptionFacts } from '@/lib/exceptions/facts';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  exceptionPairingResolveCount,
} from '@/lib/orders/order-exception-types';
import { toast } from '@/lib/toast';
import type { PhoneResolverProps } from './resolver-props';

type OrderPairsFacts = Extract<PairsExceptionFacts, { source: 'order' }>;
type PlaceholderPairsFacts = Extract<PairsExceptionFacts, { source: 'placeholder' }>;

const NO_PAIR_PERMISSION = 'Your role can view this exception but cannot change catalog pairing.';

/** Permanent CycleForge catalog SKUs, searched as the operator types (250 ms debounce). */
function usePermanentSkuOptions() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const catalog = useSkuCatalogSearch(debounced, { limit: 15, searchField: 'catalog' });
  const hits = catalog.data;
  const options = useMemo(
    () => (hits ?? []).map((hit) => ({ value: String(hit.id), label: hit.sku, meta: hit.product_title })),
    [hits],
  );
  return { query, setQuery, options, hits, loading: catalog.isFetching && Boolean(debounced) };
}

export function PairsOrderResolver({ facts, onResolved }: PhoneResolverProps<OrderPairsFacts>) {
  const { has } = useAuth();
  const canPair = has('sku_stock.manage');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolve = useResolvePairsException();
  const order = facts.order;
  const orderRef = order.orderNumber || `#${order.id}`;
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
  const catalog = usePermanentSkuOptions();

  const [itemNumber, setItemNumber] = useState(order.itemNumber ?? '');
  const [sku, setSku] = useState(order.sku ?? '');
  const [title, setTitle] = useState(order.productTitle ?? '');
  useEffect(() => {
    setItemNumber(order.itemNumber ?? '');
    setSku(order.sku ?? '');
    setTitle(order.productTitle ?? '');
  }, [order.itemNumber, order.sku, order.productTitle]);

  const resolveCount = exceptionPairingResolveCount(order);
  const blockerText = order.blockers.map((blocker) => ORDER_EXCEPTION_BLOCKER_LABEL[blocker]).join(' · ');
  const platform = (order.accountSource || 'manual').toLowerCase();

  /** The identity edits to write first, and the pairing key they leave. */
  const identity = () => {
    const nextItemNumber = itemNumber.trim();
    const nextSku = sku.trim();
    const nextTitle = title.trim();
    const fields: { itemNumber?: string | null; sku?: string | null; productTitle?: string } = {};
    if (nextItemNumber !== (order.itemNumber ?? '')) fields.itemNumber = nextItemNumber || null;
    if (nextSku !== (order.sku ?? '')) fields.sku = nextSku || null;
    if (nextTitle !== (order.productTitle ?? '')) fields.productTitle = nextTitle;
    return { key: nextItemNumber || nextSku, fields: Object.keys(fields).length > 0 ? fields : undefined };
  };

  const done = () =>
    onResolved(resolveCount > 1 ? `Paired — cleared ${resolveCount} held orders.` : `${orderRef} paired to catalog.`);

  const pairTo = (skuCatalogId: number) => {
    const { key, fields } = identity();
    if (!key) {
      toast.error('Add an item number or SKU before pairing.');
      return;
    }
    resolve.mutate(
      { action: 'pair-order', orderId: order.id, skuCatalogId, itemNumber: key, platform, fields },
      { onSuccess: done, onError: (error) => toast.error(error.message || 'Could not pair this order.') },
    );
  };

  const createAndPair = () => {
    const { key, fields } = identity();
    const nextSku = sku.trim();
    const nextTitle = title.trim();
    if (!nextSku || !nextTitle) {
      toast.error('A new catalog item needs both a SKU and a title.');
      return;
    }
    if (!key) {
      toast.error('Add an item number or SKU before pairing.');
      return;
    }
    return resolve.mutateAsync(
      { action: 'create-and-pair-order', orderId: order.id, sku: nextSku, productTitle: nextTitle, itemNumber: key, platform, fields },
    ).then(done, (error: Error) => toast.error(error.message || 'Could not create the catalog item.'));
  };

  return (
    <>
      <section className="bg-surface-warning px-mode-page py-2 text-role-caption text-text-warning">
        <p className="font-semibold">{blockerText || 'Catalog pairing required'}</p>
        <p className="mt-0.5">
          Pairing resolves {resolveCount} held order{resolveCount === 1 ? '' : 's'}.
        </p>
      </section>
      <nav aria-label="Order record">
        <DetailNavRow
          href={withJobReturn(`/m/orders/${order.id}?by=id`, here)}
          title="Order"
          meta={`${orderRef} · customer, label, units, activity`}
          icon={<ClipboardList />}
        />
      </nav>
      <section aria-labelledby="pairs-identity-heading">
        <DetailSectionHeading id="pairs-identity-heading">Order identity</DetailSectionHeading>
        <div className="divide-y divide-mode-rule">
          <TextField appearance="flush" label="Item number" value={itemNumber} onChange={setItemNumber} mono />
          <TextField appearance="flush" label="SKU" value={sku} onChange={setSku} mono />
          <TextField appearance="flush" label="Product title" value={title} onChange={setTitle} />
        </div>
      </section>
      <section aria-labelledby="pairs-catalog-heading">
        <DetailSectionHeading id="pairs-catalog-heading">Catalog pairing</DetailSectionHeading>
        {canPair ? (
          <SearchableSelectField
            value={null}
            onChange={(value) => {
              if (value != null) pairTo(Number(value));
            }}
            options={catalog.options}
            onSearchChange={catalog.setQuery}
            loading={catalog.loading}
            disabled={resolve.isPending}
            placeholder="Link an existing catalog item…"
            searchPlaceholder="Search inventory by SKU or title…"
            emptyMessage={catalog.query.trim() ? 'Nothing matches.' : 'Type to search inventory.'}
            ariaLabel="Link an existing catalog item"
            testId="mobile-exception-catalog-search"
            appearance="flush"
            className="h-11"
          />
        ) : (
          <p className="bg-surface-danger px-mode-page py-2 text-role-caption text-text-danger">{NO_PAIR_PERMISSION}</p>
        )}
        <p className="px-mode-page py-2 text-role-caption text-text-muted">
          <Link2 className="mr-1 inline h-3.5 w-3.5" /> Picking an item pairs it now; the same item-number mapping the desk uses.
        </p>
      </section>
      <DetailDock
        label="Missing pair actions"
        verbs={[
          {
            id: 'create',
            label: 'Create SKU and pair',
            icon: <PackageCheck />,
            primary: true,
            disabled: !canPair,
            loading: resolve.isPending && resolve.variables?.action === 'create-and-pair-order',
          },
        ]}
        onVerb={() => createAndPair()}
      />
    </>
  );
}

export function PairsPlaceholderResolver({ facts, onResolved }: PhoneResolverProps<PlaceholderPairsFacts>) {
  const { has } = useAuth();
  const canPair = has('sku_stock.manage');
  const resolve = useResolvePairsException();
  const placeholder = facts.placeholder;
  const catalog = usePermanentSkuOptions();
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = catalog.hits?.find((hit) => String(hit.id) === targetId) ?? null;
  const [picked, setPicked] = useState<{ sku: string; title: string | null } | null>(null);
  useEffect(() => {
    if (target) setPicked({ sku: target.sku, title: target.product_title });
  }, [target]);

  const merge = () => {
    if (!picked) {
      toast.error('Pick the permanent SKU this placeholder belongs to.');
      return;
    }
    return resolve
      .mutateAsync({ action: 'merge-placeholder', provisionalSku: placeholder.sku, targetSku: picked.sku })
      .then(
        () => onResolved(`${placeholder.sku} merged into ${picked.sku}.`),
        (error: Error) => toast.error(error.message || 'Could not merge the placeholder.'),
      );
  };

  return (
    <>
      <DetailFacts label="Placeholder">
        <DetailFact label="Placeholder" value={placeholder.sku} mono copy={placeholder.sku} />
        <DetailFact label="Title" value={placeholder.productTitle} />
        <DetailFact label="Description" value={placeholder.description} />
        <DetailFact label="Barcode" value={placeholder.barcode} mono copy={placeholder.barcode} />
        <DetailFact label="On hand" value={String(placeholder.stock)} />
        <DetailFact
          label="Locations"
          value={placeholder.locations.map((loc) => `${loc.barcode} ×${loc.qty}`).join(' · ') || null}
          mono
        />
        <DetailFact label="Minted by" value={placeholder.createdByName} />
      </DetailFacts>
      {placeholder.photos.length > 0 ? (
        <section aria-label="Photos" className="flex gap-px overflow-x-auto bg-mode-rule">
          {placeholder.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element -- signed photo URLs, fixed phone cube
            <img key={photo.id} src={photo.thumbUrl} alt="" className="h-24 w-24 shrink-0 bg-mode-panel object-cover" />
          ))}
        </section>
      ) : null}
      <section aria-labelledby="pairs-merge-heading">
        <DetailSectionHeading id="pairs-merge-heading">Pair to SKU</DetailSectionHeading>
        {canPair ? (
          <SearchableSelectField
            value={targetId}
            onChange={(value) => setTargetId(value == null ? null : String(value))}
            options={catalog.options}
            onSearchChange={catalog.setQuery}
            loading={catalog.loading}
            disabled={resolve.isPending}
            placeholder="Pick the permanent SKU…"
            searchPlaceholder="Search permanent SKU or title…"
            emptyMessage={catalog.query.trim() ? 'Nothing matches.' : 'Type to search permanent SKUs.'}
            ariaLabel="Pick the permanent SKU"
            testId="mobile-exception-merge-search"
            appearance="flush"
            className="h-11"
            paste={{ label: 'Paste a SKU or item ID', onPaste: catalog.setQuery }}
          />
        ) : (
          <p className="bg-surface-danger px-mode-page py-2 text-role-caption text-text-danger">{NO_PAIR_PERMISSION}</p>
        )}
        <p className="px-mode-page py-2 text-role-caption text-text-muted">
          {picked
            ? `Merging moves ${placeholder.sku}'s stock, photos and locations onto ${picked.sku}${picked.title ? ` — ${picked.title}` : ''}.`
            : 'Merging moves the placeholder’s stock, photos and locations onto the real SKU.'}
        </p>
      </section>
      <DetailDock
        label="Placeholder actions"
        verbs={[
          {
            id: 'merge',
            label: picked ? `Pair to ${picked.sku}` : 'Pair to SKU',
            icon: <Link2 />,
            primary: true,
            disabled: !canPair || !picked,
            loading: resolve.isPending,
          },
        ]}
        onVerb={() => merge()}
      />
    </>
  );
}
