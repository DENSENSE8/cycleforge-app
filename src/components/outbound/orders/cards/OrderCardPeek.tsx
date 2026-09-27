'use client';

/**
 * Quick look — Space on a focused card unfolds the order's facts under it
 * (owner 2026-09-27): who, where, when ordered, tracking and the buyer's note.
 * The lines are already on the card ("+N items"). Enter opens the full record.
 */

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { MapPin, MessageSquare, Truck } from '@/components/Icons';
import { customerPlace } from '@/lib/customers/customer-display';
import { resolveOrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import type { OrderCardModel } from '@/lib/orders/order-card-model';
import { cn } from '@/utils/_cn';

const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-text-faint">{label}</dt>
      <dd className="truncate text-[13px] text-text-default">{children}</dd>
    </div>
  );
}

export function OrderCardPeek({ model, todayKey }: { model: OrderCardModel; todayKey: string }) {
  const lead = model.lead;
  const rows = model.lines.map((line) => line.record);
  const shipTo = lead.shipstation_ship_to;
  const name = model.buyerName;
  const place = lead.customer
    ? customerPlace(lead.customer)
    : [shipTo?.city, shipTo?.state].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  const placed = resolveOrdersIndexValue(rows, 'orders.order_date', { todayKey });
  const tracking = String(lead.shipping_tracking_number ?? '').trim();
  const note = String(lead.buyer_note ?? '').trim() || String(lead.notes ?? '').trim();

  return (
    <motion.div
      key="peek"
      data-testid="order-card-peek"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ height: SPRING, opacity: { duration: 0.16 } }}
      className="overflow-hidden"
    >
      <div className="mt-1 rounded-xl bg-surface-sunken/70 p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @xl/card:grid-cols-4">
          <Fact label="Customer">{name || '—'}</Fact>
          <Fact label="Ship to">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 shrink-0 text-text-faint" aria-hidden />
              {place || '—'}
            </span>
          </Fact>
          <Fact label="Ordered">{placed?.kind === 'placed' ? placed.face : '—'}</Fact>
          <Fact label="Tracking">
            <span className={cn('inline-flex items-center gap-1 font-mono text-xs', !tracking && 'font-sans text-text-faint')}>
              <Truck className="size-3 shrink-0 text-text-faint" aria-hidden />
              {tracking || 'No label yet'}
            </span>
          </Fact>
        </dl>
        {note ? (
          <p className="mt-2.5 flex gap-2 border-t border-border-hairline pt-2.5 text-[13px] text-text-muted">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-3">{note}</span>
          </p>
        ) : null}
        <p className="mt-2.5 border-t border-border-hairline pt-2 text-[11px] text-text-faint">
          Enter opens the order · Space closes
        </p>
      </div>
    </motion.div>
  );
}
