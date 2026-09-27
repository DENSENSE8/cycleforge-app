'use client';

/**
 * Quick look — Space on a focused card unfolds the order's facts under it
 * (owner 2026-09-27): who, where, when ordered, tracking, the buyer's note and
 * the Pick → QC → Pack names + stamps (per line when the order has several).
 * Enter opens the full record.
 */

import type { ReactNode } from 'react';
import { CollapseItem } from '@/design-system/components/Collapse';
import { MapPin, MessageSquare, Truck } from '@/components/Icons';
import { customerPlace } from '@/lib/customers/customer-display';
import { resolveOrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import type { OrderCardModel } from '@/lib/orders/order-card-model';
import type { OrderStage } from '@/lib/orders/order-stages';
import { cn } from '@/utils/_cn';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-text-faint">{label}</dt>
      <dd className="truncate text-[13px] text-text-default">{children}</dd>
    </div>
  );
}

/** A stage's who + full stamp — "Jane · Sep 27, 2:14 PM", or who it waits on. */
function StageFact({ stage }: { stage: OrderStage }) {
  if (stage.inherited) return <span className="tabular-nums">Pre-QC&apos;d{stage.at ? ` · ${stage.at}` : ''}</span>;
  if (stage.done) {
    return (
      <span className="tabular-nums">
        {stage.who ?? 'Unknown'} · {stage.at}
      </span>
    );
  }
  if (stage.blocked) return <span className="text-text-danger">Out of stock{stage.who ? ` · ${stage.who}` : ''}</span>;
  return <span className="text-text-faint">{stage.who ? `Assigned · ${stage.who}` : 'Not yet'}</span>;
}

export function OrderCardPeek({ model, todayKey, platformLabel }: { model: OrderCardModel; todayKey: string; platformLabel: string }) {
  const lead = model.lead;
  const multi = model.lines.length > 1;
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
    // A child of the card's AnimatePresence; Collapse moves the card body's gap inside the animated height.
    <CollapseItem data-testid="order-card-peek" className="pt-1">
      <div className="rounded-xl bg-surface-sunken/70 p-3">
        {/* Everything line 1 and the staff corner drop at narrow widths is here in full. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @xl/card:grid-cols-3">
          <Fact label="Customer">{name || '—'}</Fact>
          <Fact label="Platform">{platformLabel || '—'}</Fact>
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
          {multi ? (
            <Fact label={`${model.pack.label} (order)`}>
              <StageFact stage={model.pack} />
            </Fact>
          ) : (
            model.stages.map((stage) => (
              <Fact key={stage.kind} label={stage.label}>
                <StageFact stage={stage} />
              </Fact>
            ))
          )}
        </dl>
        {multi ? (
          <ul aria-label="Pick and QC per item" className="mt-2.5 flex flex-col gap-1.5 border-t border-border-hairline pt-2.5 text-[13px]">
            {model.lines.map((line) => (
              <li key={line.id} className="grid min-w-0 grid-cols-1 gap-x-4 @xl/card:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="truncate font-medium text-text-default" title={line.title}>
                  ×{line.qty} {line.title}
                </span>
                {[line.stages.pick, line.stages.qc].map((stage) => (
                  <span key={stage.kind} className="min-w-0 truncate">
                    <span className="text-[11px] font-medium text-text-faint">{stage.label} </span>
                    <StageFact stage={stage} />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
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
    </CollapseItem>
  );
}
