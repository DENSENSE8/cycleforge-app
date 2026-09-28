import type { RecordStateFace } from './industrial-record';
import type { QcLabelStage } from '@/lib/labels/qc-label-row';

/**
 * Inventory › QC labels — where a labelled unit is in the outbound loop
 * (owner 2026-09-28): on the shelf → held for an order → picked (its serial now
 * on the order) → shipped. Held = not sellable (in test / repair / scrapped).
 */
export const QC_LABEL_LIFECYCLE: Readonly<Record<QcLabelStage, RecordStateFace>> = {
  stock: { id: 'stock', code: 'STK', label: 'In stock', tone: 'info', icon: 'circle-dot' },
  allocated: { id: 'allocated', code: 'ORD', label: 'On an order', tone: 'warning', icon: 'alarm-clock' },
  picked: { id: 'picked', code: 'PKD', label: 'Picked', tone: 'fulfillment', icon: 'package' },
  shipped: { id: 'shipped', code: 'SHP', label: 'Shipped', tone: 'success', icon: 'truck' },
  held: { id: 'held', code: 'HLD', label: 'Held', tone: 'danger', icon: 'circle-pause' },
};
