'use client';

/**
 * The order record's sticky summary — once the record's top scrolls away, a
 * compact bar keeps the order number, its one status, the total and the
 * ship-by in view. Place it first inside the record's scroll body: it paints a
 * zero-height sentinel, then the sticky bar (no layout space while hidden).
 * Triage only — the Floor record is short and stays unchanged.
 */

import { useEffect, useRef, useState } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { daysLateOn } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { useOrderPriceBreakdown } from '../order-labels-client';
import { OrderRecordStatus } from '../OrderRecordView';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el;
  }
  return null;
}

export function OrderRecordSummaryBar({
  record,
  records,
  todayKey,
}: {
  record: ShippedOrder;
  records: readonly ShippedOrder[];
  todayKey: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)),
      { root: scrollParent(node), threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const prices = useOrderPriceBreakdown(Number(record.id)).data;
  const total = prices ? (prices.amountPaid ?? prices.orderTotal ?? prices.saleAmount) : null;

  const r = record as QueueRowRecord;
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const orderRef = String(record.order_id ?? '').trim() || String(record.id);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-0" />
      <div
        aria-hidden={!stuck}
        inert={!stuck}
        data-testid="order-record-summary-bar"
        data-stuck={stuck || undefined}
        className="sticky top-0 z-20 h-0 overflow-visible industrial:hidden"
      >
        <div
          className={cn(
            '@container/record-head flex items-center gap-3 border-b border-mode-divide bg-mode-panel px-3 py-1.5 shadow-sm',
            'transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
            stuck ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
          )}
        >
          <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate text-mode-ink')}>{orderRef}</span>
          <OrderRecordStatus record={record} records={records} />
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {total != null ? (
              <span className="text-role-data font-medium tabular-nums text-mode-ink" title="Order total">
                {formatCurrency(total)}
              </span>
            ) : null}
            <span
              title={view.delayTip}
              className={cn(
                RECORD_LABEL_CLASS,
                'tabular-nums',
                view.delay?.overdue ? STATE_TONE_CLASSES.danger.text : view.delay?.dueToday ? 'text-mode-ink' : 'text-mode-muted',
              )}
            >
              {formatShipByFace(view.delay?.dateKey ?? null, view.delay?.overdue ? view.delay.days : 0)}
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
