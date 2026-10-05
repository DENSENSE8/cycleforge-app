'use client';

/**
 * One uploaded PDF on the Uploads list — what the file IS and how far its
 * printing got, nothing else:
 *
 *   ☐  ShipStation batch 0928.pdf                           12 to print
 *      40 labels · uploaded Sep 28, 9:14 AM · Michael
 *      ███████████░░░░░  28 printed · last 2:14 PM
 *
 * The whole card opens the batch (every label inline beside the list); only
 * the checkbox checks it. The top-left slot keeps the gutter law RecordCard
 * keeps: the printing state's glyph at rest, the house check on hover / focus /
 * touch / once checked.
 */

import { memo, type MouseEvent } from 'react';
import { CheckCircle, CircleDot } from '@/components/Icons';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { CardCheck, SLOT_HOVER_CLASS, SLOT_REST_CLASS } from '@/design-system/components/record-card/RecordCard';
import { recordCardOutlineClass } from '@/design-system/components/record-card/record-card-outline';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import type { LabelBatchRow } from '@/lib/label-batches/contracts';
import { cn } from '@/utils/_cn';
import type { BatchCardModel } from './batch-model';

const WHEN = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const BatchCard = memo(function BatchCard({
  model,
  checked,
  open,
  onOpen,
  onToggleCheck,
  testIdPrefix,
}: TriageCardSlotProps<LabelBatchRow, BatchCardModel> & { testIdPrefix: string }) {
  const batch = model.lead;
  const done = batch.pageCount > 0 ? Math.round((batch.printedPages / batch.pageCount) * 100) : 0;
  const allPrinted = model.toPrint === 0;
  const paperwork = batch.id < 0;
  const resting = checked === false;
  const StateGlyph = allPrinted ? CheckCircle : CircleDot;
  const openCard = (event: MouseEvent) =>
    onOpen(batch, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target });

  return (
    <article
      {...{ [DESK_RECORD_KEY_ATTR]: batch.id }}
      data-testid={testIdPrefix}
      aria-label={`Upload ${batch.fileName}`}
      className="group/card relative isolate flex gap-3 rounded-2xl bg-surface-card px-4 py-3"
    >
      {/* Always a white card: state reads as a real border, never a ring (RecordCard's outline). */}
      <span aria-hidden className={recordCardOutlineClass({ selected: !resting, open })} />
      {/* ds-raw-button: the whole-card open target under the content, as RecordCard's — not a visible control. */}
      <button
        type="button"
        aria-label={`Open ${batch.fileName}`}
        aria-current={open || undefined}
        data-testid={`${testIdPrefix}-open`}
        onClick={openCard}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-2xl', focusRing('control'))}
      />
      <span className="pointer-events-none relative z-10 flex h-6 items-center">
        <span className="relative flex size-[18px] items-center justify-center">
          {resting ? (
            <span
              role="img"
              aria-label={allPrinted ? 'All printed' : `${model.toPrint} to print`}
              data-testid={`${testIdPrefix}-status`}
              className={cn(SLOT_REST_CLASS, 'items-center justify-center', STATE_TONE_CLASSES[allPrinted ? 'success' : 'warning'].text)}
            >
              <StateGlyph className="size-4" />
            </span>
          ) : null}
          <span className={resting ? SLOT_HOVER_CLASS : 'flex'}>
            <CardCheck
              checked={checked}
              label={`Select ${batch.fileName}`}
              testId={`${testIdPrefix}-check`}
              onToggle={(event) => onToggleCheck(model, event)}
            />
          </span>
        </span>
      </span>
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-6 min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-text-default" title={batch.fileName}>
            {batch.fileName}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 rounded-md px-1.5 text-[11px] font-medium tabular-nums',
              allPrinted ? 'bg-surface-sunken text-text-muted' : 'bg-fill-warning/15 text-text-warning',
            )}
            data-testid={`${testIdPrefix}-to-print`}
          >
              {paperwork ? 'Letter' : allPrinted ? 'All printed' : `${model.toPrint} to print`}
          </span>
        </div>
        <span className="truncate text-[13px] text-text-muted">
          {paperwork ? '1 paperwork file · no order' : `${batch.pageCount} label${batch.pageCount === 1 ? '' : 's'}`} · uploaded {WHEN.format(new Date(batch.uploadedAt))}
          {batch.uploadedBy ? ` · ${batch.uploadedBy}` : ''}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
            <span className="block h-full rounded-full bg-fill-success" style={{ width: `${done}%` }} />
          </span>
          <span className="truncate text-xs tabular-nums text-text-muted">
            {paperwork ? 'Ready to print' : `${batch.printedPages} printed`}
            {batch.lastPrintedAt ? ` · last ${WHEN.format(new Date(batch.lastPrintedAt))}` : ''}
          </span>
        </div>
      </div>
    </article>
  );
});
