'use client';

/**
 * Fulfillment › Fulfilled (`/fulfilled`) — every shipped order in a date
 * window, in one of two faces (`fulfilled-params.ts`):
 * - the BOARD (default): a full-screen desk board in the Live feed's image —
 *   a headline, then one column per bucket under Act now · Watch · Done,
 *   one card per order with its clock (`FulfilledBoard`,
 *   `src/features/fulfilled-board`);
 * - the RECORDS SHEET (`layout=sheet`, or one bucket: `?col=`): exactly the
 *   sheet `/records` paints (`RecordsSheetBody`, operator 2026-10-07) — the
 *   same columns and cells, Internal | External, the selection dock and keys
 *   — over the shipped orders' lines, each carrying its order's journey
 *   (Journey, Clock, …). A board column zoomed into (`?col=`, a header press
 *   or a sidebar view) is that sheet narrowed to the bucket; the crumb or Esc
 *   returns to the board where its strip was scrolled.
 * Both read one answer (`useFulfilledList`), so a column's count and its
 * zoomed rows never disagree. Filters, Sort, the grain and Find are the left
 * sidebar's (`NAV_PAGE_DECLS.fulfilled`), all in the URL.
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { RecordsSheetBody, type RecordsSheetSource } from '@/components/records/RecordsSheet';
import { PASTED_LIST_BACK_PARAM, PastedListBack, usePastedListBack } from '@/components/search/pasted-list/PastedListBack';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button } from '@/design-system/primitives/Button';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { FULFILLED_BUCKETS, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import {
  FULFILLED_COLUMN_PARAM,
  FULFILLED_DEFAULT_GRAIN,
  FULFILLED_DEFAULT_SORT,
  FULFILLED_FIND_PARAM,
  FULFILLED_ZOOM_SORT,
  readFulfilledLayout,
} from '@/lib/outbound/fulfilled-params';
import { readFulfilledColumn } from '@/lib/outbound/fulfilled-url';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isInternalPath, RECORD_BACK_PARAM, RECORD_DETAILS_PARAM, recordDetailsNavigation } from '@/lib/records/record-details';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import { FULFILLED_BUCKET_HINT } from '@/features/fulfilled-board/fulfilled-board-model';
import { FulfilledBoard } from '@/features/fulfilled-board/FulfilledBoard';
import { FulfilledLayoutSwitch } from './FulfilledSheetTools';
import { useFulfilledList } from './useFulfilledList';
import { useShipmentRecordSlot } from './use-shipment-record-slot';

const KEYS_GROUP = { id: 'fulfilled', title: 'Fulfilled' } as const;
/** Its own column layout + zoom, apart from `/records`' (the same columns; the staffer's widths are per page). */
const LAYOUT_KEY = 'cf:sheet-columns:fulfilled';
const ORDER_PARAM = RECORD_DETAILS_PARAM.order;

/**
 * The desk frame for `/fulfilled`: the board runs full-bleed (`measure="full"`,
 * as the Live feed's page mounts its board); the sheet keeps `/records`'
 * frame. The face is URL state, so the frame reads it here, on the client.
 */
export function FulfilledDesk() {
  const searchParams = useSearchParams();
  const url = searchParams ?? new URLSearchParams();
  const board = readFulfilledLayout(url) === 'board' && readFulfilledColumn(url) === null;
  return (
    <DeskPageLayout bare measure={board ? 'full' : undefined} className={board ? 'h-full min-h-0' : 'h-full'}>
      <FulfilledSheet />
    </DeskPageLayout>
  );
}

