'use client';

/**
 * Identifier chip for a {@link TimelineItem} — the shared CopyChip family
 * (last-8 preview + copy-on-click), dispatched by `TimelineRef.kind`.
 *
 * Extracted from {@link EventTimeline} on 2026-08-02 when a second timeline
 * renderer (the support `MergedRecordStream`) needed the same dispatch. Two
 * renderers is a decision with a rationale; two copies of *this* would just be a
 * fork, and the second copy is exactly where a `kind` would go missing.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { TimelineRef } from '@/lib/timeline/types';
import {
  BinChip,
  FnskuChip,
  OrderIdChip,
  SerialChip,
  SkuScanRefChip,
  TicketChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';

export function TimelineRefChip({ refItem }: { refItem: TimelineRef }) {
  const v = String(refItem.value || '').trim();
  if (!v) return null;
  let chip: ReactNode;
  switch (refItem.kind) {
    case 'tracking':
      chip = <TrackingChip value={v} display={getLast8(v)} dense fitDisplayWidth />;
      break;
    case 'serial':
      chip = <SerialChip value={v} display={refItem.display} width="w-fit max-w-full" dense />;
      break;
    case 'fnsku':
      chip = <FnskuChip value={v} width="w-fit max-w-full" />;
      break;
    case 'sku':
      chip = <SkuScanRefChip value={v} display={getLast8(v)} dense />;
      break;
    case 'bin':
      chip = <BinChip value={v} dense />;
      break;
    case 'ticket':
      chip = <TicketChip value={v} display={getLast8(v)} />;
      break;
    case 'id':
    default:
      chip = <OrderIdChip value={v} display={v} dense />;
      break;
  }
  if (refItem.href) {
    return (
      <Link
        href={refItem.href}
        className="inline-flex min-w-0 max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {chip}
      </Link>
    );
  }
  return chip;
}
