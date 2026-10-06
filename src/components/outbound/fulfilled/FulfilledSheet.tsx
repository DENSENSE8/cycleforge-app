'use client';

/**
 * Fulfillment › Fulfilled (`/fulfilled`) — every shipped order in a date
 * window, in one of two body layouts (`?layout=`, `fulfilled-params.ts`):
 * - the BOARD (default): a full-screen desk board in the Live feed's image —
 *   a headline, then one column per bucket under Act now · Watch · Done, each
 *   card its clock (`FulfilledBoard`, `src/features/fulfilled-board`); always
 *   order grain, no status chip;
 * - the SHEET (`layout=sheet`): the same `PastedListSheet` Purchasing and the
 *   pasted list paint (status chips left over the header row, click-to-copy,
 *   Enter / O open, zoom, freeze, resize) with Fulfilled's own columns
 *   (`FULFILLED_COLUMNS`, the Clock beside the Status).
 * Both read the fulfilled query (`useFulfilledList`). Filters, Sort and Find
 * are the left contextual sidebar's (`NAV_PAGE_DECLS.fulfilled`), all in the
 * URL; the body adds only layout toggles — Board · Sheet, then on the sheet
 * the row grain (orders · lines) and which optional columns show.
 *
 * Opening a card or a row is what a triage card opens: the order's package
 * as `?shipment=` in the record plane beside / over the list
 * (`useShipmentRecordSlot`) — a card names its package (`facts.shipmentId`);
 * a row (or a card without one) writes `?openOrderId=`
 * (`recordDetailsHref`, in place on this page), which resolves to the
 * package. The list stays mounted under the record, so its scroll is where it
 * was left; a record opened from another page carries `recordBack` and its
 * close returns there (`DeskRecordPlane`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { PastedListSheet } from '@/components/search/pasted-list/PastedListSheet';
import { PASTED_LIST_BACK_PARAM, PastedListBack, usePastedListBack } from '@/components/search/pasted-list/PastedListBack';
import { FULFILLED_COLUMNS, type PastedListColumnSet } from '@/components/search/pasted-list/pasted-list-table';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import type { FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import {
  FULFILLED_FIND_PARAM,
  FULFILLED_GRAIN_PARAM,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_STATUS_PARAM,
  readFulfilledLayout,
  type FulfilledGrain,
} from '@/lib/outbound/fulfilled-params';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isInternalPath, RECORD_BACK_PARAM, RECORD_DETAILS_PARAM, recordDetailsNavigation } from '@/lib/records/record-details';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { DataTableRowNoun } from '@/lib/tables/data-table-pagination';
import { FulfilledBoard } from '@/features/fulfilled-board/FulfilledBoard';
import { FulfilledColumnsMenu, FulfilledGrainSwitch, FulfilledLayoutSwitch, useShownFulfilledColumns } from './FulfilledSheetTools';
import { useFulfilledList } from './useFulfilledList';
import { useShipmentRecordSlot } from './use-shipment-record-slot';

const NOUN: Readonly<Record<FulfilledGrain, DataTableRowNoun>> = {
  order: { one: 'order', many: 'orders' },
  line: { one: 'line', many: 'lines' },
};
const KEYS_GROUP = { id: 'fulfilled', title: 'Fulfilled' } as const;
/** Its own column layout + zoom, apart from the pasted list's and Purchasing's. */
const LAYOUT_KEY = 'cf:sheet-columns:fulfilled';
const ORDER_PARAM = RECORD_DETAILS_PARAM.order;

/**
 * The desk frame for `/fulfilled`: the board runs full-bleed (`measure="full"`,
 * as the Live feed's page mounts its board); the sheet keeps the fixed
 * measure. The layout is URL state the toggle rewrites in place, so the frame
 * reads it here, on the client.
 */
export function FulfilledDesk() {
  const searchParams = useSearchParams();
  const board = readFulfilledLayout(searchParams ?? new URLSearchParams()) === 'board';
  return (
    <DeskPageLayout bare measure={board ? 'full' : 'fixed'} className={board ? 'h-full min-h-0' : 'h-full'}>
      <FulfilledSheet />
    </DeskPageLayout>
  );
}

