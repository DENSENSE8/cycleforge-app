'use client';

/**
 * MatchCard — one potential match in the triage / Package Pairing Tickets list.
 *
 * Composes {@link PairingCandidateRow} (shared media · title · meta · action
 * skeleton). No fabricated confidence scores — relevance via honest attributes
 * (already-linked, status, age).
 */

import { ExternalLink, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PairingCandidateRow,
  PairingLinkButton,
  PairingLinkedBadge,
} from '@/components/receiving/workspace/line-edit/PairingLinkButton';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { ticketStatusTone, relativeTime, type TicketCandidate } from './triage-types';

interface MatchCardProps {
  candidate: TicketCandidate;
  /** Link this ticket to the package under triage. */
  onLink: (ticketId: number) => void;
  /** True while THIS card's link mutation is in flight. */
  linking: boolean;
  /** True while ANY link mutation is in flight (disables the others). */
  anyLinking: boolean;
}

export function MatchCard({ candidate, onLink, linking, anyLinking }: MatchCardProps) {
  const tone = ticketStatusTone(candidate.status);
  const age = relativeTime(candidate.updatedAt || candidate.createdAt);
  const linked = candidate.linkedToThis;

  return (
    <PairingCandidateRow
      linked={linked}
      className={cn(cornerClass('flush'), 'px-0.5 py-0.5')}
      media={
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center bg-surface-sunken text-text-soft',
            cornerClass('flush'),
          )}
        >
          <Ticket className="h-4 w-4" />
        </span>
      }
      title={
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">
              Helpdesk
            </span>
            <span className="font-mono text-role-caption font-semibold text-text-muted">
              #{candidate.id}
            </span>
            {candidate.url ? (
              <HoverTooltip label="Open ticket" focusable={false}>
                <a
                  href={candidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-faint hover:text-blue-500"
                  aria-label={`Open ticket ${candidate.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </HoverTooltip>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-role-caption font-semibold text-text-default">
            {candidate.subject || 'Untitled ticket'}
          </p>
        </div>
      }
      meta={
        <div className="flex items-center gap-2">
          <span
            className={`rounded inset-chip text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}
          >
            {tone.label}
          </span>
          {age ? (
            <span className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
              {age}
            </span>
          ) : null}
        </div>
      }
      action={
        linked ? (
          <PairingLinkedBadge label="Matched" />
        ) : (
          <PairingLinkButton
            label="Match"
            loading={linking}
            disabled={anyLinking}
            onClick={() => onLink(candidate.id)}
          />
        )
      }
    />
  );
}
