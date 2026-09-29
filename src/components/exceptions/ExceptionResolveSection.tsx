'use client';

/**
 * Missing pairs, order side — the held order's pairing JOB: link it to an
 * existing catalog item (pairing its item number clears every sibling order
 * that carries it), and correct the pairing identity (title · item number ·
 * SKU, autosaved).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import { useResolveFbmException, useResolvePairsException } from '@/hooks/exceptions';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { ExceptionCatalogPairing, ExceptionUnpairedBanner } from './ExceptionCatalogPairing';
import { ExceptionOrderFields } from './ExceptionOrderFields';

/** Pause after the last keystroke before the identity fields autosave. */
const AUTOSAVE_MS = 900;

/** `exceptionKey`: the exception this order's pairing clears — it leaves the list the moment Pair is pressed. */
export function ExceptionResolveSection({ row, exceptionKey }: { row: OrderExceptionRow; exceptionKey: string }) {
  const fieldId = useId();
  const [itemNumber, setItemNumber] = useState(row.itemNumber ?? '');
  const [sku, setSku] = useState(row.sku ?? '');
  const [title, setTitle] = useState(row.productTitle ?? '');
  const saveOrder = useResolveFbmException();
  const pair = useResolvePairsException();
  const saving = saveOrder.isPending;

  const dirty =
    itemNumber !== (row.itemNumber ?? '')
    || sku !== (row.sku ?? '')
    || title !== (row.productTitle ?? '');

  // The identity fields autosave through the order PATCH (the same write the lane desk made).
  const { mutate: saveMutate } = saveOrder;
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => {
      const patch: { itemNumber?: string | null; sku?: string | null; productTitle?: string } = {};
      if (itemNumber !== (row.itemNumber ?? '')) patch.itemNumber = itemNumber.trim() || null;
      if (sku !== (row.sku ?? '')) patch.sku = sku.trim() || null;
      if (title !== (row.productTitle ?? '')) patch.productTitle = title.trim();
      saveMutate(
        { action: 'update-order', orderId: row.id, patch },
        {
          onSuccess: () => toast.success('Saved', { id: `exception-saved-${row.id}` }),
          onError: (error) => toast.error(error.message || 'Could not save.'),
        },
      );
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, saving, saveMutate, itemNumber, sku, title, row.id, row.itemNumber, row.sku, row.productTitle]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const catalogSearch = useSkuCatalogSearch(debouncedQuery, {
    limit: 15,
    searchField: 'zoho_catalog',
  });
  const hits = useMemo(() => catalogSearch.data ?? [], [catalogSearch.data]);
  const searching = debouncedQuery.length > 0 && catalogSearch.isFetching;

  const pairTo = (skuCatalogId: number) => {
    const itemKey = (itemNumber || row.itemNumber || sku || row.sku || '').trim();
    if (!itemKey) {
      toast.error('This order needs an item number or SKU before it can be paired.');
      return;
    }
    const siblings = Math.max(0, row.siblingUnpairedCount);
    pair.mutate(
      {
        action: 'pair-order',
        orderId: row.id,
        skuCatalogId,
        itemNumber: itemKey,
        platform: (row.accountSource || 'manual').toLowerCase(),
        clears: exceptionKey,
      },
      {
        onSuccess: () =>
          toast.success(
            siblings > 0 ? `Paired — also cleared ${siblings} other order${siblings === 1 ? '' : 's'}.` : 'Paired to catalog.',
          ),
        onError: (error) => toast.error(error.message || 'Could not pair.'),
      },
    );
  };

  return (
    <div data-testid="exception-resolve" className="flex flex-col gap-3">
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
        pairing={pair.isPending}
        onPair={pairTo}
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
    </div>
  );
}
