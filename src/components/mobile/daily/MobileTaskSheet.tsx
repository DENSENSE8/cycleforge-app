'use client';

/**
 * The TASK sheet — how a staffer who was handed a task finds out how to do it, and does it, on the
 * phone (`/m/home?task=<id>`). Composed on Apple's patterns (HIG Toolbars · Pull-down buttons ·
 * Menus · Sheets · Action sheets, researched 2026-10-03; components in `src/components/mobile/ios`):
 *
 * L1 (the first screen, `data-disclosure-zone="l1"` — budgeted by `src/lib/disclosure`):
 *   bar     — `#id` + title leading; trailing: a running timer capsule, the ⋯ More menu, then ✕.
 *   corners — the status dropdown top-left (the quick slider lives inside it), the time top-right.
 *   who     — the project (only when the title is not already it) and the people, read-only.
 * Body — the work itself, read in line: the walkthrough player, the ticket's conversation, the brief
 *   (never restating the title), Docs with comments, the activity stream, media, linked records.
 * Dock — ONE prominent verb: Start → Mark Done → Reopen.
 * ⋯ More (owner 2026-10-03: "adding staff must be behind the three dots") — every secondary verb:
 *   Timer · Call · Note on the top row, then Add Person… / Send Alert…, the media and email adds,
 *   and Cancel Task (red, confirmed in an action sheet).
 */

import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Bell,
  Camera,
  Check,
  Link2,
  Mail,
  Maximize2,
  NotebookPen,
  Phone,
  Play,
  Timer,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { PomodoroTimerFace, PomodoroTimerSheet, usePomodoroClock } from '@/components/ui/PomodoroTimer';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { IconButton } from '@/design-system/primitives/IconButton';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import type { TaskStatus } from '@/design-system/tokens/task-status';
