'use client';

/**
 * A triage list row: inspect on the left, commit on the right.
 *
 * ## BRIEF §4 triage, in one place
 *
 * Every phone triage list (exceptions, on-hold, inbox, pair) mounts this row,
 * so the triage grammar lives here and nowhere else — and it reads like every
 * other record on the phone (`DetailSummaryCard`: title first, identifier
 * bottom-left, status bottom-right; operator 2026-09-25):
 *   - the TITLE leads its line alone; `meta` (SKU, order #) sits under it on
 *     the left and the state code (`code`, a {@link StateCode} from
 *     `LIFECYCLE` or `INTAKE`) sits bottom-right on the same line;
 *   - the selected row wears the 2px INK outline — never a coloured one;
 *   - the commit is a flush cell the full height of the row, split off by one
 *     mode rule and styled like a secondary dock cell — quiet, not an ink
 *     block (operator 2026-09-25: "should not look extremely loud"); press
 *     inverts it to ink, instantly;
 *   - no motion: nothing on the row moves (opacity-only is the ceiling).
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
import { ITEM_RECORD_MOBILE_THUMB } from '@/design-system/tokens/item-record-mobile';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function TriageRow({
  title,
  meta,
  imageUrl,
  code,
  selected = false,
  actionLabel,
  actionName,
  inspectName,
  onInspect,
  onAction,
  busy = false,
}: {
  title: string;
  /** Second line — SKU, order #, counts, when. */
  meta?: ReactNode;
  /** Product photo. Omit (`undefined`) for rows that are not a product; `null` keeps the empty slot. */
  imageUrl?: string | null;
  /** The lead state code — a `StateCode` from `LIFECYCLE` / `INTAKE`. */
  code?: ReactNode;
  /** The row the operator is on (e.g. the record they just came back from): the ink outline. */
  selected?: boolean;
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
    <li
      data-triage-row=""
      data-selected={selected || undefined}
      className={cn(
        // `items-stretch` + no right inset: the commit is a flush cell the full
        // height of the row (operator 2026-09-25: "the pair button would be the
        // proper height … not lower in height from the row").
        'flex items-stretch bg-mode-panel',
        selected && 'outline outline-2 -outline-offset-2 outline-text-default',
      )}
    >
      {/*
        ds-raw-button: a two-line, left-aligned row with a bled thumb is not a
        Button shape, and forcing one here would mean overriding its height —
        the thing the control-size guard exists to stop.
      */}
      <button
        type="button"
        aria-label={inspectName}
        aria-current={selected || undefined}
        onClick={onInspect}
        className={cn(
          'ds-raw-button flex min-h-mode-hit min-w-0 flex-1 items-center gap-3 py-2 pl-mode-page pr-3 text-left active:bg-mode-hover',
          focusRing('cell', 'accent'),
        )}
      >
        {imageUrl !== undefined ? (
          <ItemRecordThumb
            imageUrl={imageUrl}
            plainEmpty
            // The PHONE cube, not the desk's 80px default — this row is 390px
            // wide and the title is what the operator decides on.
            className={cn('self-center', ITEM_RECORD_MOBILE_THUMB.size, 'rounded-mode')}
            iconClassName={ITEM_RECORD_MOBILE_THUMB.packageIcon}
          />
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="min-w-0 truncate text-mode-body font-semibold text-mode-ink">{title}</span>
          {meta || code ? (
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">{meta}</span>
              {code ? <span className="shrink-0">{code}</span> : null}
            </span>
          ) : null}
        </span>
      </button>

      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        // The dock's secondary cell: panel ground, ink label, one rule to its
        // left, full row height; instant inversion, no scale or transition.
        className="h-auto min-h-mode-hit min-w-22 shrink-0 self-stretch border-l border-mode-rule bg-mode-panel px-5 text-mode-ink shadow-none ring-0 transition-none enabled:active:scale-100 active:bg-mode-ink active:text-mode-panel"
        ariaLabel={actionName}
        loading={busy}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </li>
  );
}
