'use client';

/**
 * One SHIPPED PACKAGE CARD — the package family's adapter over the shared
 * {@link RecordCard}. Same hierarchy as Allocate: status, platform, order
 * number, SLA at the top right, photo, one-line title, qty · condition ·
 * price, next action at the bottom right. Tracking and the dock stamp live
 * in Details.
 */

import { memo, useMemo } from 'react';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { CollapseItem } from '@/design-system/components/Collapse';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { useOrderChannel } from '@/hooks/useCatalog';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import { platformDisplayName } from '@/lib/platform-display';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { platformMetaBrandDot, type SourcePlatformMeta } from '@/lib/source-platform';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { formatDateTimePST } from '@/utils/date';
import { shippedPackageTracking } from './shipped-package-state';
import { shippedCarrierStatus, shippedPackageOrder, shippedPackerName, shippedRecordCard, type ShippedCardModel } from './shipped-card-model';

const VIEW = OUTBOUND_SHIPPED_VIEW;

const stamp = (value: string | null | undefined) => (value ? `${formatDateTimePST(value)} PT` : null);

/** Details: every fact, empty as an em dash, never a hidden row. */
function ShippedCardPeek({ row }: { row: DerivedPackerRecord }) {
  const status = shippedCarrierStatus(row);
  const packer = shippedPackerName(row);
  const shippedBy = (row.shipped_out_by_name || '').trim();
  const { orderId, accountSource } = shippedPackageOrder(row);
  const channel = useOrderChannel()(orderId, accountSource);
  const scanned = stamp(row.ship_confirmed_at);
  const delivered = row.is_delivered || String(row.latest_status_category ?? '').toUpperCase() === 'DELIVERED';
  const shipBy = stamp(row.ship_by_date);
  const late = scanned && shipBy && String(row.ship_confirmed_at) > String(row.ship_by_date) ? 'Late' : shipBy ? 'On time' : null;
  const dash = '—';
  const facts: Array<{ label: string; value: string; channel?: SourcePlatformMeta }> = [
    {
      label: 'Scanned out',
      value: scanned ? [shippedBy || 'Staff not recorded', scanned].join(' · ') : 'Not scanned out',
    },
    {
      label: 'Packed',
      value: packer ? [packer, stamp(row.created_at) || 'Time not recorded'].join(' · ') : 'Never pack-scanned',
    },
    { label: 'Channel', value: platformDisplayName(channel) || dash, channel: channel.meta },
    { label: 'Tracking', value: shippedPackageTracking(row) || dash },
    { label: 'Carrier', value: [displayCarrierFromHint(row.carrier) ?? row.carrier, status.face].filter(Boolean).join(' · ') || dash },
    { label: 'Delivered at', value: delivered ? (stamp(row.delivered_at) || 'Delivered') : 'Not delivered' },
    { label: 'Promised by', value: stamp(row.estimated_delivery_at) || dash },
    { label: 'Ship-by', value: [shipBy, late].filter(Boolean).join(' · ') || dash },
    { label: 'Picked by', value: dash },
    { label: 'Tested by', value: row.tested_by_name ? [row.tested_by_name, stamp(row.test_date_time)].filter(Boolean).join(' · ') : dash },
    { label: 'SKU', value: (row.sku || '').trim() || dash },
    { label: 'Item number', value: (row.item_number || '').trim() || dash },
    { label: 'Serial', value: (row.serial_number || '').trim() || dash },
    { label: 'Condition', value: (row.condition || '').trim() || dash },
    { label: 'Qty', value: row.quantity == null || row.quantity === '' ? dash : String(row.quantity) },
    { label: 'Price', value: row.sale_amount == null || row.sale_amount === '' ? dash : `$${row.sale_amount}` },
    { label: 'Buyer note', value: dash },
    { label: 'Internal note', value: (row.notes || '').trim() || dash },
  ];
  return (
    <CollapseItem>
      <dl data-testid={`${VIEW.testIdPrefix}-peek`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-role-data">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-text-muted">{fact.label}</dt>
            <dd className="min-w-0 font-medium text-text-default">
              {fact.channel ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <PlatformMark meta={fact.channel} />
                  <span className="truncate">{fact.value}</span>
                </span>
              ) : fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </CollapseItem>
  );
}

export const ShippedPackageCard = memo(function ShippedPackageCard({
  model,
  checked,
  open,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
}: TriageCardSlotProps<DerivedPackerRecord, ShippedCardModel>) {
  const row = model.lead;
  const { orderId, accountSource } = shippedPackageOrder(row);
  const resolved = useOrderChannel()(orderId, accountSource);
  const channelName = platformDisplayName(resolved);
  const record = useMemo(() => shippedRecordCard(model), [model]);

  return (
    <RecordCard
      model={record}
      factColumns={VIEW.facts}
      testIdPrefix={VIEW.testIdPrefix}
      rowAttrs={{ 'data-shipment-key': model.key }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(row, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: (
          <span className="inline-flex min-w-0 items-center gap-1.5" data-testid={`${VIEW.testIdPrefix}-identity`}>
            {channelName ? <BrandIdentityDot {...platformMetaBrandDot(resolved.meta)} /> : null}
            {orderId ? (
              <OrderIdChip value={orderId} display={orderId} plain dense truncateDisplay={false} fitDisplayWidth disableTooltip />
            ) : (
              <span className="font-medium text-text-muted">No order</span>
            )}
          </span>
        ),
      }}
      trailing={null}
      quickLook={<ShippedCardPeek key="peek" row={row} />}
    />
  );
});
