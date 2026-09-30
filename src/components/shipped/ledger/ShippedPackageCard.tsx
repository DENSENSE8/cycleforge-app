'use client';

/**
 * One SHIPPED PACKAGE CARD — the package family's adapter over the shared
 * {@link RecordCard} (the Allocate desk's card, owner 2026-09-29): the order
 * number wears the Allocate card's chip, the channel resolves as it does
 * there, the carrier status and the tracking number sit before the shipped
 * stamp, and Space unfolds the package's evidence (tracking · carrier ·
 * scan-out · pack · test).
 */

import { memo, useMemo } from 'react';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { CollapseItem } from '@/design-system/components/Collapse';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { useOrderChannel } from '@/hooks/useCatalog';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import { platformDisplayName } from '@/lib/platform-display';
import { isFbaPackerRecord, type DerivedPackerRecord } from '@/lib/shipped-records';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { formatDateTimePST } from '@/utils/date';
import { shippedPackageTracking } from './shipped-package-state';
import { shippedCarrierStatus, shippedPackageHandle, shippedPackageOrder, shippedPackerName, shippedRecordCard, type ShippedCardModel } from './shipped-card-model';

const VIEW = OUTBOUND_SHIPPED_VIEW;

const stamp = (value: string | null | undefined) => (value ? `${formatDateTimePST(value)} PT` : null);

/** Details (Space / the Details toggle): everything the header leaves out. */
function ShippedCardPeek({ row }: { row: DerivedPackerRecord }) {
  const status = shippedCarrierStatus(row);
  const packer = shippedPackerName(row);
  const shippedBy = (row.shipped_out_by_name || '').trim();
  const { orderId, accountSource } = shippedPackageOrder(row);
  const channel = platformDisplayName(useOrderChannel()(orderId, accountSource));
  const facts: [string, string | null][] = [
    ['Channel', [channel, isFbaPackerRecord(row) ? 'FBA' : null].filter(Boolean).join(' · ') || null],
    ['Carrier', [displayCarrierFromHint(row.carrier) ?? row.carrier, status.tip].filter(Boolean).join(' · ') || null],
    ['Scanned out', [stamp(row.ship_confirmed_at), shippedBy ? `by ${shippedBy}` : null].filter(Boolean).join(' ') || null],
    ['Packed', packer ? `${packer} · ${stamp(row.created_at)}` : 'Never pack-scanned'],
    ['Tested', row.tested_by_name ? [row.tested_by_name, stamp(row.test_date_time)].filter(Boolean).join(' · ') : null],
    ['Serial', (row.serial_number || '').trim() || null],
    ['SKU', (row.sku || '').trim() || null],
    ['Note', (row.notes || '').trim() || null],
  ];
  return (
    <CollapseItem>
      <dl data-testid={`${VIEW.testIdPrefix}-peek`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-role-data">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="min-w-0 font-medium text-text-default">{value}</dd>
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
  const { orderId } = shippedPackageOrder(row);
  const record = useMemo(() => shippedRecordCard(model), [model]);
  const tracking = shippedPackageTracking(row);

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
      // The header is the order number and its tracking number — nothing else
      // (owner 2026-09-29); channel, carrier, packer and notes live in Details.
      identity={{
        role: 'identity',
        content: (
          <span className="flex min-w-0 items-center gap-2" data-testid={`${VIEW.testIdPrefix}-identity`}>
            {orderId ? <OrderIdChip value={orderId} display={orderId} plain dense truncateDisplay={false} fitDisplayWidth disableTooltip /> : null}
            {orderId ? <span aria-hidden className="text-text-faint">·</span> : null}
            <TrackingChip value={shippedPackageHandle(row)} display={shippedPackageHandle(row)} carrierHint={row.carrier ?? null} disableCopy={!tracking} dense />
          </span>
        ),
      }}
      trailing={null}
      quickLook={<ShippedCardPeek key="peek" row={row} />}
    />
  );
});
