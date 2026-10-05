'use client';

/**
 * The Unbox scan-feedback glyphs and the history list the header's top-left
 * line opens: this session's scans, newest first. A row reopens its carton; a
 * linked ticket opens in Support; several matching tickets pair in one click.
 */

import { useCallback, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, ListChecks, Loader2, PackageCheck, PackageX, Ticket } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  unboxFeedbackFace,
  unboxFeedbackLine,
  type UnboxFeedbackFace,
  type UnboxScanFeedback,
} from '@/lib/receiving/unbox-scan-feedback';
import { pairUnboxTicketChoice } from '@/lib/receiving/unbox-scan-feedback-store';
import { applyUnboxDeskParam, applyUnboxOpenReceivingParams } from '@/lib/receiving/unbox-selection-url';
import { supportHref } from '@/lib/nav/route-tree';
import { formatLaneAgeCompact } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { TOP_CHROME_ICON_FACE } from './header-shell';

/** `alert` = a teammate asked you to follow up on a task (R7); it outranks the page's next step. */
export type LineFace = 'next' | 'alert' | UnboxFeedbackFace;

const FACE_GLYPH: Record<LineFace, ComponentType<{ className?: string }>> = {
  next: ListChecks,
  alert: Bell,
  checking: Loader2,
  found: PackageCheck,
  unfound: PackageX,
  error: AlertTriangle,
  // Every ticket state wears the ticket glyph; the tone says the outcome.
  'ticket-searching': Ticket,
  'ticket-linked': Ticket,
  'ticket-open': Ticket,
  'ticket-off': Ticket,
  'ticket-error': Ticket,
};

export const FACE_TONE: Record<LineFace, string> = {
  next: 'text-text-muted',
  alert: 'text-text-warning',
  checking: 'text-text-muted',
  found: 'text-text-success',
  unfound: 'text-text-warning',
  error: 'text-text-danger',
  'ticket-searching': 'text-text-muted',
  'ticket-linked': 'text-text-success',
  'ticket-open': 'text-text-warning',
  'ticket-off': 'text-text-muted',
  'ticket-error': 'text-text-danger',
};

export function FaceGlyph({ face }: { face: LineFace }) {
  const Glyph = FACE_GLYPH[face];
  return (
    <Glyph
      className={cn(
        TOP_CHROME_ICON_FACE,
        FACE_TONE[face],
        face === 'checking' && 'animate-spin',
        face === 'ticket-searching' && 'animate-pulse',
      )}
    />
  );
}

export function UnboxScanHistory({
  log,
  onNavigate,
}: {
  log: readonly UnboxScanFeedback[];
  onNavigate: () => void;
}) {
  const router = useRouter();
  const openCarton = useCallback(
    (receivingId: number) => {
      const params = new URLSearchParams(window.location.search);
      applyUnboxOpenReceivingParams(params, { receivingId });
      applyUnboxDeskParam(params, false);
      router.push(`/unbox?${params.toString()}`);
      onNavigate();
    },
    [router, onNavigate],
  );
  const now = Date.now();
  return (
    <ul className="max-h-96 divide-y divide-border-hairline overflow-y-auto">
      {log.map((entry) => {
        const face = unboxFeedbackFace(entry);
        const ticket = entry.ticket;
        const receivingId = entry.receivingId;
        return (
          <li key={entry.id} data-testid="unbox-scan-history-row" className="flex flex-col">
            <div className="flex min-h-11 items-center gap-2 pr-3">
              <button
                type="button"
                disabled={receivingId == null}
                onClick={receivingId != null ? () => openCarton(receivingId) : undefined}
                className={cn(
                  'ds-raw-button flex min-h-11 min-w-0 flex-1 items-center gap-2 pl-3 text-left',
                  'enabled:hover:bg-surface-hover disabled:cursor-default',
                  focusRing('control'),
                )}
              >
                <span className="flex shrink-0" aria-hidden>
                  <FaceGlyph face={face} />
                </span>
                <span className={cn('min-w-0 flex-1 truncate text-role-caption font-medium', FACE_TONE[face])}>
                  {unboxFeedbackLine(entry)}
                </span>
                <span className="shrink-0 text-role-caption text-text-muted tabular-nums">
                  {formatLaneAgeCompact(new Date(entry.at), now)}
                </span>
              </button>
              {ticket?.state === 'paired' ? (
                <Link
                  href={supportHref({ q: ticket.ticketId })}
                  onClick={onNavigate}
                  title={ticket.subject ?? undefined}
                  className={cn(
                    'shrink-0 text-role-caption font-semibold text-text-accent hover:underline',
                    focusRing('control'),
                  )}
                >
                  #{ticket.ticketId}
                </Link>
              ) : null}
            </div>
            {ticket?.state === 'choose' ? (
              <ul className="flex flex-col gap-1 px-3 pb-2">
                {ticket.candidates.map((candidate) => (
                  <li key={candidate.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-role-caption text-text-default">
                      #{candidate.id}
                      {candidate.subject ? ` — ${candidate.subject}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void pairUnboxTicketChoice(entry.id, candidate)}
                    >
                      Pair
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
