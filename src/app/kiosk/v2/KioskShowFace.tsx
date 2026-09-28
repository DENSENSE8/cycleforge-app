'use client';

/** Consult Show — one proposal, huge, no catalog, no spine, no void. */

import { cn } from '@/utils/_cn';
import {
  COUNTER_RHYTHM,
  COUNTER_TEXT,
  COUNTER_TOUCH,
  counterCorner,
} from '@/app/kiosk/kiosk-counter-surface';
import { lineTypeLabel, useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import { resolveConsultProposal } from '@/lib/kiosk/consult-proposal';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function KioskShowFace() {
  const session = useKioskSession();
  const proposal = resolveConsultProposal(session.lines, session.presentation);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col items-center justify-center bg-surface-card px-8 py-10',
        COUNTER_RHYTHM.section,
      )}
      data-testid="kiosk-show-face"
    >
      {proposal ? (
        <div
          className={cn(
            'flex w-full max-w-xl flex-col bg-surface-canvas p-8',
            counterCorner('card'),
            COUNTER_RHYTHM.field,
          )}
        >
          <p className={cn('text-text-soft', COUNTER_TEXT.label)}>
            {lineTypeLabel(proposal.lineType)}
          </p>
          {/* The customer reads THIS. */}
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-text-default line-clamp-2 break-words text-pretty">
            {proposal.title}
          </h2>
          <p className={cn(COUNTER_TEXT.field, COUNTER_TOUCH.control, 'flex items-center text-text-muted')}>
            {proposal.identifierLabel}: {proposal.identifierValue}
          </p>
          <p className="text-3xl font-semibold tabular-nums text-text-default">
            {formatCents(proposal.unitAmountCents)}
          </p>
        </div>
      ) : (
        <p className={cn(COUNTER_TEXT.field, 'max-w-md text-center text-text-muted')}>
          Consult in progress.
        </p>
      )}
    </div>
  );
}
