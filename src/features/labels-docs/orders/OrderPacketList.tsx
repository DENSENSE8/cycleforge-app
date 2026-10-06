'use client';

/**
 * Labels & docs › Orders — the list: one `TriageRow` per order on the shared
 * triage face (`TriageCardList` `density="row"`): checkbox · Shift-range ·
 * select visible · X · J / K · → / ← (fold the lines), the `TriageSelectBar`
 * and its server pager. Status, Missing slot, Channel, Sort and Find are the
 * sidebar's — this body paints records only. Nothing opens as a record: the
 * open order is reviewed in the dock's pane (`OrdersDesk`).
 */

import { useMemo, type ReactNode } from 'react';
import {
  TriageCardList,
  type TriageCardModelBase,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import type { TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { useOrderChannel } from '@/hooks/useCatalog';
import type { GroupedRenderOrder, RowGroup } from '@/lib/group-rows';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { LABEL_INTAKE_ORDERS_VIEW } from '@/lib/triage/views/label-intake';
import { OrderPacketLines, orderPacketRowFace } from './order-packet-row';

const VIEW = LABEL_INTAKE_ORDERS_VIEW;
type OrderPacketRowModel = TriageCardModelBase<OrderPacket>;

const rowId = (packet: OrderPacket) => packet.orderId;
const groupKey = (group: RowGroup<OrderPacket>) => group.key;
/** The pane always holds an order: Esc / close never empties it. */
const keepOpen = () => undefined;

export interface OrderPacketPage {
  rows: readonly OrderPacket[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
}

export function OrderPacketList({
  data,
  cut,
  query,
  narrowed,
  selection,
  openId,
  onOpen,
  bulk,
  banner,
}: {
  data: OrderPacketPage;
  /** The face's page + held-new cut; Orders has no body status (the sidebar's `?status=` is the server's). */
  cut: TriageCut<never>;
  /** The sidebar Find as read. */
  query: string;
  /** Any sidebar filter or Find narrows the list. */
  narrowed: boolean;
  selection: TriageSelectionPort<OrderPacket>;
  /** The order in the pane — the J/K cursor. */
  openId: number | null;
  onOpen: (packet: OrderPacket) => void;
  /** The checked orders' verbs in the select bar. */
  bulk: ReactNode;
  /** Notices and upload trays above the rows. */
  banner: ReactNode;
}) {
  const channel = useOrderChannel();
  const { url, filterBands } = cut;
  const allBands = useMemo<GroupedRenderOrder<OrderPacket>>(
    () => [['', data.rows.map((packet) => ({ key: `order:${packet.orderId}`, rows: [packet] }))]],
    [data.rows],
  );
  const bands = useMemo(() => filterBands(allBands, groupKey, () => []), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  // The pane always has an order: J / K move it; Esc never empties it (nor the check-set).
  usePublishRecordCursor({
    surfaceId: 'labels-docs-orders',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: rowId,
    onOpen,
    onClose: keepOpen,
  });

  const family = useMemo(
    () =>
      triageFamily<OrderPacket, OrderPacketRowModel>(VIEW, {
        rowId,
        groupKey,
        cardModel: (group) => ({ key: group.key, ids: [rowId(group.rows[0]!)], lead: group.rows[0]! }),
        expandable: true,
        renderCard: (props) => (
          <TriageRow
            key={props.model.key}
            {...props}
            open={props.model.lead.orderId === openId}
            face={orderPacketRowFace(props.model.lead, channel)}
            testIdPrefix={VIEW.testIdPrefix}
            rowAttrs={{ 'data-order-id': props.model.lead.orderId }}
            expansion={<OrderPacketLines packet={props.model.lead} />}
          />
        ),
      }),
    [openId, channel],
  );

  const feed = useMemo<TriageFeed<OrderPacket>>(
    () => ({
      bands,
      allBands,
      painted,
      sectioned: false,
      total: data.total,
      statusOnServer: true,
      loading: data.loading,
      fetching: data.fetching,
      serverPages: { page: data.page, pageCount: data.pageCount, pageSize: data.pageSize, onPage: (page) => url.setPageIndex(page - 1) },
      search: { value: query, pending: data.fetching && query !== '' },
      selection,
      // Nothing opens in the record plane: the open order is the pane's, and the J/K cursor — X checks it.
      open: { id: null, cursorId: openId, open: onOpen, close: keepOpen },
    }),
    [bands, allBands, painted, data.total, data.loading, data.fetching, data.page, data.pageCount, data.pageSize, url, query, selection, openId, onOpen],
  );

  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      density="row"
      record={{
        title: <span className="sr-only">Orders</span>,
        noun: 'order',
        testId: 'order-packet-record',
        summary: null,
        view: null,
        strip: null,
        // The list stands alone at the stage's width; the order pane is the dock's, not a record.
        rail: 'open',
      }}
      summary={null}
      bulk={bulk}
      banner={
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-2 empty:hidden">
          {banner}
          {data.error ? (
            <p aria-live="polite" className="text-role-caption text-text-danger" data-testid="order-packets-error">
              The orders could not be read — {data.error.message}. It retries on its own.
            </p>
          ) : null}
        </div>
      }
      searchEmpty={narrowed ? <p className="text-role-caption text-text-muted">No order matches these filters.</p> : null}
      allClear={<TriageAllClear title="No open orders to print" detail="Every open order with a shipping label, packing slip or product paperwork lands here." />}
    />
  );
}
