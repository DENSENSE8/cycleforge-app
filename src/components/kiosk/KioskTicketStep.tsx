'use client';

/**
 * KioskTicketStep — the create-or-link question, mounted UNDER the signature on the repair flow's Review & sign step:
 * Operator 2026-09-15: *"after the customer has submitted their signature it
 */

import { Check, Link2, Loader2, Plus, Search, Ticket } from '@/components/Icons';
import { KioskChip, type KioskChipTone } from '@/components/kiosk/KioskChip';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { useKioskTicketSearch } from '@/components/kiosk/useKioskTicketSearch';
import type { TicketCandidate } from '@/components/support/link/useTicketSearch';
import {
  isKioskTicketChoiceComplete,
  type KioskTicketChoice,
} from '@/lib/kiosk/repair-ticket-choice';
import { MOBILE_SCAN_ROW_CORNER, cornerClass } from '@/design-system/tokens/radius';
// No inset here: the host step body already carries its px-4, and a second
// inset inside it would step the slider in from the paperwork.
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/** Helpdesk status → kiosk chip tone. */
const STATUS_TONE: Record<string, KioskChipTone> = {
  new: 'info',
  open: 'warning',
  pending: 'accent',
  hold: 'accent',
  solved: 'success',
  closed: 'success',
};

/** Short civil date for a candidate card. Display only. */
function candidateDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The label a picked ticket is remembered by, once the list has moved on. */
function kioskTicketLabel(ticket: TicketCandidate): string {
  const subject = ticket.subject?.trim();
  return subject ? `#${ticket.id} · ${subject}` : `#${ticket.id}`;
}

