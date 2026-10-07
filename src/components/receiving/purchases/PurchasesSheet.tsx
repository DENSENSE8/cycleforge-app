'use client';

/**
 * Receiving › Purchasing (`/purchasing`) — every purchase in a
 * date window as ONE sheet: the same `PastedListSheet` the pasted list paints
 * (status chips left over the header row, click-to-copy, Enter opens the
 * record exactly as its Incoming card does) with Purchasing's own columns
 * (`PURCHASES_COLUMNS`: Ordered · Imported beside the Status), over the
 * purchases query (`usePurchasesList`). Its filters, Sort and Find are the
 * left contextual sidebar's (`NAV_PAGE_DECLS.purchasing`), all in the URL, so
 * a view is a link. A press on a sortable header writes the same Sort params
 * (`colsort` / `coldir`) the sidebar does; the query sorts and finds
 * server-side and the sheet keeps its order. Top right: **Add** — add a
 * purchase order or return, or import orders. A press on an empty Tracking
 * cell opens the attach-tracking dialog for that purchase
 * (`IncomingAttachTrackingPopover` → `POST /api/receiving/po/:ref/attach-box`):
 * the number is linked as a box only — never a scan or an unbox — and its
 * toast carries Undo for a number put on the wrong purchase.
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import {
  PURCHASES_DEFAULT_SORT,
  PURCHASES_DIR_PARAM,
  PURCHASES_SORT_DIR,
  PURCHASES_SORT_PARAM,
  readPurchasesSort,
} from '@/lib/receiving/purchases-params';
import { PastedListSheet } from '@/components/search/pasted-list/PastedListSheet';
import {
  PURCHASES_COLUMN_SET,
  PURCHASES_SORT_BY,
  type PastedListColumnKey,
  type PastedListRow,
} from '@/components/search/pasted-list/pasted-list-table';
import { IncomingAttachTrackingPopover } from '@/components/sidebar/receiving/IncomingAttachTrackingPopover';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { InboundAddSplitAction } from './order-form/InboundAddSplitAction';
import { usePurchasesList } from './usePurchasesList';

const NOUN = { one: 'purchase', many: 'purchases' } as const;
const KEYS_GROUP = { id: 'purchasing', title: 'Purchases' } as const;
/** Its own column layout + zoom, apart from the pasted list's. */
const LAYOUT_KEY = 'cf:sheet-columns:purchasing';
/** The registrar publishes on change — one stable node, never a fresh one per render. */
const ADD_ACTION = <InboundAddSplitAction testId="purchasing-add" />;

/** Each sortable header → the direction its first press asks for (the sort's own default). */
const SORTABLE = Object.fromEntries(
  Object.entries(PURCHASES_SORT_BY).map(([key, sort]) => [key, PURCHASES_SORT_DIR[sort]]),
) as Readonly<Partial<Record<PastedListColumnKey, 'asc' | 'desc'>>>;

export function PurchasesSheet() {
  const list = usePurchasesList();
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const find = searchParams?.get(INBOUND_FIND_PARAM)?.trim() ?? '';
  const search = searchParams?.toString() ?? '';
  const active = useMemo(() => readPurchasesSort(new URLSearchParams(search)), [search]);
  const activeKey = (Object.entries(PURCHASES_SORT_BY).find(([, sort]) => sort === active.sort)?.[0] ?? null) as PastedListColumnKey | null;
  const onSort = useCallback(
    (key: PastedListColumnKey, dir: 'asc' | 'desc') => {
      const sort = PURCHASES_SORT_BY[key];
      if (!sort) return;
      replace((params) => {
        // The default order in its default direction is the bare URL.
        if (sort === PURCHASES_DEFAULT_SORT && dir === PURCHASES_SORT_DIR[sort]) {
          params.delete(PURCHASES_SORT_PARAM);
          params.delete(PURCHASES_DIR_PARAM);
          return;
        }
        params.set(PURCHASES_SORT_PARAM, sort);
        params.set(PURCHASES_DIR_PARAM, dir);
      });
    },
    [replace],
  );
  // The purchase whose empty Tracking cell was pressed — its number is the attach route's `:poId`.
  const [attachTo, setAttachTo] = useState<string | null>(null);
  const attachPreset = useMemo(() => (attachTo ? { poId: attachTo, poNumber: attachTo } : undefined), [attachTo]);
  const onEmptyCell = useCallback((row: PastedListRow, key: PastedListColumnKey) => {
    if (key === 'tracking') setAttachTo(row.view.entry.ref);
  }, []);
  const refetch = list.refetch;
  return (
    <>
      <DeskActionSlotRegistrar role="primary">{ADD_ACTION}</DeskActionSlotRegistrar>
      <PastedListSheet
        list={list}
        // Find is the query's (server-side), so the sheet narrows nothing more.
        query=""
        columnSort={{ sortable: SORTABLE, key: activeKey, dir: active.dir, onSort }}
        noun={NOUN}
        layoutKey={LAYOUT_KEY}
        exportName="purchases"
        ariaLabel="Purchases"
        empty={{
          none: find ? `No purchase in this window matches “${find}”.` : 'No purchase in this window. Widen the dates in the sidebar.',
        }}
        keysGroup={KEYS_GROUP}
        columns={PURCHASES_COLUMN_SET}
        onEmptyCell={onEmptyCell}
      />
      {attachPreset ? (
        // Keyed per purchase: the dialog seeds its PO from `presetPo` on mount.
        <IncomingAttachTrackingPopover
          key={attachPreset.poId}
          presetPo={attachPreset}
          trigger={null}
          open
          onOpenChange={(next) => {
            if (!next) setAttachTo(null);
          }}
          onAttached={refetch}
        />
      ) : null}
    </>
  );
}
