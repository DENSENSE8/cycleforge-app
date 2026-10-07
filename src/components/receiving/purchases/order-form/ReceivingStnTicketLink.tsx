'use client';

/**
 * Receiving header verb, left of Add — paste a tracking number and a ticket
 * number and link them. Same write as the ticket's "add tracking" reference
 * (`POST /api/support/tickets/link` with a shipment reference).
 */

import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link2 } from '@/components/Icons';
import { DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Button, TextField } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import { invalidateSupportContextCaches } from '@/hooks/useLinkTicketTrackingReference';
import { toast } from '@/lib/toast';

function parseTicketNumber(raw: string): number | null {
  const digits = raw.trim().replace(/^#/, '');
  if (!/^\d{1,12}$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function ReceivingStnTicketLink() {
  const formId = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState('');
  const [ticket, setTicket] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setTracking('');
    setTicket('');
  };

  const submit = async () => {
    const trackingNumber = tracking.trim();
    const ticketId = parseTicketNumber(ticket);
    if (!trackingNumber || ticketId == null || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, reference: { trackingNumber } }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        added?: boolean;
        error?: string;
        details?: string;
      } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || 'Could not link tracking');
      }
      invalidateSupportContextCaches(qc);
      toast.success(
        data.added
          ? `Linked ${trackingNumber} to #${ticketId}`
          : `Already linked to #${ticketId}`,
      );
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not link tracking');
    } finally {
      setBusy(false);
    }
  };

  const ticketId = parseTicketNumber(ticket);
  const canSubmit = tracking.trim().length > 0 && ticketId != null && !busy;

  return (
    <>
      <DeskHeaderAction
        ref={anchorRef}
        variant="secondary"
        size="md"
        icon={<Link2 className="h-3.5 w-3.5" aria-hidden />}
        ariaLabel="Link tracking to a ticket"
        aria-expanded={open}
        data-testid="receiving-link-ticket"
        onClick={() => setOpen((next) => !next)}
      >
        Link
      </DeskHeaderAction>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        placement="bottom-end"
        gap={8}
        padded
        className="w-72"
        aria-label="Link tracking to a ticket"
      >
        <form
          id={formId}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="text-role-eyebrow text-text-soft">Link tracking to a ticket</p>
          <TextField
            label="Tracking number"
            value={tracking}
            onChange={setTracking}
            mono
            autoFocus
            autoComplete="off"
            disabled={busy}
          />
          <TextField
            label="Ticket number"
            value={ticket}
            onChange={setTicket}
            inputMode="numeric"
            autoComplete="off"
            disabled={busy}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={busy} disabled={!canSubmit}>
              Link
            </Button>
          </div>
        </form>
      </Popover>
    </>
  );
}
