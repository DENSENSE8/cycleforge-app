'use client';

/**
 * KioskTicketStep — the create-or-link question, mounted UNDER the signature
 * on the repair flow's Review & sign step: does this signed drop-off open a
 * NEW helpdesk ticket, or attach to one the customer already has?
 *
 * Operator 2026-09-15: *"after the customer has submitted their signature it
 * should display with a link existing ticket or create new ticket … the
 * components are already there in the unbox component, I just need the same
 * component logic under the umbrella formatting of the kiosk design system."*
 *
 * ## Why it is not its own step
 *
 * It was one for an hour, and the operator collapsed it the same day:
 * *"because the stepper is full at that review and sign step, would it be best
 * to include a slider like link existing ticket or create a new ticket below
 * the signature so it would be mounted under one step?"* The ticket is ABOUT
 * the paperwork on that screen — paging away from the sheet to ask a question
 * about it, and spending a whole progress segment on one tap, was the wrong
 * altitude. So the MODE control is a two-up slider (`KioskChip row` faces side
 * by side in one track), not a stacked pair of full-width pills: it rides
 * under a signature pad on a step that already carries a document, and a
 * two-row pill stack there reads as a second form.
 *
 * The host still reveals it only once there is ink, which is the original
 * ruling kept intact — before a signature there is nothing to file.
 *
 * ## What is PORTED and what is REUSED
 *
 * The unbox (receiving claim) flow already answers this question, and the split
 * it made is the one honoured here:
 *
 * - **Logic — reused, not copied.** The candidate search is the shared
 *   `useTicketSearch` (debounce, abort, error mapping, stale-result drop) via
 *   {@link useKioskTicketSearch}, the same way `useClaimTicketSearch` adapts it
 *   for a carton. The decision itself is `src/lib/kiosk/repair-ticket-choice.ts`.
 * - **Presentation — ported to the kiosk tier.** `ClaimModeSelect` is a
 *   `SearchableSelectField` and `TicketPicker` is the desk sheet-band grammar
 *   (`DenseComposeSearchInput` + hairline `TicketPickRow`s at desk-micro type).
 *   Both are right for a mouse and wrong for a thumb, so this wears the kiosk
 *   kit instead: {@link KioskChip} `row` faces for the two modes (the same pill
 *   the repair reasons use) and flat touch cards for the candidates, the
 *   `KioskCartLineCard` anatomy — hairline + `MOBILE_SCAN_ROW_CORNER`, title
 *   line, facts as meta chips. `SURFACE_LAW` §5: a list on a phone-shaped
 *   surface is cards, never a table.
 *
 * ## Arming Link is not yet a decision
 *
 * Tapping *Link existing ticket* writes `{ mode: 'attach', ticketId: 0 }` —
 * deliberately incomplete, so `isKioskTicketChoiceComplete` stays false and the
 * footer key refuses until a ticket is actually picked. That is why the rules
 * module tolerates a zero id rather than making the UI hold a second "mode"
 * state beside the choice; two states is how a button and a stepper start
 * disagreeing.
 *
 * ## The pick outlives the result set
 *
 * `useTicketSearch` drops its own `selectedTicket` when it falls out of a
 * refreshed result page. The DECISION must not: a counter that keeps typing
 * would otherwise silently un-pick the customer's ticket. So the choice is the
 * single selection SoT here, the hook's own selection is unused, and a picked
 * ticket that is no longer in view is still stated in the confirmation row.
 *
 * Callers: `KioskRepairPane` (Review & sign, below the pad).
 * Affected API: GET `/api/kiosk/repair/ticket-candidates`; the decision reaches
 * POST `/api/kiosk/intake` as `ticketWork` from `KioskCartLedger`.
 * Schemas: none.
 */

import { Check, Link2, Loader2, Plus, Search, Ticket } from '@/components/Icons';
import { KioskChip, type KioskChipTone } from '@/components/kiosk/KioskChip';
import { KioskEntryField } from '@/components/kiosk/KioskCustomerIntake';
import { useKioskTicketSearch } from '@/components/kiosk/useKioskTicketSearch';
import type { TicketCandidate } from '@/components/support/link/useTicketSearch';
import {
  isKioskTicketChoiceComplete,
  type KioskTicketChoice,
} from '@/lib/kiosk/repair-ticket-choice';
import { MOBILE_SCAN_ROW_CORNER, cornerClass } from '@/design-system/tokens/radius';
// No inset here: the host step body already carries KIOSK_BODY_INSET's px-4,
// and a second inset inside it would step the slider in from the paperwork.
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/**
 * Helpdesk status → kiosk chip tone. The desk tier for this fact is
 * `statusBadge` (`@/components/support/zendesk/badges`), a square 18px badge
 * built for a grid row; the touch tier is a chip, so the MAPPING is what ports,
 * not the component. Unknown statuses stay neutral rather than guessing.
 */
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
export function kioskTicketLabel(ticket: TicketCandidate): string {
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
      /*
       * ds-raw-button: a candidate CARD is not an ops CTA. `Button` carries its
       * own size ladder, variant fill and radius, all of which would have to be
       * fought with overrides to get a full-width touch card — the same reason
       * KioskChip and KioskCartLineCard sit outside it. Focus and selection are
       * explicit below.
       */
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
        ONE SLIDER, two sides. Operator 2026-09-15: *"the create new and the
        link existing should be simplified into just one slider where you would
        be able to slide back and forth since this would be on a mobile
        display, and automatically select create new ticket."*

        So it is a single pill TRACK (`bg-surface-sunken`, `p-1`) holding two
        halves, and the selected half's accent wash IS the thumb — tap either
        side and the fill slides across. Two stacked full-width pills (the
        shape this had for an hour) read as two independent choices stacked on
        a form; one track reads as one control with a position, which is what a
        thumb-driven surface wants.

        The halves are still `KioskChip row` faces, so the press travel, the
        focus ring, the `aria-pressed` state and the tone wash are the chip
        family's — there is no hand-rolled segmented control here, and no
        second pill vocabulary in the kiosk.

        CREATE IS THE DEFAULT POSITION, including when nothing has been
        touched (`choice === null`). That is not a lie about state: `null`
        posts as `{ mode: 'create' }` (`kioskTicketWork`) and counts as settled
        (`isKioskTicketChoiceSettled`), so the position, the gate and the
        payload are one fact. Sliding to Link with no ticket picked is the one
        state that still refuses the commit.

        LABELS ARE SHORT because half of a 480px measure, minus a glyph and a
        check, leaves ~180px: "Link existing ticket" truncated to "Link
        existing tic…" at runtime. The noun is already said by the sentence
        above the track; the full phrase stays as the accessible name.
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
            // No `className` fill here: the idle tone is `KIOSK_PILL_IDLE`,
            // whose `bg-surface-sunken` is the TRACK's own colour, so the
            // unselected half already disappears into the trough. Overriding
            // it to transparent would be painting over the primitive to reach
            // the same pixel.
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
