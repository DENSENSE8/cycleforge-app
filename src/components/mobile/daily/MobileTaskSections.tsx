'use client';

/** The task sheet's LEAVES — media, documents, linked records and one open document — each a presentational face of what… */

import Link from 'next/link';
import type { ReactNode } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Play } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { formatMegabytes } from '@/lib/photos/video-upload-rules';
import {
  TASK_DESK_RECORD_NOUN,
  taskDeskRecordHref,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import type { TaskDocumentMeta } from '@/lib/tasks/task-documents-shared';
import {
  TASK_LINK_NOUN,
  type TaskLink,
  type TaskMediaPhoto,
  type TaskMediaVideo,
} from '@/lib/tasks/task-links-shared';
import { useTaskDocument } from '@/lib/tasks/use-task-workspace';
import { getTrackingUrl } from '@/lib/tracking-format';
import { cn } from '@/utils/_cn';
import type { TaskMediaLink } from '@/lib/tasks/media-links';

export const TASK_SECTION_LABEL =
  'pb-2 pt-5 text-role-micro font-semibold text-text-muted';
const QUIET = 'text-role-caption text-text-muted';
const ROW = cn(
  'flex min-h-14 w-full items-center gap-3 border border-border-hairline bg-surface-card px-3 py-2 text-left',
  MOBILE_ROW_CORNER,
);

/** One piece of task media on one timeline (oldest first): */
type TaskMediaItem =
  | { kind: 'photo'; photo: TaskMediaPhoto }
  | { kind: 'video'; video: TaskMediaVideo }
  | { kind: 'link'; link: TaskMediaLink };

export function taskMediaTimeline(
  photos: readonly TaskMediaPhoto[],
  videos: readonly TaskMediaVideo[],
  links: readonly TaskMediaLink[],
): TaskMediaItem[] {
  const items: TaskMediaItem[] = [
    ...photos.map((photo) => ({ kind: 'photo' as const, photo })),
    ...videos.map((video) => ({ kind: 'video' as const, video })),
    ...links.filter((link) => link.kind === 'photo').map((link) => ({ kind: 'link' as const, link })),
  ];
  const stamp = (item: TaskMediaItem) =>
    Date.parse(item.kind === 'photo' ? item.photo.createdAt : item.kind === 'video' ? item.video.createdAt : item.link.createdAt);
  // Stable sort: the photos-first spread breaks ties.
  return items.sort((a, b) => stamp(a) - stamp(b));
}

/** Three-up square grid; a tap opens the full-screen viewer at that item. */
export function TaskMediaGrid({
  items,
  onOpen,
}: {
  items: readonly TaskMediaItem[];
  onOpen: (index: number) => void;
}) {
  let photoNumber = 0;
  let videoNumber = 0;
  const tile = cn(
    'relative block aspect-square w-full overflow-hidden border border-border-hairline bg-surface-sunken active:opacity-90',
    MOBILE_ROW_CORNER,
  );
  return (
    <ul className="grid grid-cols-3 gap-1.5" aria-label="Task photos and videos">
      {items.map((item, index) => {
        if (item.kind === 'video') {
          videoNumber += 1;
          const { video } = item;
          return (
            <li key={`v${video.id}`}>
              {/* ds-raw-button: square video tile, not a text/action button */}
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={`Play video ${videoNumber}`}
                className={tile}
              >
                <video
                  src={`${video.url}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  aria-hidden
                  className="pointer-events-none h-full w-full bg-black object-cover"
                />
                <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-scrim/45 text-white">
                    <Play className="h-5 w-5" />
                  </span>
                </span>
                <span className="absolute bottom-1 right-1 rounded-full bg-scrim/60 px-1.5 text-role-micro font-semibold tabular-nums text-white">
                  {formatMegabytes(video.sizeBytes)}
                </span>
              </button>
            </li>
          );
        }
        photoNumber += 1;
        const face =
          item.kind === 'photo'
            ? { key: `p${item.photo.id}`, src: item.photo.thumbUrl }
            : { key: `l${item.link.id}`, src: item.link.thumbnailUrl ?? item.link.embedUrl };
        return (
          <li key={face.key}>
            {/* ds-raw-button: square image tile, not a text/action button */}
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`Open photo ${photoNumber}`}
              className={tile}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={face.src}
                alt={`Task photo ${photoNumber}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function documentCaption(doc: TaskDocumentMeta): string {
  if (doc.source === 'repo') return doc.repoPath ?? 'Plan file';
  return doc.createdBy ? `Written by ${doc.createdBy.name}` : 'Written in the app';
}

/** The task's markdown documents; a tap opens one inside the sheet. */
export function TaskDocumentList({
  documents,
  onOpen,
}: {
  documents: readonly TaskDocumentMeta[];
  onOpen: (docId: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => (
        <li key={doc.id}>
          {/* ds-raw-button: full-width list row door, not a text/action button */}
          <button type="button" onClick={() => onOpen(doc.id)} className={ROW}>
            <FileText aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-role-data text-text-default">{doc.title}</span>
              <span className="block truncate text-role-micro text-text-muted">{documentCaption(doc)}</span>
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One document, rendered, with a back door to the task. */
export function TaskDocumentView({
  taskId,
  docId,
  onBack,
}: {
  taskId: number;
  docId: number;
  onBack: () => void;
}) {
  const { data: doc, isLoading, error } = useTaskDocument(taskId, docId);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 pb-2">
        <IconButton
          onClick={onBack}
          ariaLabel="Back to the task"
          size="touch"
          icon={<ChevronLeft aria-hidden className="h-5 w-5" />}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-role-data font-semibold text-text-default">
            {doc?.title ?? 'Document'}
          </span>
          {doc ? (
            <span className="block truncate text-role-micro text-text-muted">{documentCaption(doc)}</span>
          ) : null}
        </span>
      </div>
      {isLoading ? <p className={QUIET}>Loading the document…</p> : null}
      {error ? (
        <p role="alert" className={QUIET}>
          {error instanceof Error ? error.message : 'Could not load the document.'}
        </p>
      ) : null}
      {doc && doc.content == null ? (
        <p className={QUIET}>This plan file no longer exists in the codebase.</p>
      ) : null}
      {doc?.content ? <MarkdownRenderer content={doc.content} /> : null}
    </div>
  );
}

function RecordDoor({
  noun,
  label,
  context,
  href,
  external = false,
}: {
  noun: string;
  label: string;
  context: string | null;
  href: string | null;
  external?: boolean;
}) {
  const body: ReactNode = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-role-micro text-text-faint">{noun}</span>
        <span className="block truncate font-mono text-role-data text-text-default">{label}</span>
        {context ? <span className="block truncate text-role-micro text-text-muted">{context}</span> : null}
      </span>
      {href ? (
        external ? (
          <ExternalLink aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
        )
      ) : null}
    </>
  );
  if (!href) return <div className={ROW}>{body}</div>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={ROW}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={ROW}>
      {body}
    </Link>
  );
}

/** A raw status (`open`, `IN_TRANSIT`) as sentence case (`Open`, `In transit`). */
function statusFace(status: string | null | undefined): string | null {
  const s = status?.trim().replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

function linkContext(link: TaskLink): string | null {
  if (link.kind === 'ticket') {
    return [link.ticket?.subject, statusFace(link.ticket?.status)].filter(Boolean).join(' · ') || null;
  }
  if (link.kind === 'tracking') {
    const carrier = [link.tracking?.carrier, statusFace(link.tracking?.status)].filter(Boolean).join(' · ');
    const order = link.order ? `→ Order ${link.order.orderNumber ?? link.order.id}` : 'No order matched';
    return [carrier, order].filter(Boolean).join(' · ');
  }
  if (!link.order) return null;
  const lines = link.order.lineCount > 1 ? `${link.order.lineCount} lines · ` : '';
  return `${lines}${link.order.title ?? link.order.sku ?? ''}` || null;
}

function linkDoor(link: TaskLink, canOpenTickets: boolean): { href: string | null; external: boolean } {
  if (link.kind === 'tracking') return { href: getTrackingUrl(link.label), external: true };
  if (link.kind === 'ticket') {
    const number = link.ticket?.providerTicketId ?? null;
    return { href: canOpenTickets && number != null ? `/m/t/${number}` : null, external: false };
  }
  const orderId = link.order?.id ?? link.entityId;
  return {
    href: orderId != null ? taskDeskRecordHref({ entityType: 'order', entityId: orderId }, 'phone') : null,
    external: false,
  };
}

/** The anchor record, then every linked order / tracking / ticket. */
export function TaskLinkDoors({
  row,
  links,
  loading,
  canOpenTickets,
}: {
  row: TaskDeskRow;
  links: readonly TaskLink[];
  loading: boolean;
  /** `integrations.zendesk` — without it a ticket stays a mark, never a door. */
  canOpenTickets: boolean;
}) {
  const anchorIsTicket = row.entityType === 'support_ticket';
  const anchorHref = anchorIsTicket && !canOpenTickets ? null : taskDeskRecordHref(row, 'phone');
  const anchorContext = anchorIsTicket
    ? [row.ticket?.subject, statusFace(row.ticket?.status)].filter(Boolean).join(' · ') || null
    : null;
  // A ticket is named by the number the operator quotes, never the registry id.
  const anchorLabel = anchorIsTicket ? `#${taskDeskTicketNumber(row) ?? row.entityId}` : String(row.entityId);
  return (
    <ul className="flex flex-col gap-2">
      {row.entityType != null ? (
        <li>
          <RecordDoor
            noun={`About · ${TASK_DESK_RECORD_NOUN[row.entityType] ?? 'Record'}`}
            label={anchorLabel}
            context={anchorContext}
            href={anchorHref}
          />
        </li>
      ) : null}
      {links.map((link) => {
        const door = linkDoor(link, canOpenTickets);
        return (
          <li key={link.id}>
            <RecordDoor
              noun={TASK_LINK_NOUN[link.kind]}
              label={link.kind === 'ticket' ? `#${link.label}` : link.label}
              context={linkContext(link)}
              href={door.href}
              external={door.external}
            />
          </li>
        );
      })}
      {loading ? <li className={QUIET}>Loading linked records…</li> : null}
    </ul>
  );
}
