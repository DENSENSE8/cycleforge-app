'use client';

/**
 * @domain-job Persistent bottom-right pending-work card — the one surface that
 *   tells an operator about follow-up they owe on a carton they have already
 *   scanned away from (un-synced ticket photos, unresolved receiving
 *   exceptions), and either commits it or takes them to it.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse the carton ticket chip or a Displays leaf: both
 *   unmount the moment the operator scans the next carton, which is precisely
 *   when these facts still need saying. Cannot be a toast — the reminder has to
 *   persist until it is acted on, and `@/lib/toast` is transient by contract.
 *   It is a viewport-fixed sibling of the Toaster, not a right-edge occupant,
 *   so it adds no third right-edge grammar.
 *
 * ONE CARD, N SOURCES. Sources live in `@/lib/receiving/pending-work`; this
 * renders the most recent and counts the rest. A card per source would put a
 * notification wall in the corner of a focus-locked scan bench.
 *
 * NO MOTION, and no autofocus. A card that animates in pulls the eye off the
 * work, and a card that takes focus eats the next wedge scan silently.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronRight, Loader2, X } from '@/components/Icons';
import { PoChip, TicketChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { elevationClass } from '@/design-system/tokens/shadows';
import { usePendingWork } from '@/hooks/usePendingWork';
import { useTicketNasArchive } from '@/hooks/useTicketNasArchive';
import { cn } from '@/utils/_cn';

export function PendingWorkPrompt() {
  const { items, refresh } = usePendingWork();
  // Dismissal keys include the count, so it is a "not now", never a "never" —
  // the moment the backlog grows the key moves and the card re-arms.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const archive = useTicketNasArchive({ silent: true });

  const live = useMemo(() => items.filter((i) => !dismissed.has(i.key)), [items, dismissed]);

  // Honest absence: nothing owed, nothing rendered. No empty shell.
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
            {top.source === 'nas-archive' ? 'Archive pending' : 'Needs a decision'}
          </p>
          <HoverTooltip label="Not now — returns if there is more">
            <IconButton
              size="xs"
              ariaLabel="Dismiss"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => setDismissed((prev) => new Set(prev).add(top.key))}
            />
          </HoverTooltip>
        </div>

        <div className="space-y-2 inset-field">
          <p className="text-role-caption text-text-default">{top.headline}</p>

          {/* Both ids, because the operator is probably on another carton by now. */}
          <div className="flex flex-wrap items-center gap-1">
            {top.ticketNumber ? (
              <TicketChip
                value={`#${top.ticketNumber}`}
                display={`#${top.ticketNumber}`}
                dense
              />
            ) : null}
            {top.orderRef ? <PoChip value={top.orderRef} dense /> : null}
          </div>

          {failure ? <p className="text-role-micro text-text-danger">{failure}</p> : null}
        </div>

        <div className="border-t border-border-hairline">
          {top.action === 'navigate' ? (
            // A judgement call: take them to the record and stop. A one-click
            // "Resolve" here would invite clearing a backlog without looking at it.
            // `Button` renders a <button> only, so the navigate case composes
            // Link + the same flush face rather than bending the primitive.
            <Link
              href={top.href}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-none',
                'bg-accent-bg py-2 text-role-caption font-medium text-white',
                'hover:opacity-90',
                focusRing('control', 'accent'),
              )}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              {top.actionLabel}
            </Link>
          ) : (
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
                    // Re-read rather than optimistically dropping the row: a
                    // partial copy must stay visible as remaining pending work.
                    onSuccess: () => refresh(),
                    onError: (err) =>
                      setFailure(err.message || 'Could not sync photos to NAS'),
                  },
                );
              }}
            >
              {busy ? 'Archiving…' : top.actionLabel}
            </Button>
          )}
        </div>

        {others > 0 ? (
          <p className="border-t border-border-hairline inset-field text-role-micro text-text-soft">
            +{others} more pending
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
