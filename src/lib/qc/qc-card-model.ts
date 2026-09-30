/**
 * The QC queue's CARD — one unit waiting for QC → what `RecordCardMobile`
 * paints (`/m/qc`, owner 2026-09-29):
 *
 *   [📍 No bin] RET R-51815                              ● 3D
 *   ┌────┐ Bose SoundDock 10
 *   └────┘ SN 0504259929… · 00097                     → ● Test
 *
 * Top row: the unit's bin — else the carton's dock, where it sits until it
 * gets one — the urgency tier's code, the carton sticker the tech holds, and
 * how long it has waited since unbox. Body: photo, SKU identity title, serial
 * and SKU, and the next step (Test, or Retest after a Test again verdict).
 */

import type { RecordCardMobileModel } from '@/design-system/components/record-card/record-card-types';
import type { RecordFactColumn } from '@/design-system/components/record-card/record-fact';
import { QC_QUEUE_TIER } from '@/design-system/tokens/qc-queue-tier';
import { receivingHandle } from '@/lib/barcode-routing';
import { QC_AGE_ALERT_DAYS, qcQueueAge, type QcQueueUnit } from './qc-queue-order';

/** The body's facts, in order: serial, then SKU. */
export const QC_CARD_FACT_COLUMNS: readonly RecordFactColumn[] = [
  { id: 'serial', tier: 'always' },
  { id: 'sku', tier: 'always' },
];

export interface QcCardModel {
  card: RecordCardMobileModel;
  /** What the location badge reads: the unit's bin, else the carton's dock, else null ("No bin"). */
  location: string | null;
  /** The unit has no bin of its own — its badge is the pair-a-bin door. */
  needsBin: boolean;
}

export function qcCardModel(unit: QcQueueUnit, nowMs: number): QcCardModel {
  const tier = QC_QUEUE_TIER[unit.tier];
  const age = qcQueueAge(unit.unboxedAt, nowMs);
  const title = unit.title || (unit.sku ? `SKU ${unit.sku}` : `Unit ${unit.serialUnitId}`);
  const retest = unit.tier === 'retest';
  const location = unit.bin ?? unit.dockLocation;
  const ref = unit.receivingId != null ? receivingHandle(unit.receivingId) : null;
  return {
    location,
    needsBin: unit.bin == null,
    card: {
      key: String(unit.serialUnitId),
      leadId: unit.serialUnitId,
      channel: null,
      code: tier,
      ref,
      deadline: {
        face: age.face,
        tone: age.alert ? 'late' : unit.unboxedAt ? 'later' : 'none',
        tip: unit.unboxedAt
          ? `Unboxed ${new Date(unit.unboxedAt).toLocaleDateString()}${age.alert ? ` — waiting over ${QC_AGE_ALERT_DAYS} days` : ''}`
          : 'Not unboxed yet',
      },
      lines: [
        {
          id: unit.serialUnitId,
          title,
          photoUrl: unit.photoUrl,
          alert: false,
          alertNote: null,
          facts: {
            serial: unit.serial ? { kind: 'code', text: `SN ${unit.serial}`, title: `Serial ${unit.serial}` } : { kind: 'missing', text: 'No serial' },
            sku: unit.sku ? { kind: 'code', text: unit.sku, title: `SKU ${unit.sku}` } : null,
          },
        },
      ],
      next: {
        label: retest ? 'Retest' : 'Test',
        tone: retest ? 'warning' : 'info',
        tip: retest ? 'Next: test it again' : 'Next: test it',
        blocked: false,
      },
      aria: {
        card: [title, tier.label, unit.priority ? 'priority' : null, location ? `bin ${location}` : 'no bin', ref, `waiting ${age.face}`]
          .filter(Boolean)
          .join(', '),
        open: `Open QC for ${title}`,
      },
    },
  };
}
