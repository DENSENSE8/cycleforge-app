'use client';

/**
 * The item sheet — the phone face of one checklist check, and its editor.
 *
 * A `BottomSheet` because on a phone the sheet IS the detail surface (its own
 * contract: never a desk dialog, never a right rail).
 *
 * ONE SURFACE, NO MODES. The row's pencil lands here with the title field
 * focused and the keyboard up, and the facts — kind, owner, mine, shift, day,
 * links, last mark — sit underneath it, always visible. The first cut made
 * this a two-step (open on facts → press Edit → type), which meant the pencil
 * described a verb it did not deliver and cost two taps before a correction
 * could be typed. Facts and field coexist because an operator fixing a title
 * still wants to see whose item it is and whether the shift already ticked it.
 *
 * Editing is gated on `admin.manage_staff`, and the gate changes the FACE, not
 * a disabled state: without it the title is plain text and the two verbs are
 * absent, so the sheet degrades to what it always was — the detail surface.
 *
 * The ITEM ID lives in this sheet's top-right corner and nowhere else on the
 * phone (operator 2026-09-15). The row that opens it prints a pencil instead:
 * a floor staffer ticks by title, and only someone about to edit or quote the
 * item needs its handle.
 */

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PomodoroTimer } from '@/components/ui/PomodoroTimer';
import { Button } from '@/design-system/primitives';
import { getCurrentPSTDateKey } from '@/utils/date';
import { useDailyCheckLinks } from '@/lib/daily-checks/use-daily-check-links';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { cn } from '@/utils/_cn';
import type { DailyCheckItem, DailyCheckReport } from '@/lib/daily-checks/types';
import { TITLE_INPUT_CLASS } from './MobileDailyComposerFields';
import { MobileDailyFacts } from './MobileDailyFacts';


