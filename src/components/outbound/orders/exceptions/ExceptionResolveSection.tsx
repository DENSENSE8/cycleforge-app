'use client';

/** Exceptions — the held order's JOB inside its order record: */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { ExceptionCatalogPairing, ExceptionUnpairedBanner } from './ExceptionCatalogPairing';
import { ExceptionOrderFields } from './ExceptionOrderFields';

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

export function ExceptionResolveSection({
  row,
  onChanged,
}: {
  row: OrderExceptionRow;
  /** After a write — refetch the queue. A resolved order leaves it, which closes the record. */
  onChanged: () => void;
}) {
  const fieldId = useId();
  const [itemNumber, setItemNumber] = useState(row.itemNumber ?? '');
  const [sku, setSku] = useState(row.sku ?? '');
  const [title, setTitle] = useState(row.productTitle ?? '');
  const [saving, setSaving] = useState(false);

  const dirty =
    itemNumber !== (row.itemNumber ?? '')
    || sku !== (row.sku ?? '')
    || title !== (row.productTitle ?? '');

  const saveFields = useCallback(async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (itemNumber !== (row.itemNumber ?? '')) patch.itemNumber = itemNumber.trim() || null;
      if (sku !== (row.sku ?? '')) patch.sku = sku.trim() || null;
      if (title !== (row.productTitle ?? '')) patch.productTitle = title.trim();
      if (Object.keys(patch).length > 0) {
        await postJson(`/api/orders/${row.id}`, patch, 'PATCH');
      }
      toast.success('Saved', { id: `exception-saved-${row.id}` });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [itemNumber, onChanged, row, sku, title]);

  useEffect(() => {
    if (!dirty || saving) return;
    const t = setTimeout(() => void saveFields(), 900);
    return () => clearTimeout(t);
  }, [dirty, saving, saveFields]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const catalogSearch = useSkuCatalogSearch(debouncedQuery, {
    limit: 15,
    searchField: 'zoho_catalog',
  });
  const hits = useMemo(() => catalogSearch.data ?? [], [catalogSearch.data]);
  const searching = debouncedQuery.length > 0 && catalogSearch.isFetching;

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
        const backfilled = Number(data.ordersUpdated ?? 0);
        toast.success(
          backfilled > 1
            ? `Paired — also cleared ${backfilled - 1} other order${backfilled - 1 === 1 ? '' : 's'}.`
            : 'Paired to catalog.',
        );
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not pair.');
      } finally {
        setPairing(false);
      }
    },
    [itemNumber, onChanged, row.accountSource, row.itemNumber, row.sku, sku],
  );

  return (
    <section
      aria-label="Resolve"
      data-testid="exception-resolve"
      className="flex flex-col gap-3 border-b border-mode-ink bg-mode-panel p-4"
    >
      <ExceptionUnpairedBanner row={row} />
      <p className="text-role-caption text-mode-muted" data-testid="exception-routing">
        <span className="font-semibold text-mode-ink">{row.routing.category}</span>
        {` · Owner: ${row.routing.owner} · Action: ${row.routing.actionRequired}`}
        {row.responsiblePerson ? ` · Responsible: ${row.responsiblePerson}` : ''}
      </p>
      <h3 className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Catalog pairing</h3>
      <ExceptionCatalogPairing
        fieldId={fieldId}
        row={row}
        query={query}
        onQueryChange={setQuery}
        hits={hits}
        searching={searching}
        pairing={pairing}
        onPair={(id) => void pairTo(id)}
      />
      <h3 className={cn(RECORD_LABEL_CLASS, 'border-t border-mode-edge pt-3 text-mode-muted')}>Order details</h3>
      <ExceptionOrderFields
        fieldId={fieldId}
        itemNumber={itemNumber}
        sku={sku}
        title={title}
        dirty={dirty}
        saving={saving}
        onItemNumber={setItemNumber}
        onSku={setSku}
        onTitle={setTitle}
      />
    </section>
  );
}