function CandidateCard({
  ticket,
  selected,
  onPick,
}: {
  ticket: TicketCandidate;
  selected: boolean;
  onPick: () => void;
}) {
  const tone = STATUS_TONE[ticket.status.toLowerCase()] ?? 'idle';
  return (
    <button
      type="button"
      /* ds-raw-button: */
      className={cn(
        'ds-raw-button flex w-full flex-col gap-2 border border-border-hairline bg-surface-card px-4 py-3 text-left transition-colors',
        MOBILE_SCAN_ROW_CORNER,
        selected ? 'bg-surface-accent' : 'hover:bg-surface-hover active:bg-surface-hover',
      )}
      aria-pressed={selected}
      onClick={onPick}
      data-testid="kiosk-ticket-candidate"
      data-ticket-id={ticket.id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-default">
          {ticket.subject?.trim() || 'No subject'}
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-text-default">
          #{ticket.id}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <KioskChip tone={tone} icon={<Ticket className="h-3.5 w-3.5" />}>
          {ticket.status || 'unknown'}
        </KioskChip>
        <KioskChip>{candidateDate(ticket.updatedAt || ticket.createdAt)}</KioskChip>
        {selected ? (
          <KioskChip tone="success" icon={<Check className="h-3.5 w-3.5" />}>
            Linked
          </KioskChip>
        ) : null}
      </div>
    </button>
  );
}

export function KioskTicketStep({
  choice,
  onChoose,
}: {
  /** The visit's decision, or null while nobody has answered. */
  choice: KioskTicketChoice | null;
  onChoose: (choice: KioskTicketChoice) => void;
}) {
  const linking = choice?.mode === 'attach';
  // Create is the DEFAULT position: an untouched control means a new ticket,
  // which is also what an untouched choice posts. See the slider note below.
  const creating = !linking;
  const pickedId = choice?.mode === 'attach' ? choice.ticketId : 0;
  const search = useKioskTicketSearch({ enabled: linking });

  const pick = (ticket: TicketCandidate) =>
    onChoose({ mode: 'attach', ticketId: ticket.id, ticketLabel: kioskTicketLabel(ticket) });

  return (
    <div className="flex flex-col gap-3 bg-surface-card">
      <p className={KIOSK_META}>
        The signed paperwork opens a support ticket. File a new one, or attach this drop-off to a
        conversation the customer already has.
      </p>

      {/*
 * ONE SLIDER, two sides.
 * ONE SLIDER, two sides. Operator 2026-09-15: *"the create new and the
 */}
      <div
        className={cn(
          'flex items-stretch gap-1 bg-surface-sunken p-1',
          cornerClass('pill'),
        )}
        role="group"
        aria-label="Support ticket"
      >
        <div className="min-w-0 flex-1">
          <KioskChip
            face="row"
            tone={creating ? 'thumb' : 'idle'}
            selected={creating}
            icon={<Plus className="h-5 w-5 shrink-0" />}
            onClick={() => onChoose({ mode: 'create' })}
            testId="kiosk-ticket-mode-create"
            // No `className` fill here:
            trailing={
              creating ? (
                <Check className="h-4 w-4 shrink-0 text-text-default" aria-hidden />
              ) : null
            }
            ariaLabel="Create a new support ticket"
          >
            Create new
          </KioskChip>
        </div>

        <div className="min-w-0 flex-1">
          <KioskChip
            face="row"
            tone={linking ? 'thumb' : 'idle'}
            selected={linking}
            icon={<Link2 className="h-5 w-5 shrink-0" />}
            /*
             * Slides to Link WITHOUT deciding: a zero id keeps
             * `isKioskTicketChoiceSettled` false, so the commit key stays
             * refused until a card below is tapped. Re-tapping keeps the pick.
             */
            onClick={() =>
              onChoose(linking ? choice : { mode: 'attach', ticketId: 0, ticketLabel: '' })
            }
            testId="kiosk-ticket-mode-link"
            trailing={
              isKioskTicketChoiceComplete(choice) && linking ? (
                <Check className="h-4 w-4 shrink-0 text-text-default" aria-hidden />
              ) : null
            }
            ariaLabel="Link an existing support ticket"
          >
            Link existing
          </KioskChip>
        </div>
      </div>

      {linking ? (
        <div className="flex flex-col gap-3" data-testid="kiosk-ticket-link-face">
          <KioskEntryField
            name="Search tickets by number, name or subject"
            value={search.ticketQuery}
            icon={<Search className="h-4 w-4" />}
            testId="kiosk-ticket-search"
            onChange={search.setTicketQuery}
          />

          {/* The pick, stated even when the current results no longer show it —
              see the docblock on why the decision outlives the result set. */}
          {pickedId > 0 ? (
            <p className={cn('flex items-center gap-2', KIOSK_META)} data-testid="kiosk-ticket-picked">
              <Check className="h-4 w-4 shrink-0 text-text-success" aria-hidden />
              Linking {choice?.mode === 'attach' ? choice.ticketLabel : ''}
            </p>
          ) : null}

          {search.searchError ? (
            <p className="text-sm font-semibold text-text-warning" data-testid="kiosk-ticket-error">
              {search.searchError}
            </p>
          ) : null}

          {search.searchLoading && search.ticketResults.length === 0 ? (
            <p className={cn('flex items-center gap-2', KIOSK_META)}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Looking for tickets…
            </p>
          ) : null}

          {search.ticketResults.map((ticket) => (
            <CandidateCard
              key={ticket.id}
              ticket={ticket}
              selected={ticket.id === pickedId}
              onPick={() => pick(ticket)}
            />
          ))}

          {!search.searchLoading && !search.searchError && search.ticketResults.length === 0 ? (
            <p className={KIOSK_META}>
              {search.ticketQuery.trim()
                ? 'No ticket matches that — file a new one instead.'
                : 'No recent tickets to attach to.'}
            </p>
          ) : null}

          {/* A ticket already anchored to another item is hidden rather than
              offered: picking it would re-anchor it away from that item. The
              count is the only honest way to say the list is not everything. */}
          {search.hiddenLinked > 0 ? (
            <p className={KIOSK_META}>
              {search.hiddenLinked} ticket{search.hiddenLinked === 1 ? '' : 's'} hidden — already
              attached to something else.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
