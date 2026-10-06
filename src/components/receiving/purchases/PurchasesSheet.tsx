'use client';

/**
 * Receiving › Purchasing (`/purchasing`) — every purchase in a
 * date window as ONE sheet: the same `PastedListSheet` the pasted list paints
 * (columns, status chips left over the header row, click-to-copy, Enter opens
 * the record exactly as its Incoming card does), over the purchases query
 * (`usePurchasesList`). Its filters, Sort and Find are the left contextual
 * sidebar's (`NAV_PAGE_DECLS.purchasing`), all in the URL, so a
 * view is a link. The query sorts and finds server-side; the sheet keeps its
 * order. Top right: **Add** — add a purchase order or return, or import orders.
 */

import { useSearchParams } from 'next/navigation';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { PastedListSheet } from '@/components/search/pasted-list/PastedListSheet';
import { InboundAddSplitAction } from './order-form/InboundAddSplitAction';
import { usePurchasesList } from './usePurchasesList';

const NOUN = { one: 'purchase', many: 'purchases' } as const;
const KEYS_GROUP = { id: 'purchasing', title: 'Purchases' } as const;
/** Its own column layout + zoom, apart from the pasted list's. */
const LAYOUT_KEY = 'cf:sheet-columns:purchasing';
/** The registrar publishes on change — one stable node, never a fresh one per render. */
const ADD_ACTION = <InboundAddSplitAction testId="purchasing-add" />;

export function PurchasesSheet() {
  const list = usePurchasesList();
  const find = useSearchParams()?.get(INBOUND_FIND_PARAM)?.trim() ?? '';
  return (
    <>
      <DeskActionSlotRegistrar role="primary">{ADD_ACTION}</DeskActionSlotRegistrar>
      <PastedListSheet
        list={list}
        // Find is the query's (server-side), so the sheet narrows nothing more.
        query=""
        noun={NOUN}
        layoutKey={LAYOUT_KEY}
        exportName="purchases"
        ariaLabel="Purchases"
        empty={{
          none: find ? `No purchase in this window matches “${find}”.` : 'No purchase in this window. Widen the dates in the sidebar.',
        }}
        keysGroup={KEYS_GROUP}
      />
    </>
  );
}
