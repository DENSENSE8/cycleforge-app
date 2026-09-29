'use client';

/** The open TASK in Daily's compact record rail — the work needed to finish it without leaving the list. */

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  EvidenceDecisionBar,
  type EvidenceVerb,
} from '@/design-system/components/record-ledger/RecordEvidence';
import {
  isTaskDeskOpen,
  taskDeskRecordHref,
  taskDeskRecordLabel,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { parseMediaLink } from '@/lib/tasks/media-links';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { useTaskDocuments, useTaskLinks, useTaskMedia } from '@/lib/tasks/use-task-workspace';
import type { TaskDeskPatch } from '../useTaskDesk';
import { TaskBriefSection } from './TaskBriefSection';
import { TaskDocumentFace } from './TaskDocumentFace';
import { TaskDocumentsSection } from './TaskDocumentsSection';
import { TaskLinksSection } from './TaskLinksSection';
import { TaskMediaSection } from './TaskMediaSection';
import { TaskScheduleSection } from './TaskScheduleSection';

const TAB_LABEL_MAX = 22;

function filesOf(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []);
}

export function TaskEvidence({
  row,
  nowMs,
  pending,
  onPatch,
}: {
  row: TaskDeskRow;
  nowMs: number;
  pending: boolean;
  /** Resolves when the PATCH lands, so a draft can clear on success only. */
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
}) {
  useRecordView('task', row.id);
  const router = useRouter();
  const links = useTaskLinks(row.id);
  const media = useTaskMedia(row.id);
  const docs = useTaskDocuments(row.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  /** Which face of the job the column shows: */
  const [face, setFace] = useState<string>('task');
  useEffect(() => setFace('task'), [row.id]);

  const anchorTicket = taskDeskTicketNumber(row);
  const ticketNumbers = [
    ...(anchorTicket != null ? [anchorTicket] : []),
    ...links.links.flatMap((link) =>
      link.kind === 'ticket' && link.ticket?.providerTicketId != null ? [link.ticket.providerTicketId] : [],
    ),
  ].filter((n, i, all) => all.indexOf(n) === i);
  const faceTabs = [
    { id: 'task', label: 'Task' },
    ...docs.documents.map((doc) => ({
      id: `doc:${doc.id}`,
      // A plan title is a sentence; a tab is a handle. The full title heads the face.
      label: doc.title.length > TAB_LABEL_MAX ? `${doc.title.slice(0, TAB_LABEL_MAX - 1)}…` : doc.title,
    })),
    ...ticketNumbers.map((n) => ({ id: `ticket:${n}`, label: `Ticket #${n}` })),
  ];
  const [faceKind, faceId] = face.split(':');

  const { upload, addLink } = media;
  /** Paste is the fastest way in. */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = filesOf(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        void upload(files);
        return;
      }
      if (isEditableKeyTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!parseMediaLink(text).ok) return;
      event.preventDefault();
      addLink.mutateAsync({ url: text }).then(
        () => toast.success('Link added to media'),
        (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not add that link.'),
      );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [upload, addLink]);

  const open = isTaskDeskOpen(row.status);
  const recordHref = taskDeskRecordHref(row, 'desk');
  const recordLabel = taskDeskRecordLabel(row);
  const patch = (next: TaskDeskPatch) => void onPatch(next);

  const verbs: EvidenceVerb[] = [
    open
      ? { label: 'Mark done', primary: true, disabled: pending, onPress: () => patch({ status: 'DONE' }), testId: 'task-done' }
      : { label: 'Reopen', disabled: pending || row.status === 'CANCELED', onPress: () => patch({ status: 'OPEN' }) },
    ...(open && row.startedAtMs == null
      ? [{ label: 'Start', disabled: pending, onPress: () => patch({ status: 'IN_PROGRESS' }) }]
      : []),
    { label: 'Add media', disabled: media.uploading !== null, onPress: () => fileRef.current?.click() },
    ...(recordHref ? [{ label: `Open ${recordLabel}`, onPress: () => router.push(recordHref) }] : []),
  ];

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const files = filesOf(event.dataTransfer);
    setDragging(false);
    if (files.length === 0) return;
    event.preventDefault();
    void media.upload(files);
  };

  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', dragging && 'outline outline-2 -outline-offset-4 outline-mode-ink')}
      data-testid="task-evidence"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
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
        data-testid="task-media-input"
      />


      {faceTabs.length > 1 ? (
        <div className="border-b border-mode-rule px-4 py-2">
          <TabSwitch size="sm" scrollable tabs={faceTabs} activeTab={face} onTabChange={setFace} />
        </div>
      ) : null}

      {faceKind === 'ticket' ? (
        <div className="h-[calc(100dvh-14rem)] min-h-[28rem]" data-testid="task-ticket-face">
          <SupportTicketDetail ticketId={Number(faceId)} embedded />
        </div>
      ) : faceKind === 'doc' ? (
        <TaskDocumentFace taskId={row.id} docId={Number(faceId)} />
      ) : (
        <>
          <TaskBriefSection key={row.id} note={row.note} onSave={(note) => onPatch({ note })} />
          <TaskMediaSection
            photos={media.photos}
            videos={media.videos}
            loading={media.loading}
            uploading={media.uploading}
            onPick={() => fileRef.current?.click()}
            onDeletePhoto={(photo) => {
              if (window.confirm('Delete this photo? This cannot be undone.')) {
                media.removePhoto.mutate({ id: photo.id, url: photo.url });
              }
            }}
            onDeleteVideo={(video) => {
              if (window.confirm('Delete this video? This cannot be undone.')) media.removeVideo.mutate(video.id);
            }}
            links={media.links}
            onAddLink={(body) => media.addLink.mutateAsync(body)}
            onUpdateLink={(id, patch) => media.updateLink.mutateAsync({ id, ...patch })}
            onRemoveLink={(link) => {
              if (window.confirm('Remove this link from the task?')) media.removeLink.mutate(link.id);
            }}
          />
          <TaskDocumentsSection
            documents={docs.documents}
            loading={docs.loading}
            onAdd={(body) => docs.add.mutateAsync(body)}
            onRemove={(doc) => {
              if (window.confirm(`Remove “${doc.title}” from this task?`)) docs.remove.mutate(doc.id);
            }}
            onOpen={(doc) => setFace(`doc:${doc.id}`)}
          />
          <TaskLinksSection
            anchorLabel={recordLabel}
            anchorHref={recordHref}
            links={links.links}
            loading={links.loading}
            onAdd={(body) => links.add.mutateAsync(body)}
            onRemove={(link) => links.remove.mutate(link.id)}
            onOpenTicket={(n) => setFace(`ticket:${n}`)}
          />
          <TaskScheduleSection row={row} nowMs={nowMs} pending={pending} onPatch={patch} />
          <EvidenceDecisionBar verbs={verbs} />
        </>
      )}
    </div>
  );
}
