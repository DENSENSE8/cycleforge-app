'use client';

/**
 * @domain-job Persistent bottom-right archive prompt — tells an operator that
 *   photos they took on a ticketed carton after the ticket was filed are still
 *   not on the NAS, and syncs them, from wherever they are now standing.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse the carton ticket chip (`ReceivingTicketChip`)
 *   or a Displays leaf: both unmount the moment the operator scans the next
 *   carton, which is precisely when this fact still needs saying. Cannot be a
 *   toast — the reminder has to persist until it is acted on, and `@/lib/toast`
 *   is transient by contract. It is a viewport-fixed sibling of the Toaster,
 *   not a right-edge occupant, so it adds no third right-edge grammar.
 *
 * Persistent bottom-right prompt: "you took photos on a ticketed carton after
 * the ticket was filed, and they are not on the NAS yet."
 *
 * WHY A FLOATING CARD AND NOT A TOAST: the operator scans on to the next box.
 * A toast is gone in four seconds and the ticket chip that would otherwise
 * carry this state belongs to a carton that is no longer open, so the fact has
 * nowhere to live. This card is the only surface that survives the scan.
 *
 * WHY IT NAMES THE TICKET AND THE ORDER: by the time it appears the operator is
 * usually looking at a different carton, so "archive photos?" with no
 * identifiers would be a prompt about an unnamed box. Both ids are real typed
 * CopyChips, so they can be read back or copied.
 *
 * SCOPE IS ORG + STAFF — see {@link useNasArchivePending}. It only ever shows
 * work this staffer did.
 *
 * NO MOTION, and no autofocus. A scan bench is focus-locked: a card that
 * animates in pulls the eye off the work, and a card that takes focus eats the
 * next wedge scan silently.
 */

import { useMemo, useState } from 'react';
import { Archive, Loader2, X } from '@/components/Icons';
import { PoChip, TicketChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import { elevationClass } from '@/design-system/tokens/shadows';
import { useNasArchivePending, type NasArchivePendingItem } from '@/hooks/useNasArchivePending';
import { useTicketNasArchive } from '@/hooks/useTicketNasArchive';
import { cn } from '@/utils/_cn';

/**
 * Dismissal is keyed on (carton, count) so it is a "not now", never a "never".
 * The moment another photo lands the count moves and the prompt re-arms — which
 * is the behaviour you want from a reminder about evidence.
 */
const dismissKey = (item: NasArchivePendingItem) =>
  `${item.receivingId}:${item.pendingCount}`;

export function NasArchivePrompt() {
  const { items, refresh } = useNasArchivePending();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const archive = useTicketNasArchive({ silent: true });

  const live = useMemo(
    () => items.filter((i) => !dismissed.has(dismissKey(i))),
    [items, dismissed],
  );

  // Honest absence: nothing pending, nothing rendered. No empty shell.
  const top = live[0];
  if (!top) return null;

  const others = live.length - 1;
  const busy = archive.isPending;

  return (
    <div
      className="fixed bottom-4 right-4 z-panelOverlay w-[20rem] max-w-[calc(100vw-2rem)]"
      role="status"
      aria-live="polite"
    >
      <Panel padding="none" className={cn('overflow-hidden', elevationClass('overlay'))}>
        <div className="flex items-start justify-between gap-2 border-b border-border-hairline inset-field">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Archive pending
          </p>
          <HoverTooltip label="Not now — returns if another photo lands">
            <IconButton
              size="xs"
              ariaLabel="Dismiss archive prompt"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(dismissKey(top)))
              }
            />
          </HoverTooltip>
        </div>

        <div className="space-y-2 inset-field">
          <p className="text-role-caption text-text-default">
            {top.pendingCount} photo{top.pendingCount === 1 ? '' : 's'} taken since this
            ticket was filed {top.neverArchived ? 'have never been' : 'are not'} synced.
          </p>

          {/* Both ids, because the operator is probably on another carton by now. */}
          <div className="flex flex-wrap items-center gap-1">
            <TicketChip value={`#${top.ticketNumber}`} display={`#${top.ticketNumber}`} dense />
            {top.orderRef ? <PoChip value={top.orderRef} dense /> : null}
          </div>

          {failure ? (
            <p className="text-role-micro text-text-danger">{failure}</p>
          ) : null}
        </div>

        <div className="border-t border-border-hairline">
          <Button
            variant="primary"
            className="w-full rounded-none"
            disabled={busy}
            icon={
              busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )
            }
            onClick={() => {
              setFailure(null);
              archive.mutate(
                { ticketNumber: top.ticketNumber, receivingId: top.receivingId },
                {
                  // The row disappears because the stamp moved, not because we
                  // hid it — re-read rather than optimistically dropping it, so
                  // a partial copy stays visible as remaining pending work.
                  onSuccess: () => refresh(),
                  onError: (err) =>
                    setFailure(err.message || 'Could not sync photos to NAS'),
                },
              );
            }}
          >
            {busy ? 'Archiving…' : 'Archive photos'}
          </Button>
        </div>

        {others > 0 ? (
          <p className="border-t border-border-hairline inset-field text-role-micro text-text-soft">
            +{others} more carton{others === 1 ? '' : 's'} pending
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
