'use client';

/**
 * `/m/orders?display=ledger` — the industrial record at phone width (HANDOFF
 * Step 3). Same state codes, faces and ship-by face as the desk ledger, in the
 * F-pattern the owner set on 2026-09-24 (Context → Identity → Execution) with
 * one right column down all three bands (date · QTY · next):
 *
 *   spine │ CODE · PLATFORM · order # ··············│ SEP 11 · 13d
 *         │ ▣ title ································│ QTY [n]
 *         │ CONDITION · BIN <location> · SKU ········│ → next
 *
 * ▣ is a rigid 32px micro-thumbnail — enough colour and shape to confirm the
 * box in the bin without spending the row's width. Tapping it (or the record)
 * opens the evidence sheet: the high-resolution image, the specs, price and
 * the exception controls. Price is not on the row (noise on the floor).
 */

import { memo } from 'react';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_NOTE_SPINE_CLASS,
  RECORD_QTY_BADGE_CLASS,
  RECORD_TITLE_CLASS,
  recordStateCodeClass,
} from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { mobileRecordFacts, type MobileRecordRow } from '@/lib/work-orders/mobile-record-facts';
import { useOrderChannel } from '@/hooks/useCatalog';
import { cn } from '@/utils/_cn';
import { RecordNoteSlot } from '@/design-system/components/RecordNoteSlot';

/** One touch band (36px) — three per record, 1px rule between. */
const BAND = 'flex min-h-9 min-w-0 items-center';
/** The right lane: one column down all three bands, hairline on the same pixel. */
const LANE = 'flex h-full w-28 shrink-0 items-center border-l border-mode-edge px-2';

export const MobileOrderRecord = memo(function MobileOrderRecord({
  row,
  blocked,
  todayKey,
  onOpen,
}: {
  row: MobileRecordRow;
  blocked: boolean;
  todayKey: string;
  onOpen: (row: MobileRecordRow) => void;
}) {
  const facts = mobileRecordFacts(row, { blocked, todayKey });
  const spec = LIFECYCLE[facts.state];
  const location = formatOutboundStoragePath(row.storageLocations);
  const condition = conditionGradeTableLabel(row.condition);
  // The org's dense face (`AMZRN`), same resolver as the desk band and the 2x1 label.
  const channel = useOrderChannel()(row.orderId, row.accountSource);
  const platform = channel.shortLabel || null;

  return (
    <div
      data-testid="mobile-order-record"
      data-state={facts.state}
      className={cn(
        'relative flex border-b border-mode-ink bg-mode-panel',
        facts.state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
      )}
    >
      {/* Whole record opens the evidence sheet. */}
      <button
        type="button"
        aria-label={`Order ${facts.orderLabel}, ${spec.label}, ${row.title || 'item'}`}
        onClick={() => onOpen(row)}
        className={cn('ds-raw-button absolute inset-0 z-0', focusRing('cell'))}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none relative z-10 w-[5px] shrink-0 self-stretch',
          LIFECYCLE_CLASSES[facts.state].dot,
          facts.state === 'outOfStock' &&
            '[background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--mode-panel)_3px_5px)]',
          row.buyerNote && RECORD_NOTE_SPINE_CLASS,
        )}
      />

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Band 1 — context: state · platform · order # ··· date */}
        <div className={cn(BAND, 'gap-2 border-b border-mode-rule pl-2')}>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', recordStateCodeClass(facts.state))}>
            <span aria-hidden>{spec.code}</span>
            <span className="sr-only">{spec.label}</span>
          </span>
          {/* Buyer note: left-side anchor beside the code, rigid on every record. */}
          <RecordNoteSlot note={row.buyerNote ?? null} />
          {platform ? (
            <span
              className={cn(RECORD_LABEL_CLASS, 'max-w-[5rem] shrink-0 truncate text-mode-muted')}
              title={channel.connectionName ?? channel.label}
            >
              {platform}
            </span>
          ) : null}
          <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{facts.orderLabel}</span>
          <span
            className={cn(
              LANE,
              RECORD_LABEL_CLASS,
              facts.overdueDays > 0 ? LIFECYCLE_CLASSES.outOfStock.text : facts.dueToday ? 'text-mode-ink' : 'text-mode-muted',
            )}
          >
            <span className="truncate">{formatShipByFace(facts.shipByKey, facts.overdueDays)}</span>
          </span>
        </div>
        {/* Band 2 — identity: micro-thumbnail · title ··· QTY */}
        <div className={cn(BAND, 'gap-2 border-b border-mode-rule pl-1')}>
          <button
            type="button"
            data-testid="mobile-order-thumb"
            aria-label="Open image and details"
            onClick={() => onOpen(row)}
            className={cn(
              'ds-raw-button pointer-events-auto relative h-8 w-8 shrink-0 overflow-hidden border border-mode-rule bg-mode-well',
              focusRing('cell'),
            )}
          >
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog CDN thumb, same as ItemCardRow
              <img src={row.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span aria-hidden className="flex h-full w-full items-center justify-center font-mono text-role-micro font-black text-mode-muted">
                {facts.initials}
              </span>
            )}
          </button>
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1')}>{row.title || '—'}</span>
          <span className={cn(LANE, 'justify-end gap-1.5')}>
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>QTY</span>
            <span className={RECORD_QTY_BADGE_CLASS}>{facts.qty}</span>
          </span>
        </div>
        {/* Band 3 — execution: condition · BIN · SKU ··· next */}
        <div className={cn(BAND, 'gap-2 pl-2')}>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', conditionGradeTextClass(row.condition))}>
            {condition}
          </span>
          <span
            className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate', location ? 'text-mode-ink' : 'text-mode-warn')}
          >
            <span className="text-mode-muted">BIN </span>
            {location ?? 'UNASSIGNED'}
          </span>
          <span className={cn(RECORD_ID_CLASS, 'max-w-[6rem] shrink-0 truncate')}>{row.sku || '—'}</span>
          <span
            title={facts.next.tip}
            className={cn(
              LANE,
              RECORD_LABEL_CLASS,
              facts.next.blocked ? LIFECYCLE_CLASSES.outOfStock.text : 'text-mode-ink',
            )}
          >
            <span className="truncate">{facts.next.label}</span>
          </span>
        </div>
      </div>
    </div>
  );
});