function FulfilledSheet() {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const list = useFulfilledList();
  const url = searchParams ?? new URLSearchParams();
  const find = searchParams?.get(FULFILLED_FIND_PARAM)?.trim() ?? '';
  const layout = readFulfilledLayout(url);
  const column = readFulfilledColumn(url);
  const board = layout === 'board' && column === null;
  const enteredFromElsewhere = Boolean(searchParams?.get(PASTED_LIST_BACK_PARAM));

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
  // The desk's own line for the open package — its status word, clock and customer head the record.
  const openEntry = useMemo(
    () => (shipmentId == null ? null : (list.entries.find((entry) => entry.facts?.shipmentId === shipmentId) ?? null)),
    [list.entries, shipmentId],
  );
  const slot = useShipmentRecordSlot(shipmentId, openShipment, openEntry);
  const open = shipmentId != null || packageless != null;
  const router = useRouter();
  const pathname = usePathname();
  const goBack = usePastedListBack();
  const closeRecord = useCallback(() => {
    const back = searchParams?.get(RECORD_BACK_PARAM) ?? null;
    if (isInternalPath(back)) router.push(back, { scroll: false });
    else close();
  }, [searchParams, router, close]);

  // ── The zoom: one bucket as the Records sheet over the board, `?col=`. ──
  // Where the board's strip was scrolled, so coming back from a column lands where it left.
  const boardScroll = useRef(0);
  const zoomTo = useCallback(
    (bucket: FulfilledBucketId | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (bucket) params.set(FULFILLED_COLUMN_PARAM, bucket);
      else params.delete(FULFILLED_COLUMN_PARAM);
      const search = params.toString();
      // A push, so the browser's Back walks out of the column too.
      router.push(`${pathname ?? ''}${search ? `?${search}` : ''}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );
  const leaveZoom = useCallback(() => zoomTo(null), [zoomTo]);
  // Esc: the open record first, then out of the bucket, then the page Back.
  const onEscape = open ? closeRecord : column ? leaveZoom : enteredFromElsewhere ? goBack : undefined;

  // ── The board's opens. A card names its package; one without (no tracking on file) opens the way a row does. ──
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
  // The sheet binds its own keys (Esc among them); on the board, Esc closes the record in place, else goes Back.
  useEffect(() => {
    if (!board || !onEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      onEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [board, onEscape]);

  // The sheet's lines: the window's, or the zoomed bucket's (every line of its orders).
  const source = useMemo<RecordsSheetSource>(
    () => (column ? { ...list, entries: list.entries.filter((entry) => entry.buckets[0] === column) } : list),
    [list, column],
  );
  const bucket = column ? FULFILLED_BUCKETS.find((one) => one.id === column) : null;
  const orders = column ? (list.buckets.find((one) => one.id === column)?.count ?? 0) : null;
  const backLead = enteredFromElsewhere ? <PastedListBack /> : null;

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
        board ? (
          <FulfilledBoard
            list={list}
            openShipmentId={shipmentId}
            onOpen={openCard}
            onExpand={zoomTo}
            scrollMemory={boardScroll}
            lead={backLead}
            tools={<FulfilledLayoutSwitch layout="board" />}
          />
        ) : (
          <RecordsSheetBody
            list={source}
            defaultGrain={FULFILLED_DEFAULT_GRAIN}
            defaultSort={column ? FULFILLED_ZOOM_SORT : FULFILLED_DEFAULT_SORT}
            layoutKey={LAYOUT_KEY}
            exportName={bucket ? `fulfilled-${bucket.id}` : 'fulfilled'}
            ariaLabel={bucket ? `Fulfilled · ${bucket.label}` : 'Fulfilled orders'}
            keysGroup={KEYS_GROUP}
            empty={
              bucket
                ? `No order is ${bucket.label.toLowerCase()} in this window.`
                : find
                  ? `No fulfilled order in this window matches “${find}”.`
                  : 'No order shipped in this window. Widen the dates in the sidebar.'
            }
            lead={
              bucket ? (
                <nav aria-label="Breadcrumb" data-testid="fulfilled-column-crumb" className="flex min-w-0 items-center gap-1 whitespace-nowrap text-sm">
                  {backLead}
                  <Button type="button" variant="ghost" size="sm" onClick={leaveZoom} data-testid="fulfilled-column-back">
                    Fulfilled
                  </Button>
                  <span aria-hidden className="text-text-faint">
                    ›
                  </span>
                  <HoverTooltip label={FULFILLED_BUCKET_HINT[bucket.id]} openDelayMs={400}>
                    <span aria-current="page" data-testid="fulfilled-column-title" className="font-semibold text-text-default">
                      {bucket.label}
                    </span>
                  </HoverTooltip>
                  <span className="tabular-nums text-text-muted">({orders})</span>
                </nav>
              ) : (
                backLead
              )
            }
            tools={<FulfilledLayoutSwitch layout="sheet" />}
            onEscape={onEscape}
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
