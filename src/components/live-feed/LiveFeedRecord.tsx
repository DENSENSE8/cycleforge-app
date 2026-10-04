'use client';

/**
 * The open record in the record plane: its lead product on the shared item
 * ruler (`RecordItem`), then why it is here (urgency, reason), its
 * channel, who moved it and when, its carrier and handles, and the door to the
 * record's own page (`item.href`) — on the record ledger's fact rows
 * (`RecordFacts`).
 */

import Link from 'next/link';
import { ExternalLink } from '@/components/Icons';
import { PoChip, TrackingChip } from '@/components/ui/CopyChip';
import type { RecordFact } from '@/design-system/components/record-ledger/record-model';
import { RecordItem, RecordItemValue } from '@/design-system/components/record-ledger/RecordItem';
import { RecordFacts } from '@/design-system/components/record-ledger/RecordView';
import { lineCondition } from '@/lib/orders/order-card-model';
import { getLiveFeedStatus, LIVE_FEED_CHANNEL_LABEL, liveFeedCarrierLabel } from '@/lib/live-feed/statuses';
import type { LiveFeedItem } from '@/lib/live-feed/types';
import { formatDateTimePST } from '@/utils/date';
import { liveFeedProduct } from './live-feed-board-model';

/** The record's urgency, worded. */
const URGENCY_LABEL = { late: 'Late', aging: 'Aging', due_today: 'Due today' } as const;

export function LiveFeedRecord({ item }: { item: LiveFeedItem }) {
  const status = getLiveFeedStatus(item.statusId);
  const line = liveFeedProduct(item);
  const facts: RecordFact[] = [
    { label: 'Status', value: status.label },
    ...(item.urgency ? [{ label: 'State', value: URGENCY_LABEL[item.urgency] }] : []),
    { label: 'Channel', value: LIVE_FEED_CHANNEL_LABEL[item.channel] },
    ...(status.staffLabel ? [{ label: status.staffLabel, value: item.staffName ?? '—' }] : []),
    { label: status.kind === 'open' ? 'Entered' : status.label, value: item.at ? `${formatDateTimePST(item.at)} PT` : '—' },
    ...(item.customer ? [{ label: 'Customer', value: item.customer }] : []),
    ...(status.carrier ? [{ label: 'Carrier', value: liveFeedCarrierLabel(item.carrier) }] : []),
    { label: 'Tracking', value: item.tracking ? <TrackingChip value={item.tracking} display={item.tracking} carrierHint={item.carrier} dense /> : '—' },
    ...(item.poNumber ? [{ label: 'PO', value: <PoChip value={item.poNumber} dense /> }] : []),
    ...(item.ref ? [{ label: 'Reference', value: item.ref }] : []),
    ...(item.reason ? [{ label: 'Why', value: item.reason, wide: true }] : []),
    ...(item.href
      ? [
          {
            label: 'Record',
            value: (
              <Link href={item.href} className="inline-flex items-center gap-1 font-medium text-text-accent hover:underline">
                Open record
                <ExternalLink className="size-3.5" />
              </Link>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-2 py-3" data-testid="live-feed-record-body">
      <div className="px-4">
        <RecordItem
          testId="live-feed-record-item"
          title={line.title}
          photo={{ src: line.photoUrl }}
          sku={null}
          item={{ label: 'Order', value: <RecordItemValue value={item.orderId} historyKind="Order number" /> }}
          left={[{ label: 'Cond', value: lineCondition({ condition: item.line?.condition }).label ?? '—' }]}
          right={[
            { label: 'Qty', value: item.line?.qty ?? '—' },
            { label: 'Price', value: item.line?.price ?? '—' },
          ]}
        />
      </div>
      <RecordFacts facts={facts} />
    </div>
  );
}
