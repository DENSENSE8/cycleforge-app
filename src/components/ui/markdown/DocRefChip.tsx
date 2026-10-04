'use client';

/**
 * One live reference in a document (`#T16034`, `@Thuc`, `RS-77`, `#9431`,
 * `order:…`, `sku:…`) — painted from the record as it is NOW (P6). Each record
 * wears its house face (TaskStatusPill, TicketStatusPill, StaffBadge, the
 * repair state tone, the SKU identity title + photo) and opens in-app: a Link
 * to its door on this surface, or the product peek for a SKU on the desk.
 * Unresolved references stay the text the author wrote, marked as not found.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { repairStatusFace } from '@/design-system/tokens/repair-status';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { DUE_TONE_CLASS } from '@/design-system/tokens/task-due';
import { statusPillLabel } from '@/design-system/tokens/typography/presets';
import { openDetailStack } from '@/lib/detail-stacks/open-store';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { taskBoardDueFace } from '@/lib/task-board/task-board-model';
import { docRefKey, type DocRefKind, type DocTaskFace } from '@/lib/tasks/doc-live';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { taskLinkRepairHref } from '@/lib/tasks/task-links-shared';
import { cn } from '@/utils/_cn';
import { useDocRefFace, type DocSurface } from './doc-live-scope';

const CHIP =
  'mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-border-soft bg-surface-card px-1.5 align-middle text-role-caption leading-5 text-text-default no-underline';
const CHIP_DOOR = 'hover:border-border-default hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-1';
const HANDLE = 'shrink-0 font-mono text-[11px] font-semibold tabular-nums text-text-muted';
const TITLE = 'min-w-0 truncate';

export function taskDocHref(taskId: number, surface: DocSurface): string {
  return surface === 'phone' ? `/m/home?task=${taskId}` : `/?task=${taskId}&scope=everyone`;
}

/** A task's live face — shared by the reference chip and the `tasks` block row. */
export function TaskDueFace({ task, nowMs }: { task: DocTaskFace; nowMs: number }) {
  const due = taskBoardDueFace(task.deadlineAt ? Date.parse(task.deadlineAt) : null, nowMs);
  if (!due) return null;
  const done = task.status === 'DONE' || task.status === 'CANCELED';
  return (
    <span className={cn('shrink-0 whitespace-nowrap text-[11px] tabular-nums', done ? 'text-text-muted line-through' : DUE_TONE_CLASS[due.tone])}>
      {due.label}
    </span>
  );
}

function Door({ href, children, label }: { href: string; children: ReactNode; label: string }) {
  return (
    <Link href={href} aria-label={label} className={cn(CHIP, CHIP_DOOR)} data-doc-ref>
      {children}
    </Link>
  );
}

export function DocRefChip({ kind, value, children }: { kind: DocRefKind; value: string; children: ReactNode }) {
  const { surface, face } = useDocRefFace(docRefKey({ kind, value }));

  if (face === undefined) {
    return <span className="text-text-muted" data-doc-ref-loading>{children}</span>;
  }
  if (face === null) {
    return (
      <span
        title="Not found in this workspace"
        className="text-text-default underline decoration-dotted decoration-text-muted underline-offset-2"
        data-doc-ref-missing
      >
        {children}
      </span>
    );
  }

  switch (face.kind) {
    case 'task': {
      const { task } = face;
      const lead = task.owners[0];
      return (
        <Door href={taskDocHref(task.id, surface)} label={`Task ${task.id}: ${task.title}`}>
          <span className={HANDLE}>#T{task.id}</span>
          <span className={cn(TITLE, 'max-w-[24ch] font-medium')}>{task.title}</span>
          <TaskStatusPill status={taskStatusOf(task)} />
          <TaskDueFace task={task} nowMs={Date.now()} />
          {lead ? <StaffBadge staffId={lead.id} name={lead.name.split(' ')[0]} className="shrink-0 text-[11px] font-semibold" /> : null}
        </Door>
      );
    }
    case 'staff':
      return (
        <span className={CHIP} data-doc-ref>
          <StaffAvatar staffId={face.id} name={face.name} size="xs" />
          <StaffBadge staffId={face.id} name={face.name} className="font-semibold" />
        </span>
      );
    case 'repair': {
      const state = repairStatusFace(face.status);
      const tone = STATE_TONE_CLASSES[state.tone];
      return (
        <Door href={taskLinkRepairHref(face.id, surface)} label={`Repair RS-${face.id}`}>
          <span className={HANDLE}>RS-{face.id}</span>
          {face.title ? <span className={cn(TITLE, 'max-w-[22ch]')}>{face.title}</span> : null}
          <span className={cn('shrink-0 rounded-full px-1.5 leading-4 ring-1 ring-inset', statusPillLabel, tone.pill, tone.ring)}>
            {repairStatusOperatorLabel(state.label)}
          </span>
        </Door>
      );
    }
    case 'ticket':
      return (
        <Door
          href={surface === 'phone' ? `/m/t/${face.number}` : `/support?ticket=${face.number}`}
          label={`Ticket ${face.number}`}
        >
          <span className={HANDLE}>#{face.number}</span>
          {face.subject ? <span className={cn(TITLE, 'max-w-[24ch]')}>{face.subject}</span> : null}
          <TicketStatusPill status={face.status} />
        </Door>
      );
    case 'order':
      return (
        <Door href={`/dashboard?order=${face.id}`} label={`Order ${face.orderNumber}`}>
          <span className={HANDLE}>{face.orderNumber}</span>
          {face.title ? <span className={cn(TITLE, 'max-w-[22ch]')}>{face.title}</span> : null}
        </Door>
      );
    case 'sku': {
      const body = (
        <>
          {face.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog / Zoho URLs; next/image needs known hosts.
            <img src={face.imageUrl} alt="" loading="lazy" className="size-4 shrink-0 rounded-sm object-cover" />
          ) : null}
          <span className={cn(TITLE, 'max-w-[24ch] font-medium')}>{face.title || face.sku}</span>
          <span className={HANDLE}>{face.sku}</span>
        </>
      );
      // Phone: the product page. Desk: the product peek beside the work (TicketProduct's `sku` stack).
      return surface === 'phone' ? (
        <Door href={`/m/products/${encodeURIComponent(face.sku)}`} label={`Product ${face.sku}`}>
          {body}
        </Door>
      ) : (
        // ds-raw-button: an inline chip inside prose, not an action button
        <button
          type="button"
          onClick={() => openDetailStack({ kind: 'sku', id: face.sku })}
          aria-label={`Open product ${face.sku}`}
          className={cn(CHIP, CHIP_DOOR, 'cursor-pointer')}
          data-doc-ref
        >
          {body}
        </button>
      );
    }
  }
}
