'use client';

/**
 * One package on ONE row — the Compact face of the Fulfilled list (Full is
 * {@link ShippedPackageCard}). The card's anatomy, left → right: state ·
 * photo · tracking · the lead line's title (+N more) · packed by + when ·
 * order · condition · price → the carrier's live word (Resolve for an
 * unmatched scan). Everything reads off `shippedRecordCard`, so both faces
 * paint one truth.
 */

import { memo, useMemo } from 'react';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { formatOrderIdDisplay } from '@/lib/copy-chip-format';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import {
  shippedPackageHandle,
  shippedPackageOrder,
  shippedPackerName,
  shippedRecordCard,
  type ShippedCardModel,
} from './shipped-card-model';
import { shippedPackageTracking } from './shipped-package-state';

const VIEW = OUTBOUND_SHIPPED_VIEW;

export const ShippedPackageRow = memo(function ShippedPackageRow(props: TriageCardSlotProps<DerivedPackerRecord, ShippedCardModel>) {
  const { model } = props;
  const face = useMemo<TriageRowFace>(() => {
    const row = model.lead;
    const record = shippedRecordCard(model);
    const lead = record.lines[0]!;
    const more = record.lines.length > 1 ? ` +${record.lines.length - 1}` : '';
    const title = `${lead.title}${more}`;
    const packer = shippedPackerName(row);
    const packedAt = String(row.created_at ?? '').trim();
    const { orderId } = shippedPackageOrder(row);
    return {
      state: record.state,
      identity: shippedPackageHandle(row),
      identityCopy: shippedPackageTracking(row) ? { value: shippedPackageTracking(row), tone: 'tracking' } : undefined,
      identityWidth: 'long',
      title,
      photo: { url: lead.photoUrl },
      facts: [
        packer
          ? {
              id: 'packed',
              value: packedAt ? `${packer} · ${formatMonthDayTimePST(packedAt)}` : packer,
              width: 'long',
              tip: packedAt ? `Packed by ${packer} · ${formatDateTimePST(packedAt)} PT` : `Packed by ${packer}`,
            }
          : { id: 'packed', value: 'Never packed', width: 'long', tone: 'warn' },
        {
          id: 'order',
          value: orderId ? { kind: 'order-id', value: orderId } : null,
          copy: orderId ? { value: orderId, display: formatOrderIdDisplay(orderId), tone: 'id' } : undefined,
          width: 'code',
        },
        { id: 'condition', value: lead.facts.condition ?? null, width: 'short' },
        { id: 'price', value: lead.facts.price ?? null, width: 'short' },
      ],
      next: record.next ? { label: record.next.label, blocked: record.next.blocked } : null,
      nextWidth: 'code',
      aria: { row: record.aria.card, open: record.aria.open, check: record.aria.check },
    };
  }, [model]);
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} rowAttrs={{ 'data-shipment-key': model.key }} />;
});
