'use client';

/**
 * KioskLinkRepair — the cart's door to an EXISTING repair.
 *
 * A key that swaps IN PLACE to a search (no modal over the cart): phone, RS
 * ticket, last four or name, the same box History answers. Only STANDALONE
 * tickets are offered — an Ecwid drop-off or desk ticket with no transaction
 * under it. A visit's repair is already on a receipt; linking it would pull it
 * off that receipt, which the server refuses, so the tablet never offers it.
 *
 * Tapping a ticket adds it as a LINKED line: no serial, no symptom, no
 * signature, no second RS number (operator 2026-09-24: *"I must be able to
 * link an existing repair service with signature NOT needed"*). The line is
 * built by `addLinkedRepair`, the same helper History's `Add to cart` uses.
 *
 * Callers: `KioskCartLedger` (Cart step), `KioskHistoryDetail` (the hook).
 * Affected API: GET `/api/kiosk/visit?q=&kind=repair` (read);
 * POST `/api/kiosk/intake` `linkedRepairs[]` at submit.
 * Schemas: `repair_service` (read), the kiosk session store (write).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { Link2, Loader2, Search } from '@/components/Icons';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import { useKioskSession, useKioskSessionActions } from '@/lib/kiosk/kiosk-session-store';
import { fetchKioskVisits } from '@/lib/kiosk/history/kiosk-history-client';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import {
  addLinkedRepair,
  linkableRepairFromVisitRow,
  type LinkableRepairRecord,
} from '@/lib/kiosk/linked-repair-line';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Below this the search matches half the book — wait for a real term. */
const MIN_TERM = 2;
/** One request per pause in typing, not per keystroke on a counter network. */
const DEBOUNCE_MS = 250;

/**
 * Bind {@link addLinkedRepair} to the live session. ONE binding for both
 * doors, so the cart search and History's `Add to cart` report twins and
 * prefill the customer identically.
 */
export function useAddLinkedRepair(): (record: LinkableRepairRecord) => 'added' | 'already' {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  return useCallback(
    (record: LinkableRepairRecord) => {
      const outcome = addLinkedRepair(record, {
        lines: session.lines,
        customerPhone: session.customerPhone,
        customerName: session.customerName,
        addRepair: actions.addRepair,
        setCustomer: actions.setCustomer,
      });
      const ticket = record.ticketNumber || `RS-${record.repairId}`;
      toast(outcome === 'added' ? `${ticket} added to the cart.` : `${ticket} is already in the cart.`);
      return outcome;
    },
    [actions, session.customerName, session.customerPhone, session.lines],
  );
}

function formatCents(cents: number | null): string {
  return cents == null ? 'Not quoted' : `$${(cents / 100).toFixed(2)}`;
}

export function KioskLinkRepair() {
  const session = useKioskSession();
  const addLinked = useAddLinkedRepair();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<LinkableRepairRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldHost = useRef<HTMLDivElement>(null);

  // The field is the whole point of opening — the operator is already typing.
  useEffect(() => {
    if (open) fieldHost.current?.querySelector('input')?.focus();
  }, [open]);

  const trimmed = term.trim();
  useEffect(() => {
    if (!open || trimmed.length < MIN_TERM) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetchKioskVisits({ q: trimmed, kind: 'repair', signal: controller.signal })
        .then((page) => {
          setResults(
            page.visits
              .map(linkableRepairFromVisitRow)
              .filter((record): record is LinkableRepairRecord => record !== null),
          );
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(err instanceof Error ? err.message : 'Could not search repairs.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed]);

  const close = () => {
    setOpen(false);
    setTerm('');
  };

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="lg"
        className={cn(KIOSK_POS_CTA_SECONDARY, 'max-w-none')}
        icon={<Link2 className="h-4 w-4" aria-hidden />}
        onClick={() => setOpen(true)}
        data-testid="kiosk-link-repair-open"
      >
        Link existing repair
      </Button>
    );
  }

  const inCart = new Set(
    session.lines.flatMap((line) =>
      line.type === 'REPAIR' && isRepairPayload(line.payload) && line.payload.linkedRepairId != null
        ? [line.payload.linkedRepairId]
        : [],
    ),
  );

  return (
    <section className="flex flex-col gap-2" aria-label="Link existing repair" data-testid="kiosk-link-repair">
      <div className="flex items-center gap-2">
        <div ref={fieldHost} className="min-w-0 flex-1">
          <KioskEntryField
            name="Phone, RS # or name"
            value={term}
            onChange={setTerm}
            autoComplete="off"
            icon={<Search className="h-4 w-4" />}
            testId="kiosk-link-repair-search"
          />
        </div>
        <Button variant="ghost" size="lg" onClick={close} data-testid="kiosk-link-repair-cancel">
          Cancel
        </Button>
      </div>

      {trimmed.length < MIN_TERM ? (
        <p className={cn('px-1', KIOSK_META)}>
          Repairs not yet on a receipt — Ecwid drop-offs and desk tickets.
        </p>
      ) : loading ? (
        <p className={cn('flex items-center gap-2 px-1', KIOSK_META)}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…
        </p>
      ) : error ? (
        <p className="px-1 text-sm font-semibold text-text-danger">{error}</p>
      ) : results.length === 0 ? (
        <p className={cn('px-1', KIOSK_META)}>No open repair matches “{trimmed}”.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Matching repairs">
          {results.map((record) => {
            const linked = inCart.has(record.repairId);
            return (
              <li key={record.repairId}>
                <button
                  type="button"
                  disabled={linked}
                  onClick={() => {
                    if (addLinked(record) === 'added') close();
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1.5 border border-border-hairline bg-surface-card px-4 py-3 text-left',
                    MOBILE_SCAN_ROW_CORNER,
                    linked ? 'cursor-default opacity-60' : 'transition-colors hover:bg-surface-hover',
                  )}
                  data-testid="kiosk-link-repair-row"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-text-default">
                      {record.productTitle || 'Repair'}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-semibold tabular-nums',
                        record.priceCents == null ? 'text-text-soft' : 'text-text-success',
                      )}
                    >
                      {formatCents(record.priceCents)}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <KioskChip tone="warning">{record.ticketNumber || `RS-${record.repairId}`}</KioskChip>
                    {record.serialNumber ? (
                      <KioskChip>
                        <span className="font-normal">SN</span> {record.serialNumber}
                      </KioskChip>
                    ) : null}
                    {linked ? <KioskChip tone="accent">In cart</KioskChip> : null}
                    <span className={cn('truncate', KIOSK_META)}>
                      {[record.customerName, record.customerPhone].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
