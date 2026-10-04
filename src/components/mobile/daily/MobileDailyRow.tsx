'use client';

/**
 * One row of the phone checklist — the check, the title, the doors.
 * (operator 2026-09-15).
 */

import { ChevronRight, Pencil, Ticket } from '@/components/Icons';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { IconButton } from '@/design-system/primitives/IconButton';
import { StruckLabel } from '@/design-system/components/StruckLabel';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import type { TaskStatus } from '@/design-system/tokens/task-status';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { cornerClass, MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface MobileDailyRowOwner {
  staffId: number;
  name: string;
}

export function MobileDailyRow({
  itemId,
  rowKey,
  title,
  done,
  once = false,
  owner = null,
  due = null,
  dueTone = 'muted',
  subtitle = null,
  ticketId = null,
  ticketStatus = null,
  taskStatus,
  detail = 'edit',
  onToggle,
  onOpenDetail,
  onOpenTicket,
}: {
  itemId: number;
  /**
   * DOM identity. Two stores number their rows independently — daily check 7
   * and task 7 are different rows — so the checkbox id is keyed on this, not
   * on the bare number. Defaults to the check namespace.
   */
  rowKey?: string;
  title: string;
  done: boolean;
  /** Paints the "Today only" caption — the exception marker. */
  once?: boolean;
  /** The one-off's owner; null on recurring and unowned rows. */
  owner?: MobileDailyRowOwner | null;
  /**
   * A work row's WHEN — `Due today`, `Overdue` — the caption's far left
   * (P1: the sort key sits where the eye starts every scan).
   */
  due?: string | null;
  /**
   * `danger` = overdue (red); `urgent` = due today or tomorrow (orange, owner
   * 2026-09-29: tomorrow must already feel urgent). The only tones the due may raise.
   */
  dueTone?: 'muted' | 'urgent' | 'danger';
  /**
   * The caption's trailing context — the record (`Carton 4471`). The
   * checklist half uses {@link once} for the same slot, so a row never grows
   * a second sub-line whichever store it came from.
   */
  subtitle?: string | null;
  /** Linked Zendesk ticket — paints the rightmost orange door. Null = plain task. */
  ticketId?: number | null;
  /** That ticket's helpdesk status (`status_cache`) — its colour pill follows the task's status on the caption. */
  ticketStatus?: string | null;
  /**
   * A task row's status (`taskStatusOf`). Its pill paints on every open task
   * — To do included, so the column aligns (P1); Done is the strike.
   */
  taskStatus?: TaskStatus;
  /** What the hard-right door promises. */
  detail?: 'edit' | 'record';
  onToggle: (next: boolean) => void;
  onOpenDetail: () => void;
  /** Opens the ticket thread. */
  onOpenTicket?: () => void;
}) {
  const checkboxId = `m-daily-${rowKey ?? `check-${itemId}`}`;
  const statusPill = taskStatus && taskStatus !== 'DONE' ? <TaskStatusPill status={taskStatus} size="sm" /> : null;
  const caption = once || due != null || subtitle != null || Boolean(ticketStatus) || statusPill != null;

  return (
    <li
      data-daily-item-id={itemId}
      data-done={done}
      data-once={once}
      className={cn(
        'border border-border-hairline bg-surface-card px-3',
        // Touch floor: the row is taller than the 44px minimum because the
        // label inside it is the tick target, not the 20px box. A caption adds
        // its own line, so the floor only binds on caption-less rows.
        caption ? 'flex items-start gap-3 py-2' : 'flex items-center gap-3 min-h-14',
        MOBILE_ROW_CORNER,
      )}
    >
      {/* Round, matching the desk's Reminders list — ONE shape for one list
          (operator 2026-09-23): the phone painted the DS Checkbox's default
          square while the desk painted `cornerClass('pill')`. */}
      <Checkbox
        id={checkboxId}
        checked={done}
        onCheckedChange={(next) => onToggle(next === true)}
        className={cn('size-5 border-border-emphasis', cornerClass('pill'), caption && 'mt-0.5')}
      />
      <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer select-none">
        <StruckLabel struck={done}>
          <span className="block text-role-data text-text-default">{title}</span>
        </StruckLabel>
        {caption ? (
          <span
            // Caption size in the clean sans at medium weight — never the condensed micro cut (owner 2026-10-03: subtitles must read easily).
            className="mt-0.5 flex items-center gap-1.5 text-role-caption font-medium text-text-muted"
          >
            {/* P1: WHEN first, then the task's STATE, then the ticket's — the desk row's order. */}
            {due ? (
              <span
                className={cn(
                  'shrink-0',
                  dueTone === 'danger'
                    ? 'text-text-danger'
                    : dueTone === 'urgent'
                      ? 'font-semibold text-orange-700 dark:text-orange-300'
                      : undefined,
                )}
              >
                {due}
              </span>
            ) : null}
            {statusPill}
            {ticketStatus ? <TicketStatusPill status={ticketStatus} /> : null}
            {subtitle != null ? <span className="min-w-0 truncate">{subtitle}</span> : once ? 'Today only' : null}
            {owner ? (
              <span className="flex min-w-0 items-center gap-1">
                <StaffAvatar staffId={owner.staffId} name={owner.name} size="xs" alt="" />
                <StaffBadge staffId={owner.staffId} name={owner.name} className="truncate" />
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
      {/*
 * The ticket glyph, on the right edge (operator 2026-09-15:
 * The ticket glyph, on the right edge (operator 2026-09-15: *"just the
 */}
      {ticketId != null ? (
        onOpenTicket ? (
          <IconButton
            onClick={onOpenTicket}
            ariaLabel={`Open ticket #${ticketId}`}
            size="touch"
            icon={<Ticket aria-hidden className="h-5 w-5 text-text-warning" />}
            className="shrink-0"
          />
        ) : (
          // The house `Ticket` takes only `className` and hardcodes `aria-hidden`
          // — correct here: the row's own label already reads the title, and a
          // mark that cannot be pressed has nothing to announce.
          <Ticket className="ml-0.5 h-4 w-4 shrink-0 text-text-warning" />
        )
      ) : null}
      {/*
 * The EDIT door — pencil, hard right (operator 2026-09-15:
 * The EDIT door — pencil, hard right (operator 2026-09-15: *"display a
 */}
      <IconButton
        onClick={onOpenDetail}
        ariaLabel={detail === 'record' ? `Open ${title}` : `Edit ${title}`}
        size="touch"
        icon={
          detail === 'record' ? (
            <ChevronRight aria-hidden className="h-5 w-5" />
          ) : (
            <Pencil aria-hidden className="h-5 w-5" />
          )
        }
        className="shrink-0"
      />
    </li>
  );
}
