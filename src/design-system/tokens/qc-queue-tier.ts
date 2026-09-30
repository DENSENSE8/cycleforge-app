import type { RecordStateFace } from './industrial-record';
import type { QcQueueTier } from '@/lib/qc/qc-queue-order';

/**
 * The QC queue's urgency tier as the card's top row reads it (`/m/qc`, owner
 * 2026-09-29): the code after the bin, the label in the section heading and
 * the card's spoken name. Tones are `STATE_TONE_CLASSES` names; the order of
 * the tiers lives in `qc-queue-order.ts`, never here.
 */
export const QC_QUEUE_TIER: Readonly<Record<QcQueueTier, RecordStateFace>> = {
  return: { id: 'return', code: 'RET', label: 'Returns', tone: 'danger', icon: 'package-x' },
  repair: { id: 'repair', code: 'RPR', label: 'Repair service', tone: 'fulfillment', icon: 'circle-pause' },
  unfound: { id: 'unfound', code: 'UNF', label: 'Unfound', tone: 'warning', icon: 'package-search' },
  pickup: { id: 'pickup', code: 'LCP', label: 'Local pickup', tone: 'info', icon: 'truck' },
  retest: { id: 'retest', code: 'RETEST', label: 'Test again', tone: 'warning', icon: 'alarm-clock' },
  qc: { id: 'qc', code: 'QC', label: 'Quality control', tone: 'neutral', icon: 'circle-dot' },
};
