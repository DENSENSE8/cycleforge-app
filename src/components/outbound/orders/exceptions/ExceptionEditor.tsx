'use client';

/**
 * The exception editor — right pane of the workbench.
 *
 * {@link TriageScrollLayout} with `knobs`: grouped section cards plus an edge
 * rail that doubles as a position readout. Writes compose existing endpoints;
 * this file owns no persistence.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { toast } from '@/lib/toast';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import {
  ExceptionCatalogPairing,
  ExceptionUnpairedBanner,
} from './ExceptionCatalogPairing';
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
  onExit,
}: {
  row: OrderExceptionRow;
  onChanged: (opts?: { resolved?: boolean }) => void;
  /** Leave this order — the context header's ◁, the ✕, and Escape all land here. */
  onExit: () => void;
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
      notes: '',
      tracking: row.trackingNumber ?? '',
      serialNumbers: [],
      testDateTime: null,
      testedBy: null,
      quantity: Number(row.quantity) || 1,
      sourceType: 'exception',
    }),
    [row],
  );

  // Escape leaves the order — the same key that closes every overlay in the
  // app. Ignored while a menu/combobox is open (they consume it first) and
  // while typing, so it never discards a half-typed field by surprise.
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
  const [quantity, setQuantity] = useState(row.quantity ?? '1');
  const [condition, setCondition] = useState(row.condition ?? '');
  const [tracking, setTracking] = useState(row.trackingNumber ?? '');
  const [saving, setSaving] = useState(false);

  /**
   * Reseed on a DIFFERENT ORDER only — never on a field change.
   *
   * The deps used to include every field, which was harmless while a human
   * pressed Save: by the time the refetch landed nobody was typing. Autosave
   * removes that pause. A save fires mid-sentence, its refetch returns the
   * value as of the request, and this effect would overwrite whatever the
   * operator typed in between with the older server copy — the classic
   * autosave data-loss bug, and it looks exactly like the app eating input.
   *
   * `row.id` is the only dep that means "a different record is on screen".
   */
  useEffect(() => {
    setItemNumber(row.itemNumber ?? '');
    setSku(row.sku ?? '');
    setTitle(row.productTitle ?? '');
    setQuantity(row.quantity ?? '1');
    setCondition(row.condition ?? '');
    setTracking(row.trackingNumber ?? '');
    setQuery('');
    setDebouncedQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- record identity only; see above
  }, [row.id]);

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
      // The confirmation is a TOAST, bottom-right (operator ruling 2026-08-31,
      // reversing the inline readout that replaced the Save button). `Saved`
      // sitting under the last field read as part of the FORM — a label on the
      // tracking input rather than an answer about the write — and the corner
      // it occupied is not where this app confirms anything else. `AppToaster`
      // is already `position="bottom-right"`, so this needed no placement of
      // its own.
      //
      // Only the terminal state moved. `Saving…` / `Unsaved changes` stay
      // inline because they are live state, not events: a toast that says
      // "unsaved" would be a notification the operator cannot act on and that
      // outlives the condition it describes.
      //
      // The stable `id` is what keeps this honest under AUTOSAVE. The write
      // fires 900ms after typing stops, so an operator correcting a title, a
      // quantity and a tracking number in one sitting raises three separate
      // saves — and without an id, sonner stacks three identical "Saved"
      // toasts, which reads as three different things having happened. One id
      // means the corner always shows the LATEST save and its timer restarts:
      // still one confirmation per write, never a pile. This addresses the
      // frequency concern rather than the ruling; the toast stays.
      toast.success('Saved', { id: `exception-saved-${row.id}` });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [condition, itemNumber, onChanged, quantity, row, sku, title, tracking]);

  /**
   * Autosave — 900ms after the operator stops changing anything.
   *
   * Debounced rather than per-keystroke because each save is up to two
   * requests (`PATCH /orders/:id` + `/tracking`) plus the parent's refetch;
   * firing that per character would put the queue in permanent flight. 900ms
   * is long enough to clear a normal typing rhythm and short enough that
   * clicking to another row never outruns it.
   *
   * The timer is cancelled while a save is already in flight, so overlapping
   * writes cannot land out of order — the trailing edit is picked up by the
   * next tick once `saving` clears.
   */
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

  /**
   * The picker reads the LOCAL Zoho inventory mirror, not the Zoho API.
   *
   * `searchField: 'zoho_catalog'` is the house mode for that (`items` ⋈
   * `sku_catalog` on `provider_item_id` — the linkage already stored in the
   * database), and `useSkuCatalogSearch` is the house hook for the call. This
   * used to be a hand-rolled `fetch` at `/api/sku-catalog?q=`, which searched
   * only the hub table: an operator pairing an order could not see the Zoho
   * item they were pairing it TO, and every other picker in the app
   * (labels, Local Pickup, receiving line-edit, the pairing modal) was already
   * on this mode. Same rows, same cache key, no third-party round trip.
   */
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
        // `POST /api/sku-catalog/pair` answers `{ ordersUpdated, manualsUpdated }`
        // — its documented legacy shape. Reading `ordersBackfilled` (the name of
        // the field INSIDE the domain result, which the route renames) always
        // came back 0, so the "also cleared N others" line never once fired.
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

  const [creating, setCreating] = useState(false);

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
      });
      // `{ success, catalog }` is the route's response — neither `id` nor
      // `entry.id`, which is what this read for. Every create therefore threw
      // "created but no id came back" AFTER writing the row, so the operator
      // saw a failure for a catalog entry that now existed.
      const newId = Number((created as { catalog?: { id?: number } }).catalog?.id);
      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error('Catalog entry created but no id came back.');
      }
      await pairTo(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the catalog entry.');
    } finally {
      setCreating(false);
    }
  }, [pairTo, row.productTitle, row.sku, sku, title]);

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
      // Fixed-width pane worked repeatedly, one order after another — the
      // case the rail is for. It also answers "which section am I in" while
      // scrolling, which the grouping alone cannot.
      knobs
      header={
        <div className="border-b border-border-hairline">
          {/*
            The HOUSE entity-context header, not a local one. The
            entity-context SoT is explicit: "Every station that shows inbound
            carton or Shipping / Pack active-order chrome composes this — never
            fork a parallel header", and it names this surface's adapter
            (`Shipping (active order) → ShippingEntityContextHeader`). The
            hand-rolled <header> that used to sit here was exactly that fork:
            a second rendering of one order's identity, free to drift from the
            one every station shows.

            It also supplies the BACK affordance — `onExitToList` is the card's
            identity ◁ — so back is the same control here as at every station.
          */}
          <ShippingEntityContextHeader
            activeOrder={activeOrder}
            onExitToList={onExit}
          />
          {/*
            No badge strip under it (removed 2026-08-31, operator).
            It carried a ✕, a "Caged" badge, and one badge per blocker — and
            every one of those was already answered elsewhere on the same
            screen: ◁ on the identity card is back, EVERY row on this surface is
            caged so the badge distinguished nothing, and the blockers are the
            three section cards below, each with the control that clears it.
            A strip of five chips that names problems and fixes none of them
            costs a permanent band and reads as the surface repeating itself.
          */}
        </div>
      }
      // The unpaired notice states a fact about the ORDER, so it sits above the
      // first card rather than under a "Catalog Pairing" heading that would
      // scope it to one panel.
      banner={<ExceptionUnpairedBanner row={row} />}
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
