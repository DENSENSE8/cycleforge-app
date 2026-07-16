import { Loader2 } from '@/components/Icons';
import { statusBadge } from '@/components/support/zendesk/badges';
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
  /** Field label. Defaults to the anchor-mode wording. */
  label?: string;
  /**
   * `anchor` — picking the ONE entity a ticket is about; tickets anchored
   * elsewhere are hidden by the server, so the empty copy explains the gap.
   * `reference` — attaching an EXTRA entity; nothing is hidden, and a ticket's
   * existing anchor renders as context instead.
   */
  mode?: 'anchor' | 'reference';
  /** Unique id for the search input (two pickers can coexist on a page). */
  inputId?: string;
}

/**
 * Link-mode search box + results list (recent tickets when the box is empty).
 *
 * Anchor-agnostic: it knows nothing about receiving, shipments, or orders — the
 * host supplies a {@link UseTicketSearch} whose `buildUrl` resolves the anchor.
 * This is the single picker for every "link an existing ticket" surface; do not
 * fork a per-surface copy.
 */
export function TicketPicker({
  search,
  onSelect,
  label = 'Pick the existing ticket',
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
  } = search;
  const hasQuery = !!ticketQuery.trim();

  let emptyCopy: string;
  if (hasQuery) {
    emptyCopy = 'No tickets found — try a different search or ticket #';
  } else if (mode === 'anchor' && hiddenLinked > 0) {
    emptyCopy = `${hiddenLinked} recent ticket${hiddenLinked === 1 ? ' is' : 's are'} hidden — already linked to other items. Search by ticket # to find one.`;
  } else {
    emptyCopy = 'Recent support tickets will appear here';
  }

  return (
    <>
      <div>
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-role-micro uppercase tracking-[0.14em] text-text-soft"
        >
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          value={ticketQuery}
          onChange={(e) => setTicketQuery(e.target.value)}
          placeholder="Search by subject, or paste a ticket # (e.g. #12345)"
          autoFocus
          className="block w-full rounded-lg border border-border-soft bg-surface-card inset-field text-role-caption font-medium text-text-default outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-role-micro uppercase tracking-[0.14em] text-text-soft">
            {hasQuery ? 'Results' : 'Recent tickets'} — click to select
          </p>
          {searchLoading ? <Loader2 className="h-3 w-3 animate-spin text-text-faint" /> : null}
        </div>
        <div className="max-h-[280px] overflow-y-auto rounded-xl border border-border-soft bg-surface-card">
          {searchError ? (
            <div className="rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-10 text-center text-role-micro font-medium text-rose-600">
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
                    className={`ds-raw-button flex w-full items-center gap-2.5 border-b border-border-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                      isSel ? 'bg-rose-50' : 'hover:bg-surface-hover'
                    } ${t.linkedToThis ? 'cursor-default opacity-60' : ''}`}
                  >
                    <span className="shrink-0 font-mono text-role-caption font-bold text-text-default">#{t.id}</span>
                    <span
                      className={`shrink-0 rounded-full inset-chip text-role-eyebrow uppercase tracking-wider ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-role-caption font-medium text-text-muted">
                      {t.subject || '—'}
                    </span>
                    {/* Reference mode keeps anchored tickets in the list, so say
                        what each is already about rather than silently hiding it. */}
                    {mode === 'reference' && t.anchoredElsewhere ? (
                      <span className="shrink-0 rounded inset-chip text-role-eyebrow uppercase tracking-wider bg-surface-hover text-text-faint">
                        {t.anchoredElsewhere.type.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-role-micro font-medium text-text-faint">
                      {ticketDate(t.updatedAt)}
                    </span>
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
            <div className="px-4 py-10 text-center text-role-micro font-medium text-text-faint">
              {emptyCopy}
            </div>
          )}
        </div>
      </div>

      {/* Anchor mode only: in reference mode nothing is hidden, so this line
          would be a lie (it was, before mode existed). */}
      {mode === 'anchor' && hiddenLinked > 0 && !searchError ? (
        <p className="text-role-micro font-medium text-text-faint">
          {hiddenLinked} matching ticket{hiddenLinked === 1 ? ' is' : 's are'} hidden — already linked
          to other items.
        </p>
      ) : null}
    </>
  );
}