export function MobileDailyDetailSheet({
  item,
  report,
  canManage,
  saving,
  saveError,
  removing,
  onSave,
  onRemove,
  onClose,
}: {
  item: DailyCheckItem | null;
  report: DailyCheckReport | undefined;
  /**
   * `admin.manage_staff` — the same permission the items route gates on. The
   * controls are ABSENT without it, never disabled: the registry's rule is that
   * a control which 403s is worse than one that was never offered.
   */
  canManage: boolean;
  saving: boolean;
  saveError: string | null;
  removing: boolean;
  /** Host owns the mutation AND closes this sheet on success. */
  onSave: (title: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useRecordView('checklist', item?.id ?? null, getCurrentPSTDateKey());
  const lastMarkedAt = report?.mine.lastMarkedAt ?? null;
  const { data: links, isLoading: linksLoading } = useDailyCheckLinks(item?.id ?? null);

  const [draftTitle, setDraftTitle] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // A new item is a new sheet. Without this, opening row B after editing row A
  // would hold A's words, or land mid-confirm on a row nobody asked to remove.
  const itemId = item?.id ?? null;
  useEffect(() => {
    setDraftTitle(item?.title ?? '');
    setConfirmingRemove(false);
  }, [itemId, item?.title]);

  const trimmed = draftTitle.trim();
  const canSave = trimmed.length > 0 && trimmed !== item?.title && !saving;

  return (
    /*
     * `scrollBody` is load-bearing now that the field and the facts share one
     * surface. Header + field + seven fact rows + the footer is taller than
     * 844px MINUS the on-screen keyboard, and this sheet is bottom-anchored:
     * without a cap the panel grows off the TOP of the screen and the operator
     * is typing into a field whose Save button they cannot reach. The clamp is
     * `70svh` — small viewport units, so it measures the screen the keyboard
     * left behind rather than the one it covered.
     */
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      forceVariant="sheet"
      compact
      scrollBody
      scrollBodyMaxHeightClass="max-h-[70svh]"
    >
      {/*
       * The sheet paints its OWN header rather than passing `title`: the
       * primitive's title is CENTRED, and the id has to land hard right
       * (operator 2026-09-15 — *"within the edit it can display the ID top
       * right"*). `title` also names nothing for a screen reader here — only
       * `DialogPanel` carries `role="dialog"`, and this sheet forces the sheet
       * variant — so dropping it costs no accessible name.
       *
       * The left slot is the REGISTER, not the title, because the title is
       * already in the field below and printing it twice on a 390px screen
       * wastes the one line the facts need.
       */}
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-1 pb-2">
        <span className="text-role-micro uppercase tracking-wide text-text-faint">
          {canManage ? 'Edit task' : 'Task'}
        </span>
        {item ? (
          <span className="shrink-0 font-mono text-role-micro tabular-nums text-text-faint">
            {item.id}
          </span>
        ) : null}
      </div>
      {item ? (
        <PomodoroTimer kind="checklist" id={item.id} date={getCurrentPSTDateKey()} canRun={!report?.mine.doneItemIds.includes(item.id)} className="px-1" />
      ) : null}

      {/*
       * The title field follows the timer, focused with the keyboard up. The
       * pencil that opened this sheet promised editing, not another mode.
       * The facts stay below it: an operator correcting a title still needs
       * to see whose item it is and whether the shift ticked it.
       *
       * Read-only for anyone without `admin.manage_staff` — the title falls
       * back to plain text, so the sheet is still the detail surface for a
       * floor staffer, just not an editor.
       */}
      {item && canManage ? (
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault();
              onSave(trimmed);
            }
          }}
          aria-label="Task title"
          autoFocus
          className={cn(TITLE_INPUT_CLASS, 'shrink-0')}
        />
      ) : item ? (
        <p className="shrink-0 px-1 text-role-caption font-semibold text-text-default">
          {item.title}
        </p>
      ) : null}

      {item ? (
        <MobileDailyFacts
          item={item}
          report={report}
          links={links}
          linksLoading={linksLoading}
          lastMarkedAt={lastMarkedAt}
        />
      ) : null}

      {saveError ? (
        <p role="alert" className="shrink-0 px-1 pt-2 text-role-micro text-text-muted">
          {saveError}
        </p>
      ) : null}

      {/*
       * The two structural verbs, and they only exist for a manager.
       *
       * REMOVE IS A RETIRE, and the label has to say so: the row keeps its
       * `retired_at` window so every past report still renders the check, and
       * calling that "Delete" would promise an erasure the system deliberately
       * refuses to perform. It is also list-wide — unlike a tick, which is
       * personal and one tap to undo — so it takes a confirm step. The confirm
       * replaces the FOOTER rather than stacking a second sheet: a sheet inside
       * a sheet is where an operator gets lost on a 390px screen.
       *
       * No Cancel button on the edit row. Dismissing the sheet — drag, scrim,
       * Escape — already is cancel, and nothing has been written; a third
       * control here would just crowd the thumb zone.
       */}
      {item && canManage ? (
        confirmingRemove ? (
          <div className="flex shrink-0 flex-col gap-2 px-1 pb-1 pt-3">
            <p className="text-role-caption text-text-muted">
              Remove this from today&apos;s list for everyone? Past days keep it.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="min-h-12 flex-1"
                onClick={() => setConfirmingRemove(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="min-h-12 flex-1"
                disabled={removing}
                onClick={onRemove}
              >
                {removing ? 'Removing…' : 'Remove'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 px-1 pb-1 pt-3">
            <Button
              variant="secondary"
              size="lg"
              className="min-h-12 flex-1"
              onClick={() => setConfirmingRemove(true)}
            >
              Remove from the list
            </Button>
            {/* R9 — a disabled CTA names what is missing: an untouched title
                has nothing to save, and the word says so instead of greying
                out silently. */}
            <Button
              variant="primary"
              size="lg"
              className="min-h-12 flex-1"
              disabled={!canSave}
              onClick={() => onSave(trimmed)}
            >
              {saving ? 'Saving…' : trimmed.length === 0 ? 'Title needed' : 'Save'}
            </Button>
          </div>
        )
      ) : null}
    </BottomSheet>
  );
}
