'use client';

/**
 * The item sheet — the phone face of one checklist check, and its editor.
 * phone (operator 2026-09-15). The row that opens it prints a pencil instead:
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
    /* `scrollBody` is load-bearing now that the field and the facts share one surface. */
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      forceVariant="sheet"
      compact
      scrollBody
      scrollBodyMaxHeightClass="max-h-[70svh]"
    >
      {/*
 * The sheet paints its OWN header rather than passing `title`:
 * (operator 2026-09-15 — *"within the edit it can display the ID top
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

      {/* The title field follows the timer, focused with the keyboard up. */}
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

      {/* The two structural verbs, and they only exist for a manager. */}
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
