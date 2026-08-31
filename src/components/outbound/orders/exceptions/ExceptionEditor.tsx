'use client';

/**
 * The exception editor — right pane of the workbench.
 *
 * Layout is {@link TriageScrollLayout}: sticky jump rail + scrolling section
 * cards. Writes compose existing endpoints; this file owns no persistence.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { toast } from '@/lib/toast';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';
import { ExceptionCatalogPairing, type CatalogHit } from './ExceptionCatalogPairing';
import { ExceptionOrderFields } from './ExceptionOrderFields';
import { ExceptionReleaseSection } from './ExceptionReleaseSection';

async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false || data.ok === false) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }
  return data;
}

export function ExceptionEditor({
  row,
  onChanged,
}: {
  row: OrderExceptionRow;
  onChanged: (opts?: { resolved?: boolean }) => void;
}) {
  const fieldId = useId();

  const [itemNumber, setItemNumber] = useState(row.itemNumber ?? '');
  const [sku, setSku] = useState(row.sku ?? '');
  const [title, setTitle] = useState(row.productTitle ?? '');
  const [quantity, setQuantity] = useState(row.quantity ?? '1');
  const [condition, setCondition] = useState(row.condition ?? '');
  const [tracking, setTracking] = useState(row.trackingNumber ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItemNumber(row.itemNumber ?? '');
    setSku(row.sku ?? '');
    setTitle(row.productTitle ?? '');
    setQuantity(row.quantity ?? '1');
    setCondition(row.condition ?? '');
    setTracking(row.trackingNumber ?? '');
    setQuery('');
    setHits([]);
  }, [row.id, row.itemNumber, row.sku, row.productTitle, row.quantity, row.condition, row.trackingNumber]);

  const dirty =
    itemNumber !== (row.itemNumber ?? '')
    || sku !== (row.sku ?? '')
    || title !== (row.productTitle ?? '')
    || quantity !== (row.quantity ?? '1')
    || condition !== (row.condition ?? '')
    || tracking !== (row.trackingNumber ?? '');

  const saveFields = useCallback(async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (itemNumber !== (row.itemNumber ?? '')) patch.itemNumber = itemNumber.trim() || null;
      if (sku !== (row.sku ?? '')) patch.sku = sku.trim() || null;
      if (title !== (row.productTitle ?? '')) patch.productTitle = title.trim();
      if (quantity !== (row.quantity ?? '1')) patch.quantity = quantity.trim() || null;
      if (condition !== (row.condition ?? '')) patch.condition = condition.trim();
      if (Object.keys(patch).length > 0) {
        await postJson(`/api/orders/${row.id}`, patch, 'PATCH');
      }
      if (tracking !== (row.trackingNumber ?? '')) {
        await postJson(`/api/orders/${row.id}/tracking`, {
          trackingNumber: tracking.trim() || null,
        });
      }
      toast.success('Order updated.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [condition, itemNumber, onChanged, quantity, row, sku, title, tracking]);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pairing, setPairing] = useState(false);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/sku-catalog?q=${encodeURIComponent(term.trim())}&limit=15`,
        { credentials: 'same-origin' },
      );
      const data = (await res.json().catch(() => ({}))) as { items?: CatalogHit[] };
      setHits(data.items ?? []);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const pairTo = useCallback(
    async (skuCatalogId: number) => {
      const itemKey = (itemNumber || row.itemNumber || sku || row.sku || '').trim();
      if (!itemKey) {
        toast.error('This order needs an item number or SKU before it can be paired.');
        return;
      }
      setPairing(true);
      try {
        const data = await postJson('/api/sku-catalog/pair', {
          skuCatalogId,
          itemNumber: itemKey,
          platform: (row.accountSource || 'manual').toLowerCase(),
        });
        const backfilled = Number(
          (data as { ordersBackfilled?: number; result?: { ordersBackfilled?: number } })
            .ordersBackfilled
            ?? (data as { result?: { ordersBackfilled?: number } }).result?.ordersBackfilled
            ?? 0,
        );
        toast.success(
          backfilled > 1
            ? `Paired — also cleared ${backfilled - 1} other order${backfilled - 1 === 1 ? '' : 's'}.`
            : 'Paired to catalog.',
        );
        onChanged({ resolved: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not pair.');
      } finally {
        setPairing(false);
      }
    },
    [itemNumber, onChanged, row.accountSource, row.itemNumber, row.sku, sku],
  );

  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/sku-catalog?limit=500', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as {
          items?: Array<{ category?: string | null }>;
        };
        if (cancelled) return;
        const seen = new Set<string>();
        for (const item of data.items ?? []) {
          const c = (item.category ?? '').trim();
          if (c) seen.add(c);
        }
        setCategories([...seen].sort());
      } catch {
        /* free-text fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createAndPair = useCallback(async () => {
    const newSku = (sku || row.sku || '').trim();
    const newTitle = (title || row.productTitle || '').trim();
    if (!newSku || !newTitle) {
      toast.error('A new catalog entry needs both a SKU and a title.');
      return;
    }
    setCreating(true);
    try {
      const created = await postJson('/api/sku-catalog', {
        sku: newSku,
        productTitle: newTitle,
        ...(newCategory.trim() ? { category: newCategory.trim() } : {}),
      });
      const newId = Number(
        (created as { id?: number; entry?: { id?: number } }).id
          ?? (created as { entry?: { id?: number } }).entry?.id,
      );
      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error('Catalog entry created but no id came back.');
      }
      await pairTo(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the catalog entry.');
    } finally {
      setCreating(false);
    }
  }, [newCategory, pairTo, row.productTitle, row.sku, sku, title]);

  const [gateBusy, setGateBusy] = useState(false);

  const runGateAction = useCallback(
    async (body: Record<string, unknown>, successMessage: string, resolved = false) => {
      setGateBusy(true);
      try {
        await postJson(`/api/orders/${row.id}/cage-release`, body);
        toast.success(successMessage);
        onChanged({ resolved });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setGateBusy(false);
      }
    },
    [onChanged, row.id],
  );

  const canRelease = row.gates.canRelease && row.releaseState === 'caged';
  const blockedBy = useMemo(
    () => row.gates.failing.map((g) => g.id).join(', '),
    [row.gates.failing],
  );

  return (
    <TriageScrollLayout
      data-testid="exception-editor"
      header={
        <header className="border-b border-border-hairline px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-mono text-role-body font-semibold text-text-default">
              {row.orderNumber ?? `#${row.id}`}
            </h2>
            <span className="text-role-caption text-text-soft">{row.accountSource || '—'}</span>
            {row.releaseState === 'caged' ? <Badge variant="outline">Caged</Badge> : null}
            {row.blockers.length === 0 ? (
              <Badge variant="success">
                <Check aria-hidden /> No blockers
              </Badge>
            ) : (
              row.blockers.map((b) => (
                <Badge key={b} variant="warning">
                  {ORDER_EXCEPTION_BLOCKER_LABEL[b]}
                </Badge>
              ))
            )}
          </div>
        </header>
      }
      sections={[
        {
          id: 'catalog-pairing',
          label: 'Catalog Pairing',
          children: (
            <ExceptionCatalogPairing
              fieldId={fieldId}
              row={row}
              query={query}
              onQueryChange={setQuery}
              hits={hits}
              searching={searching}
              pairing={pairing}
              onPair={(id) => void pairTo(id)}
              sku={sku}
              title={title}
              newCategory={newCategory}
              onNewCategoryChange={setNewCategory}
              categories={categories}
              creating={creating}
              onCreateAndPair={() => void createAndPair()}
            />
          ),
        },
        {
          id: 'order-details',
          label: 'Order Details',
          children: (
            <ExceptionOrderFields
              fieldId={fieldId}
              itemNumber={itemNumber}
              sku={sku}
              title={title}
              quantity={quantity}
              tracking={tracking}
              condition={condition}
              dirty={dirty}
              saving={saving}
              onItemNumber={setItemNumber}
              onSku={setSku}
              onTitle={setTitle}
              onQuantity={setQuantity}
              onTracking={setTracking}
              onCondition={setCondition}
              onSave={() => void saveFields()}
            />
          ),
        },
        {
          id: 'release',
          label: 'Release',
          children: (
            <ExceptionReleaseSection
              row={row}
              canRelease={canRelease}
              blockedBy={blockedBy}
              gateBusy={gateBusy}
              onDocsExempt={() =>
                void runGateAction(
                  { action: 'docs-not-required', value: true },
                  'Marked as needing no documents.',
                )
              }
              onRelease={() =>
                void runGateAction({ action: 'release' }, 'Released into To-ship.', true)
              }
            />
          ),
        },
      ]}
    />
  );
}
