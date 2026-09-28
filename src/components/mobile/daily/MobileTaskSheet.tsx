'use client';

/** The TASK sheet — how a staffer who was handed a task finds out how to do it, and does it, on the phone (`/m/home?task=<id>`). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { BottomSheet } from '@/components/ui/BottomSheet';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { PomodoroTimer } from '@/components/ui/PomodoroTimer';
import { Bell, Camera, Check, Play, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import { dailyAgendaFromTask } from '@/lib/daily/daily-agenda-row';
import { isTaskDeskOpen, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { taskDeadlineFact, taskRecordLabel } from '@/lib/tasks/task-row-facts';
import { useStartTask, useToggleTaskDone } from '@/lib/tasks/use-my-tasks';
import { useTaskDocuments, useTaskLinks, useTaskMedia } from '@/lib/tasks/use-task-workspace';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { cn } from '@/utils/_cn';
import {
  TASK_SECTION_LABEL,
  TaskDocumentList,
  TaskDocumentView,
  TaskLinkDoors,
  TaskMediaGrid,
  taskMediaTimeline,
} from './MobileTaskSections';
import { MediaLinkField, MediaLinkList } from './MobileTaskMediaLinks';

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
        <p className="font-mono text-role-micro tabular-nums text-text-faint">{title}</p>
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
  const toggle = useToggleTaskDone();
  const start = useStartTask();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docId, setDocId] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stepping into (or back out of) a document starts at its top, not wherever
  // the task's scroll happened to be.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [docId]);

  const timeline = useMemo(
    () => taskMediaTimeline(media.photos, media.videos, media.links),
    [media.photos, media.videos, media.links],
  );
  const slides = useMemo<SwipePhotoSlide[]>(
    () =>
      timeline.map((item) =>
        item.kind === 'photo'
          ? { id: `p${item.photo.id}`, previewUrl: item.photo.url, kind: 'photo' }
          : item.kind === 'video'
            ? { id: `v${item.video.id}`, previewUrl: item.video.url, kind: 'video' }
            : { id: `l${item.link.id}`, previewUrl: item.link.embedUrl, kind: 'photo' },
      ),
    [timeline],
  );

  const state = agendaRecordState(dailyAgendaFromTask(row), nowMs, true);
  const due = taskDeadlineFact(row.deadlineAtMs, nowMs);
  const open = isTaskDeskOpen(row.status);
  const notStarted = open && row.status !== 'IN_PROGRESS' && row.startedAtMs == null;
  const pending = toggle.isPending || start.isPending;
  const verbError = toggle.error ?? start.error;

  /*
   * ONE primary (SURFACE_LAW R2): Start while nobody has picked it up, then
   * Mark done, then Reopen once it is finished. Mark done closes the sheet —
   * the row striking through on the list is the answer to "did it take?".
   */
  const primary = notStarted
    ? { label: pending ? 'Starting…' : 'Start', icon: <Play aria-hidden className="h-5 w-5" />, run: () => start.mutate(row.id) }
    : open
      ? {
          label: pending ? 'Saving…' : 'Mark done',
          icon: <Check aria-hidden className="h-5 w-5" />,
          run: () => toggle.mutate({ taskId: row.id, done: true }, { onSuccess: onClose }),
        }
      : row.status === 'DONE'
        ? { label: pending ? 'Saving…' : 'Reopen', icon: null, run: () => toggle.mutate({ taskId: row.id, done: false }) }
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
        accept="image/*,video/*"
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
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[state.lifecycle].dot)} />
          <span
            className={cn(
              'font-mono text-role-micro font-semibold',
              state.late ? 'text-text-danger' : 'text-text-default',
            )}
          >
            {state.word.toUpperCase() === state.code ? state.code : `${state.code} · ${state.word}`}
          </span>
        </span>
        {due ? (
          <span className={cn('text-role-micro', due.overdue && open ? 'text-text-danger' : 'text-text-muted')}>
            {due.text}
          </span>
        ) : null}
        {reminder ? (
          <span className="flex items-center gap-1 font-mono text-role-micro text-text-muted">
            <Bell aria-hidden className="h-3.5 w-3.5" />
            {reminder}
          </span>
        ) : null}
      </div>
      <div className="border-b border-border-hairline px-1 py-2 text-role-caption text-text-muted" data-testid="mobile-task-team">
        <span className="font-semibold text-text-default">Team: </span>
        {row.assignees.map((person, index) => `${person.name}${index === 0 ? ' (lead)' : ''}`).join(', ')}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        {docId != null ? (
          <div className="pt-3">
            <TaskDocumentView taskId={row.id} docId={docId} onBack={() => setDocId(null)} />
          </div>
        ) : (
          <>
            <p className={TASK_SECTION_LABEL}>Instructions</p>
            {row.note ? <MarkdownRenderer content={row.note} /> : <p className={QUIET}>No instructions written.</p>}

            <p className={TASK_SECTION_LABEL}>Media</p>
            {media.loading ? (
              <p className={QUIET}>Loading photos and videos…</p>
            ) : timeline.length > 0 ? (
              <TaskMediaGrid items={timeline} onOpen={setViewerIndex} />
            ) : (
              <p className={QUIET}>No photos or videos yet.</p>
            )}
            <MediaLinkField onAdd={media.addLink.mutateAsync} />
            {media.links.length > 0 ? (
              <MediaLinkList
                links={media.links}
                removingId={media.removeLink.isPending ? media.removeLink.variables ?? null : null}
                onUpdate={(link, patch) => media.updateLink.mutateAsync({ id: link.id, ...patch })}
                onRemove={(link) => media.removeLink.mutate(link.id)}
              />
            ) : null}

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

      <MobileSwipePhotoViewer
        slides={slides}
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
