'use client';

/** The TASK sheet — how a staffer who was handed a task finds out how to do it, and does it, on the phone (`/m/home?task=<id>`). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { BottomSheet } from '@/components/ui/BottomSheet';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { PomodoroTimer } from '@/components/ui/PomodoroTimer';
import { Bell, Camera, Check, Maximize2, Play, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import type { TaskStatus } from '@/design-system/tokens/task-status';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import { dailyAgendaFromTask } from '@/lib/daily/daily-agenda-row';
import { isTaskDeskOpen, taskDeskTicketNumber, taskDeskTitle, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { taskDeadlineFact, taskRecordLabel } from '@/lib/tasks/task-row-facts';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { useSetTaskStatus } from '@/lib/tasks/use-my-tasks';
import { useTaskDocuments, useTaskLinks, useTaskMedia } from '@/lib/tasks/use-task-workspace';
import { TASK_MEDIA_ACCEPT, taskLessons, taskStills, useLessonPlayer } from '@/lib/tasks/task-media-lessons';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { cn } from '@/utils/_cn';
import {
  TASK_SECTION_LABEL,
  TaskDocumentList,
  TaskDocumentView,
  TaskEmailLinks,
  TaskLinkDoors,
} from './MobileTaskSections';
import { MobileTaskMedia } from './MobileTaskMedia';
import { MobileTaskMediaFeature } from './MobileTaskMediaFeature';
import { MobileTaskStatus } from './MobileTaskStatus';
import { MobileTaskFollowUps } from './MobileTaskFollowUps';
import { MobileTaskTeam } from './MobileTaskTeam';
import { MobileTaskAlert } from './MobileTaskAlert';

const QUIET = 'text-role-caption text-text-muted';

export function MobileTaskSheet({
  taskId,
  row,
  loading,
  nowMs,
  canOpenTickets,
  onClose,
}: {
  /** `?task=` — null keeps the sheet closed. */
  taskId: number | null;
  /** The task off the viewer's own list; null while loading or when it is not theirs. */
  row: TaskDeskRow | null;
  /** The list is still arriving — "not on your list" would be a lie yet. */
  loading: boolean;
  nowMs: number;
  canOpenTickets: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={taskId != null} onClose={onClose} forceVariant="sheet" fullScreen dragDisabled>
      {taskId == null ? null : row ? (
        <MobileTaskBody key={row.id} row={row} nowMs={nowMs} canOpenTickets={canOpenTickets} onClose={onClose} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader title={`Task ${taskId}`} sub={null} onClose={onClose} />
          <div className="flex flex-1 flex-col gap-2 px-1 pt-6">
            {loading ? (
              <p className={QUIET}>Loading the task…</p>
            ) : (
              <>
                <p className="text-role-data font-semibold text-text-default">
                  Task {taskId} is not on your list.
                </p>
                <p className={QUIET}>
                  It may be finished and withdrawn, handed to someone else, or you may not have access to tasks.
                  Ask whoever handed it to you.
                </p>
              </>
            )}
          </div>
          <div className="shrink-0 pt-3">
            <Button variant="secondary" size="lg" className="min-h-12 w-full" onClick={onClose}>
              Back to the list
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function SheetHeader({ title, sub, onClose }: { title: string; sub: string | null; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start gap-2 px-1 pt-2">
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-role-micro tabular-nums text-text-faint">{title}</p>
        {sub ? <p className="truncate text-role-data font-semibold text-text-default">{sub}</p> : null}
      </div>
      <IconButton
        onClick={onClose}
        ariaLabel="Close task"
        size="touch"
        icon={<X aria-hidden className="h-5 w-5" />}
        className="shrink-0"
      />
    </div>
  );
}

function MobileTaskBody({
  row,
  nowMs,
  canOpenTickets,
  onClose,
}: {
  row: TaskDeskRow;
  nowMs: number;
  canOpenTickets: boolean;
  onClose: () => void;
}) {
  useRecordView('task', row.id);
  const links = useTaskLinks(row.id);
  const media = useTaskMedia(row.id);
  const docs = useTaskDocuments(row.id);
  const setStatus = useSetTaskStatus();
  const fileRef = useRef<HTMLInputElement>(null);

  const lessons = useMemo(() => taskLessons(media.videos, media.links), [media.videos, media.links]);
  const stills = useMemo(() => taskStills(media.photos, media.links), [media.photos, media.links]);
  // The sheet's ONE player: it leads the scroll, and Media's lesson rows drive it.
  const player = useLessonPlayer(lessons, !media.loading);
  const playerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLParagraphElement>(null);

  const [docId, setDocId] = useState<number | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stepping into (or back out of) a document starts at its top, not wherever
  // the task's scroll happened to be.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [docId]);

  const state = agendaRecordState(dailyAgendaFromTask(row), nowMs, true);
  const due = taskDeadlineFact(row.deadlineAtMs, nowMs);
  const status = taskStatusOf(row);
  const open = isTaskDeskOpen(row.status);
  const notStarted = open && row.status !== 'IN_PROGRESS' && row.startedAtMs == null;
  const pending = setStatus.isPending;
  const verbError = setStatus.error;

  const setTo = (target: TaskStatus) => {
    if (target === 'CANCELED' && !window.confirm(`Cancel “${taskDeskTitle(row)}”? A canceled task cannot be reopened.`)) return;
    // A canceled task leaves the viewer's list, so the sheet goes with it.
    setStatus.mutate({ row, target }, target === 'CANCELED' ? { onSuccess: onClose } : undefined);
  };

  /*
   * ONE primary (SURFACE_LAW R2): Start while nobody has picked it up, then
   * Mark done, then Reopen once it is finished. Mark done closes the sheet —
   * the row striking through on the list is the answer to "did it take?".
   */
  const primary = notStarted
    ? { label: pending ? 'Starting…' : 'Start', icon: <Play aria-hidden className="h-5 w-5" />, run: () => setTo('IN_PROGRESS') }
    : open
      ? {
          label: pending ? 'Saving…' : 'Mark done',
          icon: <Check aria-hidden className="h-5 w-5" />,
          run: () => setStatus.mutate({ row, target: 'DONE' }, { onSuccess: onClose }),
        }
      : row.status === 'DONE'
        ? { label: pending ? 'Saving…' : 'Reopen', icon: null, run: () => setTo('TODO') }
        : null;

  const uploading = media.uploading;
  const uploadLabel = uploading
    ? `Uploading ${Math.min(uploading.done + 1, uploading.total)}/${uploading.total}${
        uploading.fraction != null ? ` · ${Math.round(uploading.fraction * 100)}%` : ''
      }`
    : 'Add photo / video';

  const reminder = row.remindAtMs == null ? null : format(new Date(row.remindAtMs), 'MMM d · h:mm a');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={fileRef}
        type="file"
        accept={TASK_MEDIA_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void media.upload(files);
        }}
      />

      <SheetHeader title={`Task ${row.id}`} sub={row.projectName ?? taskRecordLabel(row)} onClose={onClose} />
      <PomodoroTimer kind="task" id={row.id} canRun={open} className="px-1" />
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-hairline px-1 pb-2 pt-1">
        <LifecycleCode state={state.face} srLabel={null}>
          {state.word}
        </LifecycleCode>
        {due ? (
          <span
            className={cn(
              'text-role-micro',
              !open
                ? 'text-text-muted'
                : due.overdue
                  ? 'text-text-danger'
                  : due.urgent
                    ? 'font-semibold text-orange-700 dark:text-orange-300'
                    : 'text-text-muted',
            )}
          >
            {due.text}
          </span>
        ) : null}
        {reminder ? (
          <span className="flex items-center gap-1 text-role-micro tabular-nums text-text-muted">
            <Bell aria-hidden className="h-3.5 w-3.5" />
            {reminder}
          </span>
        ) : null}
      </div>
      <MobileTaskStatus status={status} pending={pending} onSet={setTo} />
      <MobileTaskTeam taskId={row.id} people={row.assignees} />
      {/* R7 — the Alert verb line, the desk's Alert twin. */}
      <MobileTaskAlert taskId={row.id} people={row.assignees} ticketNumber={taskDeskTicketNumber(row)} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        {docId != null ? (
          <div className="pt-3">
            <TaskDocumentView taskId={row.id} docId={docId} onBack={() => setDocId(null)} />
          </div>
        ) : (
          <>
            {media.loading ? (
              row.photoCount + row.videoCount > 0 ? (
                <div
                  className={cn(
                    'mt-3 w-full animate-pulse bg-surface-sunken',
                    row.videoCount > 0 ? 'aspect-video' : 'h-14',
                    MOBILE_ROW_CORNER,
                  )}
                />
              ) : null
            ) : (
              <MobileTaskMediaFeature
                lessons={lessons}
                stills={stills}
                player={player}
                playerRef={playerRef}
                onShowAll={() => mediaRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
              />
            )}

            <div className="flex items-end justify-between gap-2">
              <p className={TASK_SECTION_LABEL}>Brief</p>
              {row.note ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1"
                  icon={<Maximize2 aria-hidden className="h-4 w-4" />}
                  onClick={() => setBriefOpen(true)}
                  data-testid="mobile-task-brief-expand"
                >
                  Expand
                </Button>
              ) : null}
            </div>
            {row.note ? <MarkdownRenderer content={row.note} /> : <p className={QUIET}>No brief written.</p>}

            <p className={TASK_SECTION_LABEL}>Follow-ups</p>
            <MobileTaskFollowUps taskId={row.id} ticketNumber={taskDeskTicketNumber(row)} nowMs={nowMs} />

            <p ref={mediaRef} className={cn(TASK_SECTION_LABEL, 'scroll-mt-2')}>
              Media
            </p>
            <MobileTaskMedia
              lessons={lessons}
              stills={stills}
              playingKey={player.current?.key ?? null}
              loading={media.loading}
              uploading={media.uploading}
              problems={media.problems}
              onDismissProblems={media.dismissProblems}
              onPick={() => fileRef.current?.click()}
              onPlay={(lessonKey) => {
                player.play(lessonKey);
                playerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }}
              onAddLink={media.addLink.mutateAsync}
              onRenameLink={(id, title) => media.updateLink.mutateAsync({ id, title })}
              onRemoveLink={(id) => media.removeLink.mutate(id)}
              onRemoveVideo={(id) => media.removeVideo.mutate(id)}
            />

            <p className={TASK_SECTION_LABEL}>Documents</p>
            {docs.loading ? (
              <p className={QUIET}>Loading documents…</p>
            ) : docs.documents.length > 0 ? (
              <TaskDocumentList documents={docs.documents} onOpen={setDocId} />
            ) : (
              <p className={QUIET}>No documents on this task.</p>
            )}

            <p className={TASK_SECTION_LABEL}>Linked records</p>
            <TaskLinkDoors row={row} links={links.links} loading={links.loading} canOpenTickets={canOpenTickets} />
            <TaskEmailLinks taskId={row.id} />
          </>
        )}
      </div>

      {verbError ? (
        <p role="alert" className="shrink-0 px-1 pt-2 text-role-micro text-text-danger">
          {verbError.message}
        </p>
      ) : null}
      <div className="flex shrink-0 items-center gap-2 border-t border-border-hairline px-1 pt-3">
        <Button
          variant="secondary"
          size="lg"
          className="min-h-12 flex-1 whitespace-nowrap"
          icon={<Camera aria-hidden className="h-5 w-5" />}
          disabled={uploading != null}
          onClick={() => fileRef.current?.click()}
        >
          {uploadLabel}
        </Button>
        {/* R9 — a withdrawn task has no verb, and the disabled face says why. */}
        <Button
          variant="primary"
          size="lg"
          className="min-h-12 flex-1"
          icon={primary?.icon ?? undefined}
          disabled={primary == null || pending}
          onClick={primary?.run}
        >
          {primary?.label ?? 'Withdrawn'}
        </Button>
      </div>

      {/* The phone's reader: the same markdown, full height, nothing else on it. */}
      <BottomSheet open={briefOpen} onClose={() => setBriefOpen(false)} title="Brief" forceVariant="sheet" fullScreen level={1}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4" data-testid="mobile-task-brief-reader">
          <p className="pb-3 text-role-caption text-text-muted">{taskDeskTitle(row)}</p>
          <MarkdownRenderer content={row.note ?? ''} />
        </div>
      </BottomSheet>
    </div>
  );
}
