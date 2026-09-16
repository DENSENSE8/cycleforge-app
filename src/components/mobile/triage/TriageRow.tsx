'use client';

/**
 * A triage list row: inspect on the left, commit on the right.
 *
 * ## Two targets, deliberately, and never nested
 *
 * A row that only commits forces a blind decision; a row that only opens a
 * detail view costs two taps for the case an operator is already sure about —
 * which is most of them. So the row carries both, and which half you hit says
 * which you meant.
 *
 * They are SIBLINGS. Nesting a button inside a button is invalid HTML, and
 * browsers resolve it by dropping events unpredictably — the "sometimes the
 * CTA doesn't fire" bug that gets chased for an afternoon and blamed on the
 * touch handler.
 *
 * ## The two accessible names must differ
 *
 * Both halves describe the same product, so the obvious labelling gives a
 * screen-reader user two adjacent controls both announcing "Bose Wave Music
 * System III" with no way to tell inspect from commit. The action verb is
 * therefore part of each name, not implied by position — position is exactly
 * the information a non-visual reader does not have.
 */

import type { ReactNode } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import {
  ITEM_RECORD_MOBILE_THUMB,
  ITEM_RECORD_MOBILE_TITLE,
} from '@/design-system/tokens/item-record-mobile';
import { cn } from '@/utils/_cn';

export function TriageRow({
  title,
  meta,
  imageUrl,
  badge,
  actionLabel,
  actionName,
  inspectName,
  onInspect,
  onAction,
  busy = false,
}: {
  title: string;
  /** Second line — SKU, code, counts. */
  meta?: ReactNode;
  imageUrl?: string | null;
  /** Small marker beside the meta line (e.g. ON HOLD). */
  badge?: ReactNode;
  /** Visible text on the commit button. A verb. */
  actionLabel: string;
  /** Full accessible name for the commit button, naming the subject. */
  actionName: string;
  /** Full accessible name for the inspect half, naming the subject. */
  inspectName: string;
  onInspect: () => void;
  onAction: () => void;
  busy?: boolean;
}) {
  return (
    <li className="flex items-stretch gap-2 pr-2">
      {/*
        ds-raw-button: a two-line, left-aligned row with a bled thumb is not a
        Button shape, and forcing one here would mean overriding its height —
        the thing the control-size guard exists to stop.
      */}
      <button
        type="button"
        aria-label={inspectName}
        onClick={onInspect}
        className="ds-raw-button flex min-w-0 flex-1 items-stretch gap-3 py-2 pl-2 text-left active:bg-surface-hover"
      >
        <ItemRecordThumb
          imageUrl={imageUrl}
          plainEmpty
          // The PHONE cube (64px), not the desk's 80px default — this row is
          // 390px wide and the title is what the operator decides on. Shrinking
          // it also shortens the row, so more of the list fits on screen.
          className={cn(
            'self-center',
            ITEM_RECORD_MOBILE_THUMB.size,
            ITEM_RECORD_MOBILE_THUMB.corner,
          )}
          iconClassName={ITEM_RECORD_MOBILE_THUMB.packageIcon}
        />
        <span className={cn(ITEM_RECORD_MOBILE_TITLE.band, 'flex-1')}>
          <span className={cn(ITEM_RECORD_MOBILE_TITLE.face, 'block')}>{title}</span>
          <span className={ITEM_RECORD_MOBILE_TITLE.foot}>
            {meta}
            {badge}
          </span>
        </span>
      </button>

      <Button
        variant="primary"
        size="lg"
        radius="surface"
        className="my-2 shrink-0 self-center"
        ariaLabel={actionName}
        loading={busy}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </li>
  );
}
