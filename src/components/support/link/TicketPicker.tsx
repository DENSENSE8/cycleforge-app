import { Loader2 } from '@/components/Icons';
import { statusBadge } from '@/components/support/zendesk/badges';
import { TicketPickRow } from '@/components/ui/TicketPickRow';
import {
  DenseComposeLabel,
  DenseComposeSearchInput,
} from '@/design-system/components/DenseComposeFields';
import { ticketLinkResultsEyebrow } from '@/lib/support/ticket-link-query';
import type { TicketCandidate, UseTicketSearch } from './useTicketSearch';

/** Short civil date for a ticket row. Display-only — no warehouse day logic. */
function ticketDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  search: UseTicketSearch;
  onSelect: (t: TicketCandidate | null) => void;
  /** Field label — OMITTED by default, and that is the point. */
  label?: string;
  /** `anchor` — picking the ONE entity a ticket is about; tickets anchored elsewhere are hidden by the server, so the empty copy explains the… */
  mode?: 'anchor' | 'reference';
  /** Unique id for the search input (two pickers can coexist on a page). */
  inputId?: string;
}

/** Link-mode search box + results list (recent tickets when the box is empty). */
export function TicketPicker({
  search,
  onSelect,
  label,
  mode = 'anchor',
  inputId = 'ticket-link-search',
}: Props) {
  const {
    ticketQuery,
    setTicketQuery,
    ticketResults,
    hiddenLinked,
    searchLoading,
    searchError,
    selectedTicket,
    seededQuery,
  } = search;
  const hasQuery = !!ticketQuery.trim();
  const suggestedFromTracking =
    seededQuery.length > 0 && ticketQuery.trim() === seededQuery;
  const resultsEyebrow = ticketLinkResultsEyebrow(ticketQuery, seededQuery);

  let emptyCopy: string;
  if (hasQuery) {
    emptyCopy = suggestedFromTracking
      ? 'No tickets mention this tracking — try subject text or a ticket #'
      : 'No tickets found — try a different search or ticket #';
  } else if (mode === 'anchor' && hiddenLinked > 0) {
    emptyCopy = `${hiddenLinked} recent ticket${hiddenLinked === 1 ? ' is' : 's are'} hidden — already linked to other items. Search by ticket # to find one.`;
  } else {
    emptyCopy = 'Recent support tickets will appear here';
  }

  return (
    <div className="space-y-0">
      <div className="px-3">
        {label ? <DenseComposeLabel htmlFor={inputId}>{label}</DenseComposeLabel> : null}
        <DenseComposeSearchInput
          id={inputId}
          value={ticketQuery}
          onChange={(e) => setTicketQuery(e.target.value)}
          placeholder="Search by subject, tracking, or paste a ticket # (e.g. #12345)"
          autoFocus
        />
      </div>

      <div className="mt-3 border-t border-border-hairline">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
            {resultsEyebrow}
          </p>
          {searchLoading ? <Loader2 className="h-3 w-3 animate-spin text-text-faint" /> : null}
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          {searchError ? (
            <div className="border-y border-dashed border-rose-200 bg-rose-50 px-3 py-8 text-center text-role-micro font-medium text-rose-600">
              {searchError}
            </div>
          ) : ticketResults.length > 0 ? (
            <div className={searchLoading ? 'opacity-50' : ''}>
              {ticketResults.map((t) => {
                const isSel = selectedTicket?.id === t.id;
                const badge = statusBadge(t.status);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(isSel ? null : t)}
                    disabled={t.linkedToThis}
                    className={`ds-raw-button w-full border-b border-border-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                      isSel ? 'bg-rose-50' : 'hover:bg-surface-hover'
                    } ${t.linkedToThis ? 'cursor-default opacity-60' : ''}`}
                  >
                    <TicketPickRow
                      ticketId={t.id}
                      subject={t.subject}
                      emptySubject="—"
                      subjectClassName="font-medium text-text-muted"
                      meta={
                        <>
                          <span
                            className={`rounded-full inset-chip text-role-eyebrow uppercase tracking-wider ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          {mode === 'reference' && t.anchoredElsewhere ? (
                            <span className="rounded inset-chip text-role-eyebrow uppercase tracking-wider bg-surface-hover text-text-faint">
                              {t.anchoredElsewhere.type.replace(/_/g, ' ').toLowerCase()}
                            </span>
                          ) : null}
                        </>
                      }
                      trailing={
                        <span className="text-role-micro font-medium text-text-faint">
                          {ticketDate(t.updatedAt)}
                        </span>
                      }
                    />
                  </button>
                );
              })}
            </div>
          ) : searchLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-role-micro font-semibold text-text-faint">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : (
            <div className="px-3 py-8 text-center text-role-micro font-medium text-text-faint">
              {emptyCopy}
            </div>
          )}
        </div>
      </div>

      {mode === 'anchor' && hiddenLinked > 0 && !searchError ? (
        <p className="px-3 pt-2 text-role-micro font-medium text-text-faint">
          {hiddenLinked} matching ticket{hiddenLinked === 1 ? ' is' : 's are'} hidden — already linked
          to other items.
        </p>
      ) : null}
    </div>
  );
}
