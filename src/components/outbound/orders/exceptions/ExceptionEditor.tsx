'use client';

/**
 * The exception editor — pair this order's item number to a Zoho catalog SKU.
 *
 * Form sits under the carton identity header. The left rail is the held-order
 * queue (Unbox-width sash + resolve-count subtitle) — not the pairing fields.
 * No {@link TriageScrollKnobs}: the jump rail stole measure from a short form.
 */

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { toast } from '@/lib/toast';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import {
  ExceptionCatalogPairing,
  ExceptionUnpairedBanner,
} from './ExceptionCatalogPairing';
import { ExceptionOrderFields } from './ExceptionOrderFields';
import { ExceptionsWalkSidebar } from './ExceptionsWalkSidebar';
import { CONTEXT_PANEL_HOST_CLASS } from '@/components/sidebar/context-panel-column';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';

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
  onExit,
  queue,
}: {
  row: OrderExceptionRow;
  onChanged: (opts?: { resolved?: boolean }) => void;
  /** Leave this order — the context header's ◁, the ✕, and Escape all land here. */
  onExit: () => void;
  /** Held-order list — Unbox recents slot in the left rail. */
  queue: ReactNode;
}) {
  const fieldId = useId();

  /**
   * The order as the station chrome models it. Built here rather than widened
   * into `OrderExceptionRow` because `ActiveStationOrder` is the SCAN
   * session's shape — it carries serials, test stamps and FNSKU fields this
   * surface has no opinion about. `sourceType: 'exception'` is already in that
   * union, so the header knows which lane it is rendering for.
   */
  const activeOrder = useMemo<ActiveStationOrder>(
    () => ({
      id: row.id,
      orderId: row.orderNumber ?? '',
      productTitle: row.productTitle ?? '',
      itemNumber: row.itemNumber,
      sku: row.sku ?? '',
      condition: row.condition ?? '',
      notes: row.internalNote ?? '',
      tracking: row.trackingNumber ?? '',
      serialNumbers: [],
      testDateTime: null,
      testedBy: null,
      quantity: Number(row.quantity) || 1,
      sourceType: 'exception',
    }),
    [row],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.blur();
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const [itemNumber, setItemNumber] = useState(row.itemNumber ?? '');
  const [sku, setSku] = useState(row.sku ?? '');
  const [title, setTitle] = useState(row.productTitle ?? '');
  const [saving, setSaving] = useState(false);

  /**
   * Reseed on a DIFFERENT ORDER only — never on a field change.
   * `row.id` is the only dep that means "a different record is on screen".
   */
  useEffect(() => {
    setItemNumber(row.itemNumber ?? '');
    setSku(row.sku ?? '');
    setTitle(row.productTitle ?? '');
    setQuery('');
    setDebouncedQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- record identity only; see above
  }, [row.id]);

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
        const backfilled = Number((data as { ordersUpdated?: number }).ordersUpdated ?? 0);
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


  return (
    <div className={CONTEXT_PANEL_HOST_CLASS} data-testid="exception-editor">
      <ExceptionsWalkSidebar>{queue}</ExceptionsWalkSidebar>
      <TriageScrollLayout
        className="min-h-0 min-w-0 flex-1"
        header={
          <div className="border-b border-border-hairline">
            <ShippingEntityContextHeader
              activeOrder={activeOrder}
              onExitToList={onExit}
            />
          </div>
        }
        banner={
          <div className="flex flex-col gap-2">
            <ExceptionUnpairedBanner row={row} />
            <div className="border border-border-hairline bg-surface-subtle px-3 py-2 text-role-caption text-text-muted">
              <span className="font-semibold text-text">{row.routing.category}</span>
              <span className="mx-1">·</span>
              <span>Owner: {row.routing.owner}</span>
              <span className="mx-1">·</span>
              <span>Action: {row.routing.actionRequired}</span>
              {row.responsiblePerson ? (
                <>
                  <span className="mx-1">·</span>
                  <span>Responsible: {row.responsiblePerson}</span>
                </>
              ) : null}
            </div>
            <BuyerNoteBlock note={row.buyerNote} />
          </div>
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
                dirty={dirty}
                saving={saving}
                onItemNumber={setItemNumber}
                onSku={setSku}
                onTitle={setTitle}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
