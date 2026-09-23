'use client';

/**
 * One row of the phone checklist — the check, the title, the doors.
 *
 * Three facts, because a phone row is not a compound row: the desk's five
 * tracks (photo, order, dates, status, slack) do not fit, and everything this
 * row leaves out lives one tap deeper in the sheet (SURFACE_LAW §5 — cards +
 * BottomSheet). The `once` caption is the ONE extra line the row earns: it is
 * the exception marker ("only the exception is marked"), and it carries the
 * owner's avatar when the one-off belongs to someone. A fourth fact belongs in
 * the sheet, not here.
 *
 * The whole title is the tick target: `<button>` is a labelable element, so
 * `htmlFor` wiring gives pointer and keyboard ONE control with no second
 * handler. No glyph, no status blip: the row paints the plain title (operator
 * ruling 2026-09-15 — "it wouldn't even have icons"). The owner avatar stays,
 * because an owner is identity, not decoration.
 *
 * Two more hit areas ride the right edge, both 44px, in the order the operator
 * named them: the ticket glyph (a door to the thread, or a bare mark without
 * the permission) and then the PENCIL, hard right, which opens the detail
 * sheet. The row prints no id — that moved into the sheet's top-right corner
 * (operator 2026-09-15).
 *
 * The strike is {@link StruckLabel}, the same design-system face the desk's
 * compound cell paints — one animation for both surfaces.
 */

import { ChevronRight, Pencil, Ticket } from '@/components/Icons';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { IconButton } from '@/design-system/primitives/IconButton';
import { StruckLabel } from '@/design-system/components/StruckLabel';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export interface MobileDailyRowOwner {
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
  subtitle = null,
  subtitleTone = 'muted',
  ticketId = null,
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
   * The one caption line a work row earns: `Due today · Carton 4471`. The
   * checklist half uses {@link once} for the same slot, so a row never grows a
   * second sub-line whichever store it came from.
   */
  subtitle?: string | null;
  /** `danger` is the overdue register — the only tone a caption may raise. */
  subtitleTone?: 'muted' | 'danger';
  /** Linked Zendesk ticket — paints the rightmost orange door. Null = plain task. */
  ticketId?: number | null;
  /**
   * What the hard-right door promises. `edit` opens the item's own sheet
   * (pencil); `record` walks to the order/carton/thread the task points at
   * (chevron). A task has no editable list entry, so it never wears a pencil.
   */
  detail?: 'edit' | 'record';
  onToggle: (next: boolean) => void;
  onOpenDetail: () => void;
  /**
   * Opens the ticket thread. OMITTED when the viewer lacks `integrations.zendesk`
   * — the glyph then stays a MARK, because recognition ("this row is a ticket")
   * is permission-free while the thread is not, and the house rule is that a
   * door which 403s is worse than an absent one.
   */
  onOpenTicket?: () => void;
}) {
  const checkboxId = `m-daily-${rowKey ?? `check-${itemId}`}`;
  const caption = once || subtitle != null;
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
      <Checkbox
        id={checkboxId}
        checked={done}
        onCheckedChange={(next) => onToggle(next === true)}
        className={caption ? 'mt-0.5 size-5' : 'size-5'}
      />
      <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer select-none">
        <StruckLabel struck={done}>
          <span className="block text-role-data text-text-default">{title}</span>
        </StruckLabel>
        {caption ? (
          <span
            className={cn(
              'mt-0.5 flex items-center gap-1.5 text-role-micro',
              subtitleTone === 'danger' ? 'text-text-danger' : 'text-text-muted',
            )}
          >
            {subtitle ?? 'Today only'}
            {owner ? (
              <span className="flex min-w-0 items-center gap-1">
                <StaffAvatar staffId={owner.staffId} name={owner.name} size="xs" alt="" />
                <span className="truncate">{owner.name}</span>
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
      {/*
       * The ticket glyph, on the right edge (operator 2026-09-15: *"just the
       * ticket icon most right and the customer will be able to recognize and
       * identify that it's an open ticket display"*). It sits INSIDE the pencil
       * now — the same ruling that put the pencil hard right moved this one
       * notch in, and the two never compete because a plain task has no ticket
       * glyph at all. Always orange — `text-text-warning` is the house amber,
       * and the glyph means one thing wherever it appears.
       *
       * Present ONLY on a row carrying a real `ZENDESK_TICKET` link, so it is
       * never furniture on a plain task. It paints in TWO registers, and the
       * difference is a permission, not a preference:
       *
       *  - a DOOR (44px `size="touch"` box) to `/m/t/[ticketId]` — the phone's
       *    thread + reply surface — for a viewer who may read the helpdesk
       *    (operator: *"I can open the ticket and reply to the ticket within
       *    the mobile app"*);
       *  - a bare MARK for everyone else. Recognition is permission-free; the
       *    thread is not, and a door that 403s is worse than an absent one.
       *
       * The host decides which by passing `onOpenTicket` or omitting it, so the
       * row never reads a permission itself.
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
       * The EDIT door — pencil, hard right (operator 2026-09-15: *"display a
       * pencil icon on the most right of the to-do list row so I can edit more
       * details and removing the ID from the mobile display"*).
       *
       * It replaced the bare `#id` handle that used to sit here. The id was
       * doing two jobs badly: it was the row's only door to detail, and it
       * spent a column of a 390px row printing a number an operator on the
       * floor never quotes — that is a DESK habit, from a surface where a lead
       * says "check 7" across a queue. The number is not lost; it moved to the
       * top-right of the sheet this pencil opens, where it is a handle at the
       * moment you need one and nowhere else.
       *
       * A pencil, not a chevron: the sheet behind it EDITS the item, and the
       * glyph should promise the verb it delivers.
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