function FulfilledSheet() {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const list = useFulfilledList();
  const find = searchParams?.get(FULFILLED_FIND_PARAM)?.trim() ?? '';
  const layout = readFulfilledLayout(searchParams ?? new URLSearchParams());
  const grain: FulfilledGrain = searchParams?.get(FULFILLED_GRAIN_PARAM) === 'line' ? 'line' : 'order';
  const enteredFromElsewhere = Boolean(searchParams?.get(PASTED_LIST_BACK_PARAM));

  // Optional tracks the staffer turned on (per browser, beside the sheet's widths and zoom).
  const [shown, toggleShown] = useShownFulfilledColumns(LAYOUT_KEY);
  const columns = useMemo<PastedListColumnSet>(
    () => ({
      all: FULFILLED_COLUMNS,
      mount: () => FULFILLED_COLUMNS.filter((column) => column.tier !== 'optional' || shown.includes(column.key)),
    }),
    [shown],
  );

  // ── The open package: `?shipment=`; `?openOrderId=` (a row's / a card's open) resolves to it. ──
  const openKey = searchParams?.get(SHIPMENT_RECORD_PARAM)?.trim() || null;
  const shipmentId = openKey && /^\d+$/.test(openKey) ? Number(openKey) : null;
  const openOrderId = searchParams?.get(ORDER_PARAM) ?? null;
  // An order that ships in no package (no tracking on file) still opens — to say so.
  const [packageless, setPackageless] = useState<number | null>(null);
  useEffect(() => {
    if (!openOrderId) return;
    const orderRowId = Number(openOrderId);
    const controller = new AbortController();
    void (async () => {
      const packageId =
        Number.isInteger(orderRowId) && orderRowId > 0
          ? await fetchOrderLinePackageId(orderRowId, controller.signal).catch(() => null)
          : null;
      if (controller.signal.aborted) return;
      setPackageless(packageId == null && orderRowId > 0 ? orderRowId : null);
      replace((params) => {
        params.delete(ORDER_PARAM);
        if (packageId != null) params.set(SHIPMENT_RECORD_PARAM, String(packageId));
      });
    })();
    return () => controller.abort();
    // The open param is read once per value; the package param it writes must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId]);

  const openShipment = useCallback(
    (id: number) => replace((params) => params.set(SHIPMENT_RECORD_PARAM, String(id))),
    [replace],
  );
  const close = useCallback(() => {
    setPackageless(null);
    replace((params) => params.delete(SHIPMENT_RECORD_PARAM));
  }, [replace]);
  const slot = useShipmentRecordSlot(shipmentId, openShipment);
  const open = shipmentId != null || packageless != null;
  // Esc: the open record first (the way its ✕ / ← does — back to where it was opened from, else the sheet),
  // then the page Back when the sheet was entered from another page. Split's Esc is the plane's own.
  const router = useRouter();
  const goBack = usePastedListBack();
  const closeRecord = useCallback(() => {
    const back = searchParams?.get(RECORD_BACK_PARAM) ?? null;
    if (isInternalPath(back)) router.push(back, { scroll: false });
    else close();
  }, [searchParams, router, close]);
  const onEscape = open ? closeRecord : enteredFromElsewhere ? goBack : undefined;

  // ── The board's opens. A card names its package; one without (no tracking on file) opens the way a row does. ──
  const pathname = usePathname();
  const openCard = useCallback(
    (entry: BulkEntry) => {
      const packageId = entry.facts?.shipmentId ?? null;
      if (packageId != null) {
        setPackageless(null);
        replace((params) => {
          params.delete(ORDER_PARAM);
          params.set(SHIPMENT_RECORD_PARAM, String(packageId));
        });
        return;
      }
      if (!entry.recordHref) return;
      const next = recordDetailsNavigation(entry.recordHref, { pathname: pathname ?? '', search: searchParams?.toString() ?? '' });
      if (next.mode === 'replace') router.replace(next.href, { scroll: false });
      else router.push(next.href, { scroll: false });
    },
    [replace, pathname, searchParams, router],
  );
  const showInSheet = useCallback(
    (bucket: FulfilledBucketId) =>
      replace((params) => {
        params.set(FULFILLED_LAYOUT_PARAM, 'sheet');
        params.set(FULFILLED_STATUS_PARAM, bucket);
      }),
    [replace],
  );
  // The sheet binds its own keys (Esc among them); on the board, Esc closes the record in place, else goes Back.
  useEffect(() => {
    if (layout !== 'board' || !onEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      onEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layout, onEscape]);
  const lead = enteredFromElsewhere ? <PastedListBack /> : null;

  return (
    <DeskRecordPlane
      open={open}
      onClose={close}
      title={slot?.title ?? 'Package'}
      actions={slot?.actions}
      recordNoun="package"
      recordKey={shipmentId != null ? String(shipmentId) : packageless != null ? `order-${packageless}` : null}
      splitPane="open"
      testId="fulfilled-record"
      list={
        layout === 'board' ? (
          <FulfilledBoard
            list={list}
            openShipmentId={shipmentId}
            onOpen={openCard}
            onShowInSheet={showInSheet}
            lead={lead}
            tools={<FulfilledLayoutSwitch layout={layout} />}
          />
        ) : (
          <PastedListSheet
            list={list}
            // Find is the query's (server-side), so the sheet narrows nothing more.
            query=""
            noun={NOUN[grain]}
            layoutKey={LAYOUT_KEY}
            exportName="fulfilled"
            ariaLabel="Fulfilled orders"
            empty={{
              none: find
                ? `No fulfilled order in this window matches “${find}”.`
                : 'No order shipped in this window. Widen the dates in the sidebar.',
            }}
            keysGroup={KEYS_GROUP}
            columns={columns}
            lead={lead}
            onEscape={onEscape}
            tools={
              <>
                <FulfilledColumnsMenu shown={shown} onToggle={toggleShown} />
                <FulfilledGrainSwitch grain={grain} />
                <FulfilledLayoutSwitch layout={layout} />
              </>
            }
          />
        )
      }
    >
      {shipmentId != null ? (
        slot?.view ?? null
      ) : packageless != null ? (
        <div className="flex flex-1 flex-col bg-mode-canvas p-4" data-testid="fulfilled-record-packageless">
          <EvidenceNotice tone="warn">
            This order ships in no package on file — no tracking number was captured for it, so there is no package record to open.
          </EvidenceNotice>
        </div>
      ) : null}
    </DeskRecordPlane>
  );
}
