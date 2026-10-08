'use client';

/**
 * Unbox › Pair — the top-level header tab that pairs an unmatched carton with
 * its order / PO (operator 2026-10-08). It replaces the right-rail Linkage
 * display Unbox lost in the navigation unification: `# Pair` in the identity
 * row selects this tab. One column, the same step bar the phone's flows use
 * (MobileStepProgress), then the one pairing hub (CartonMatchHub) inline.
 */

import { Button } from '@/design-system/primitives';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { PHONE_CARD_COLUMN } from '@/design-system/tokens/phone-card';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cn } from '@/utils/_cn';
import { CartonMatchHub } from './CartonMatchHub';

const PAIR_STEPS = [
  { id: 'find', label: 'Find the order' },
  { id: 'paired', label: 'Paired' },
] as const;

export function UnboxPairTask({
  row,
  staffId,
  unmatched,
  onFindTicket,
  onDone,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** The carton still has no order / PO (`shouldUseUnmatchedItemsSurface`). */
  unmatched: boolean;
  /** Auto-match's "Find ticket" cell → the Ticket tab. */
  onFindTicket: () => void;
  /** Back to the Unbox work. */
  onDone: () => void;
}) {
  return (
    // One phone-width column, centred (SURFACE_LAW §4 — never edge to edge).
    <section
      className={cn('flex flex-col gap-3 px-2 pt-2', PHONE_CARD_COLUMN)}
      aria-label="Pair this carton"
      data-testid="unbox-pair-task"
    >
      <MobileStepProgress steps={PAIR_STEPS} currentIndex={unmatched ? 0 : 1} testId="unbox-pair-progress" />
      {unmatched ? null : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-role-body text-text-default">This carton is paired.</p>
          <Button type="button" size="sm" variant="secondary" onClick={onDone}>
            Back to Unbox
          </Button>
        </div>
      )}
      <CartonMatchHub
        row={row}
        staffId={staffId}
        tabSet="unbox"
        chrome="bare"
        autoFocusSearch={unmatched}
        showOpenInUnbox={false}
        focusTab="zoho_po"
        autoMatch={
          unmatched
            ? {
                receivingId: row.receiving_id ?? null,
                lineId: row.id ?? null,
                trackingNumber: row.tracking_number ?? null,
                onFindTicket,
              }
            : null
        }
      />
    </section>
  );
}
