'use client';

/**
 * Quick look — Space on a card (focused, or under the pointer) unfolds what
 * the card face does NOT already say (owner 2026-09-27: no duplicates, more
 * detail): the full ship-to address and contact, the exact order and ship-by
 * stamps, carrier + tracking, the listing number, serials, the order total,
 * and who did Pick → QC → Pack and when (per line when the order has
 * several). Buyer, channel, notes, SLA and the lead line's facts live on the
 * face. Enter opens the full record; Space folds this away.
 */

import type { ReactNode } from 'react';
import { CollapseItem } from '@/design-system/components/Collapse';
import { MapPin, Truck } from '@/components/Icons';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import { customerAddressLines, customerPhone } from '@/lib/customers/customer-display';
import { resolveOrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import type { OrderCardModel } from '@/lib/orders/order-card-model';
import type { OrderStage } from '@/lib/orders/order-stages';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-[11px] font-medium text-text-faint">{label}</dt>
      <dd className="text-[13px] text-text-default">{children}</dd>
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

const clean = (value: unknown) => String(value ?? '').trim();

export function OrderCardPeek({ model, todayKey }: { model: OrderCardModel; todayKey: string }) {
  const lead = model.lead;
  const multi = model.lines.length > 1;
  const rows = model.lines.map((line) => line.record);
  const shipTo = lead.shipstation_ship_to;

  // Full address — the card face only names the buyer.
  const address = lead.customer
    ? customerAddressLines(lead.customer)
    : [
        [clean(shipTo?.address1), clean(shipTo?.address2)].filter(Boolean).join(', '),
        [clean(shipTo?.city), clean(shipTo?.state), clean(shipTo?.postalCode)].filter(Boolean).join(' '),
        clean(shipTo?.country),
      ].filter(Boolean);
  const company = clean(shipTo?.company);
  const phone = lead.customer ? customerPhone(lead.customer) : clean(shipTo?.phone);
  const email = clean(lead.customer?.email);

  const placed = resolveOrdersIndexValue(rows, 'orders.order_date', { todayKey });
  const tracking = clean(lead.shipping_tracking_number);
  const carrier = clean(lead.carrier);
  const serials = [...new Set(rows.flatMap((row) => clean(row.serial_number).split(',').map((s) => s.trim())).filter(Boolean))];
  const total = rows.reduce((sum, row) => {
    const amount = Number(row.sale_amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return (
    // A child of the card's AnimatePresence; Collapse moves the card body's gap inside the animated height.
    <CollapseItem data-testid="order-card-peek" className="pt-1">
      <div className="rounded-xl bg-surface-sunken/70 p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 @xl/card:grid-cols-4">
          <Fact label="Ship to" wide>
            <span className="flex gap-1">
              <MapPin className="mt-0.5 size-3 shrink-0 text-text-faint" aria-hidden />
              <span className="min-w-0">
                {company ? <span className="block truncate">{company}</span> : null}
                {address.length > 0 ? address.map((line) => <span key={line} className="block truncate">{line}</span>) : <span className="text-text-faint">No address on file</span>}
              </span>
            </span>
          </Fact>
          <Fact label="Contact" wide>
            {phone || email ? (
              <span className="block truncate">{[phone, email].filter(Boolean).join(' · ')}</span>
            ) : (
              <span className="text-text-faint">None on file</span>
            )}
          </Fact>
          <Fact label="Ordered">{placed?.kind === 'placed' ? placed.face : '—'}</Fact>
          <Fact label="Ship by">{model.sla.tip ?? model.sla.face}</Fact>
          <Fact label="Tracking" wide>
            <span className={cn('inline-flex min-w-0 items-center gap-1', tracking ? 'font-mono text-xs' : 'text-text-faint')}>
              <Truck className="size-3 shrink-0 text-text-faint" aria-hidden />
              <span className="truncate">
                {tracking ? [displayCarrierFromHint(carrier) ?? carrier, tracking].filter(Boolean).join(' · ') : model.pickup ? 'Pickup — no label' : 'No label yet'}
              </span>
            </span>
          </Fact>
          <Fact label="Listing #">{model.listingItem ?? '—'}</Fact>
          {multi ? (
            <Fact label="Order total">
              <span className="tabular-nums">
                {total > 0 ? formatCurrency(total, clean(lead.currency) || 'USD') : '—'} · {model.units} units
              </span>
            </Fact>
          ) : null}
          {serials.length > 0 ? (
            <Fact label={serials.length === 1 ? 'Serial' : 'Serials'} wide>
              <span className="block truncate font-mono text-xs">{serials.join(', ')}</span>
            </Fact>
          ) : null}
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
        <p className="mt-2.5 border-t border-border-hairline pt-2 text-[11px] text-text-faint">
          Enter opens the order · Space closes
        </p>
      </div>
    </CollapseItem>
  );
}