import { TASK_BOARD_TYPE_FACE } from '@/lib/task-board/task-board-model';
import { isTaskDeskOpen, taskBriefBody, taskDeskTicketNumber, taskDeskTitle, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { taskDeadlineFact } from '@/lib/tasks/task-row-facts';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { TASK_DUE_PRESETS, taskDueDay, taskDueInstantIso } from '@/lib/tasks/task-due';
import { useSetTaskDeadline, useSetTaskStatus } from '@/lib/tasks/use-my-tasks';
import { useTaskDocuments, useTaskLinks, useTaskMedia } from '@/lib/tasks/use-task-workspace';
import { TASK_MEDIA_ACCEPT, taskLessons, taskStills, useLessonPlayer } from '@/lib/tasks/task-media-lessons';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { cn } from '@/utils/_cn';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { IosBar, IosBarButton } from '@/components/mobile/ios/IosBar';
import { IosMoreMenu, type IosMenuItem } from '@/components/mobile/ios/IosMoreMenu';
import { TaskDocumentInline, TaskEmailLinkForm, TaskEmailLinks, TaskLinkDoors } from './MobileTaskSections';
import { MobileMediaAddBar, MobileTaskMedia } from './MobileTaskMedia';
import { MobileTaskMediaFeature } from './MobileTaskMediaFeature';
import { MobileTaskStatus } from './MobileTaskStatus';
import { MobileTaskFollowUps, MobileTaskLogSheet, type TaskLogChannel } from './MobileTaskFollowUps';
import { MobileTaskAddPerson, MobileTaskPeople } from './MobileTaskTeam';
import { MobileTaskAlert, taskAlertRecipients } from './MobileTaskAlert';
import { TaskTicketInline } from './TaskTicketInline';

const QUIET = 'text-role-caption text-text-muted';
/**
 * The sheet's sections carry no headings (P1, owner 2026-10-03: "the context
 * is self-explanatory"): a hairline and space split them (P4), the screen
 * reader still hears each one's name through `aria-label`.
 */
const SECTION = 'mt-4 border-t border-border-hairline pt-3';
const ProjectGlyph = TASK_BOARD_TYPE_FACE.project.icon;

/** The one L2 surface open at a time (HIG: one sheet at a time from the main interface). */
type Panel = 'timer' | TaskLogChannel | 'person' | 'alert' | 'video-link' | 'email' | 'cancel' | 'brief';

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
    <Sheet open={taskId != null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* The bar paints its own ✕, so the sheet's corner X is off. */}
      <SheetContent side="bottom" size="full" showCloseButton={false} aria-describedby={undefined}>
      {/* pb-0: the task body's floating verb carries its own lift (ACTION_DOCK_LIFT). */}
      <SheetBody className="flex flex-col pt-2 pb-0">
      {taskId == null ? null : row ? (
        <MobileTaskBody key={row.id} row={row} nowMs={nowMs} canOpenTickets={canOpenTickets} onClose={onClose} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <IosBar
            title={<TaskTitle id={taskId} title={null} />}
            close={<CloseButton onClose={onClose} />}
          />
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
      </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** `#16012` then the task's own title — the identity the operator quotes, then what it is. Wraps, never truncates. */
function TaskTitle({ id, title }: { id: number; title: string | null }) {
  return (
    <SheetTitle className="text-role-data font-semibold leading-6 text-text-default" data-disclosure-slot="title">
      <span className="mr-1.5 font-normal tabular-nums text-text-muted">#{id}</span>
      {title}
    </SheetTitle>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <IosBarButton label="Close task" onClick={onClose} data-disclosure-slot="close">
      <X aria-hidden className="size-5" />
    </IosBarButton>
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
  const { user } = useAuth();
  const selfId = user?.staffId ?? null;
  const links = useTaskLinks(row.id);
  const media = useTaskMedia(row.id);
  const docs = useTaskDocuments(row.id);
  const setStatus = useSetTaskStatus();
  const setDeadline = useSetTaskDeadline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const closePanel = () => setPanel(null);

  const lessons = useMemo(() => taskLessons(media.videos, media.links), [media.videos, media.links]);
  const stills = useMemo(() => taskStills(media.photos, media.links), [media.photos, media.links]);
  // The sheet's ONE player: it leads the scroll, and Media's lesson rows drive it.
  const player = useLessonPlayer(lessons, !media.loading);
  const playerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLElement>(null);

  const due = taskDeadlineFact(row.deadlineAtMs, nowMs);
  const status = taskStatusOf(row);
  const open = isTaskDeskOpen(row.status);
  const notStarted = open && row.status !== 'IN_PROGRESS' && row.startedAtMs == null;
  const pending = setStatus.isPending;
  const verbError = setStatus.error ?? setDeadline.error;
  const timer = usePomodoroClock({ kind: 'task', id: row.id, canRun: open });

  const title = taskDeskTitle(row);
  const projectName = row.projectName?.trim() || null;
  const brief = taskBriefBody(row);
  const recipients = taskAlertRecipients(row.assignees, selfId);
  // A reminder that already fired (or sits on finished work) is history, not state — the row keeps it off (P1).
  const reminder =
    row.remindAtMs == null || !open || row.remindAtMs <= nowMs ? null : format(new Date(row.remindAtMs), 'MMM d · h:mm a');

  // The ticket read in line: the task's own ticket, else the first linked one (repairs link theirs).
  const linkedTicket = links.links.find((link) => link.kind === 'ticket');
  const anchorTicket = taskDeskTicketNumber(row);
  const inlineTicket = canOpenTickets ? (anchorTicket ?? (linkedTicket ? Number(linkedTicket.label) || null : null)) : null;
  const inlineTicketStatus = anchorTicket != null ? (row.ticket?.status ?? null) : (linkedTicket?.ticket?.status ?? null);

  const setTo = (target: TaskStatus) => {
    // A canceled task leaves the viewer's list, so the sheet goes with it.
    setStatus.mutate({ row, target }, target === 'CANCELED' ? { onSuccess: onClose } : undefined);
  };

  /*
   * ONE prominent verb (SURFACE_LAW R2; HIG: "Only specify one primary action"): Start while nobody
   * has picked it up, then Mark Done, then Reopen once it is finished. Mark Done closes the sheet —
   * the row striking through on the list is the answer to "did it take?".
   */
  const primary = notStarted
    ? { label: pending ? 'Starting…' : 'Start', icon: <Play aria-hidden className="h-5 w-5" />, run: () => setTo('IN_PROGRESS') }
    : open
      ? {
          label: pending ? 'Saving…' : 'Mark Done',
          icon: <Check aria-hidden className="h-5 w-5" />,
          run: () => setStatus.mutate({ row, target: 'DONE' }, { onSuccess: onClose }),
        }
      : row.status === 'DONE'
        ? { label: pending ? 'Saving…' : 'Reopen', icon: null, run: () => setTo('TODO') }
        : null;

  const uploading = media.uploading;

  const menuQuick: IosMenuItem[] = [
    { id: 'timer', label: 'Timer', icon: Timer, onSelect: () => setPanel('timer') },
    { id: 'call', label: 'Call', icon: Phone, onSelect: () => setPanel('call') },
    { id: 'note', label: 'Note', icon: NotebookPen, onSelect: () => setPanel('note') },
  ];
  const menuGroups: IosMenuItem[][] = [
    [
      { id: 'add-person', label: 'Add Person…', icon: UserPlus, onSelect: () => setPanel('person') },
      ...(recipients.length > 0
        ? [{ id: 'send-alert', label: 'Send Alert…', icon: Bell, onSelect: () => setPanel('alert') }]
        : []),
    ],
    [
      {
        id: 'add-media',
        label: 'Add Photo or Video…',
        icon: Camera,
        disabled: uploading != null,
        onSelect: () => fileRef.current?.click(),
      },
      { id: 'add-video-link', label: 'Add Video Link…', icon: Link2, onSelect: () => setPanel('video-link') },
      { id: 'link-email', label: 'Link Customer Email…', icon: Mail, onSelect: () => setPanel('email') },
    ],
    open ? [{ id: 'cancel-task', label: 'Cancel Task', icon: XCircle, destructive: true, onSelect: () => setPanel('cancel') }] : [],
  ];

  const hasMedia = lessons.length > 0 || stills.length > 0;

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

      {/* L1 — what the operator decides with; everything else is one tap away (src/lib/disclosure). */}
      <div className="shrink-0 border-b border-border-hairline" data-disclosure-zone="l1">
        <IosBar
          title={<TaskTitle id={row.id} title={title} />}
          tools={
            <>
              <PomodoroTimerFace clock={timer} onOpen={() => setPanel('timer')} />
              <IosMoreMenu quick={menuQuick} groups={menuGroups} />
            </>
          }
          close={<CloseButton onClose={onClose} />}
        />
        {/* P1 — corners: the status dropdown top-left (the quick slider lives inside it), the time top-right. */}
        <MobileTaskStatus
          status={status}
          pending={pending}
          onSet={setTo}
          trailing={
            <>
              {reminder ? (
                <span className="flex items-center gap-1 text-role-caption tabular-nums text-text-muted">
                  <Bell aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">Reminder</span>
                  {reminder}
                </span>
              ) : null}
              {/* P5 — the due date is an exact value: the house date switcher (presets + calendar + Clear). */}
              <DateRangePickerField
                variant="compact"
                value={taskDueDay(row.deadlineAtMs)}
                onChange={(day) => setDeadline.mutate({ taskId: row.id, deadlineAt: taskDueInstantIso(day) })}
                presets={TASK_DUE_PRESETS}
                onClear={() => setDeadline.mutate({ taskId: row.id, deadlineAt: null })}
                faceLabel={due?.text ?? 'Set due date'}
                ariaLabel="Due date"
                disabled={setDeadline.isPending}
                className={cn(
                  'min-h-11 w-auto border-transparent bg-transparent px-1.5 text-role-caption font-medium',
                  !due || !open
                    ? 'text-text-muted'
                    : due.overdue
                      ? 'text-text-danger'
                      : due.urgent
                        ? 'font-semibold text-orange-700 dark:text-orange-300'
                        : 'text-text-muted',
                )}
              />
            </>
          }
        />
        {/* WHO · WHERE, read-only: the project (only when the title is not already it) and the people. */}
        {row.assignees.length > 0 || (projectName && projectName !== title) ? (
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-2" data-testid="mobile-task-team">
            {projectName && projectName !== title ? (
              <span
                className={cn('inline-flex min-w-0 items-center gap-1 text-role-caption font-medium', TASK_BOARD_TYPE_FACE.project.text)}
                data-disclosure-slot="project"
              >
                <ProjectGlyph aria-hidden className="h-4 w-4 shrink-0" />
                <span className="sr-only">Project</span>
                <span className="min-w-0 break-words">{projectName}</span>
              </span>
            ) : null}
            <MobileTaskPeople people={row.assignees} />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4" data-disclosure-zone="body">
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

        {/* The ticket, in line (owner 2026-10-03) — its conversation, not a door to it. */}
        {inlineTicket != null ? <TaskTicketInline ticketNumber={inlineTicket} status={inlineTicketStatus} nowMs={nowMs} /> : null}

        {/* The brief never restates the title (one fact, one place) — `taskBriefBody` drops that line. */}
        {brief ? (
          <section aria-label="Brief" className={cn('relative', inlineTicket != null ? SECTION : 'pt-3')}>
            <IconButton
              onClick={() => setPanel('brief')}
              ariaLabel="Read the brief full screen"
              size="touch"
              icon={<Maximize2 aria-hidden className="h-4 w-4" />}
              className="float-right -mr-1 -mt-1 ml-2"
              data-testid="mobile-task-brief-expand"
            />
            <MarkdownRenderer content={brief} live="phone" />
          </section>
        ) : null}

        {/* Documents read INLINE, in full, with their comments (owner 2026-10-03) — never behind a door. */}
        {docs.documents.map((doc) => (
          <section key={doc.id} aria-label={doc.title} className={SECTION}>
            <TaskDocumentInline taskId={row.id} doc={doc} />
          </section>
        ))}
        {docs.loading ? <p className={cn(QUIET, 'pt-3')}>Loading documents…</p> : null}

        <section aria-label="Activity" className={cn(SECTION, 'empty:hidden')}>
          {/* The thread above already shows the ticket's comments; the stream does not repeat them. */}
          <MobileTaskFollowUps taskId={row.id} ticketNumber={inlineTicket != null ? null : anchorTicket} nowMs={nowMs} />
        </section>

        {hasMedia ? (
          <section ref={mediaRef} aria-label="Media" className={cn(SECTION, 'scroll-mt-2')}>
            <MobileTaskMedia
              lessons={lessons}
              stills={stills}
              playingKey={player.current?.key ?? null}
              loading={false}
              onPlay={(lessonKey) => {
                player.play(lessonKey);
                playerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }}
              onRenameLink={(id, linkTitle) => media.updateLink.mutateAsync({ id, title: linkTitle })}
              onRemoveLink={(id) => media.removeLink.mutate(id)}
              onRemoveVideo={(id) => media.removeVideo.mutate(id)}
            />
          </section>
        ) : null}

        <section aria-label="Linked records" className={cn(SECTION, 'empty:hidden')}>
          <TaskLinkDoors
            row={row}
            links={links.links}
            loading={links.loading}
            canOpenTickets={canOpenTickets}
            inlineTicket={inlineTicket}
          />
          <TaskEmailLinks taskId={row.id} />
        </section>
      </div>

      {verbError ? (
        <p role="alert" className="shrink-0 px-1 pt-2 text-role-micro text-text-danger">
          {verbError.message}
        </p>
      ) : null}
      {uploading ? (
        <p role="status" className="shrink-0 px-1 pt-2 text-role-caption tabular-nums text-text-muted">
          Uploading {Math.min(uploading.done + 1, uploading.total)}/{uploading.total}
          {uploading.fraction != null ? ` · ${Math.round(uploading.fraction * 100)}%` : ''}
        </p>
      ) : null}
      {media.problems.length > 0 ? (
        <div role="alert" className="flex shrink-0 items-start gap-2 px-1 pt-2 text-role-caption text-text-danger">
          <span className="min-w-0 flex-1">{media.problems.join(' · ')}</span>
          <button type="button" onClick={media.dismissProblems} className="min-h-11 shrink-0 px-2 font-semibold">
            Dismiss
          </button>
        </div>
      ) : null}
      {/* R9 — a withdrawn task has no verb, and the disabled face says why. The verb floats
          on the sheet's floor: no rule or bar above it (owner 2026-10-03). */}
      <div className={cn('flex shrink-0 items-center px-1', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)} data-disclosure-zone="dock">
        <Button
          variant="primary"
          size="lg"
          className="min-h-12 flex-1"
          icon={primary?.icon ?? undefined}
          disabled={primary == null || pending}
          onClick={primary?.run}
          data-disclosure-slot="primary"
        >
          {primary?.label ?? 'Withdrawn'}
        </Button>
      </div>

      {/* L2 — one at a time. */}
      <PomodoroTimerSheet clock={timer} open={panel === 'timer'} onOpenChange={(next) => setPanel(next ? 'timer' : null)} />
      <MobileTaskLogSheet
        taskId={row.id}
        channel={panel === 'call' || panel === 'note' ? panel : null}
        nowMs={nowMs}
        onClose={closePanel}
      />
      <MobileTaskAddPerson
        taskId={row.id}
        people={row.assignees}
        open={panel === 'person'}
        onOpenChange={(next) => setPanel(next ? 'person' : null)}
      />
      {recipients.length > 0 ? (
        <MobileTaskAlert
          taskId={row.id}
          recipients={recipients}
          selfId={selfId}
          ticketNumber={anchorTicket}
          open={panel === 'alert'}
          onOpenChange={(next) => setPanel(next ? 'alert' : null)}
        />
      ) : null}
      <Sheet open={panel === 'video-link'} onOpenChange={(next) => setPanel(next ? 'video-link' : null)}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Add Video Link</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <MobileMediaAddBar
              onAdd={async (body) => {
                await media.addLink.mutateAsync(body);
                closePanel();
              }}
              onPick={() => fileRef.current?.click()}
              uploading={uploading}
              problems={media.problems}
              onDismissProblems={media.dismissProblems}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
      <Sheet open={panel === 'email'} onOpenChange={(next) => setPanel(next ? 'email' : null)}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Link Customer Email</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {panel === 'email' ? <TaskEmailLinkForm taskId={row.id} onDone={closePanel} /> : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
      {/* HIG: a destructive menu item confirms in a sheet away from the menu — the house ConfirmSheet. */}
      <ConfirmSheet
        open={panel === 'cancel'}
        onClose={closePanel}
        title="Cancel Task?"
        message={`“${title}” leaves everyone's list. A canceled task cannot be reopened.`}
        confirmLabel="Cancel Task"
        cancelLabel="Keep Task"
        destructive
        onConfirm={() => setTo('CANCELED')}
      />
      {/* The phone's reader: the same markdown, full height, nothing else on it. */}
      <Sheet open={panel === 'brief'} onOpenChange={(next) => setPanel(next ? 'brief' : null)}>
        <SheetContent side="bottom" size="full" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Brief</SheetTitle>
          </SheetHeader>
          <SheetBody data-testid="mobile-task-brief-reader">
            <p className="pb-3 text-role-caption text-text-muted">{title}</p>
            <MarkdownRenderer content={brief ?? ''} live="phone" />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
