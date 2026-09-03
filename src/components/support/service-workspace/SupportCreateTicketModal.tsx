'use client';

/**
 * Unbox claim–family create-ticket overlay for the Support station claim host
 * ({@link useSupportTicketClaimHost}). Subject (required) + first note + optional
 * order / tracking / serial linkages that live-resolve via GET /api/support/linkage
 * and auto-link on `POST /api/support/tickets`.
 *
 * Composes the house `RightPaneOverlay` (centered, resizable) — the same overlay
 * shell the receiving claim wizard uses — rather than hand-rolling a modal.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X } from '@/components/Icons';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { OrderLinkage } from '@/lib/order-linkage';
import {
  buildSupportTicketSubjectFromLinkage,
  type SupportTicketLinkages,
} from '@/lib/support/create-ticket-linkages';

const FIELD_CLASS = cn(
  'w-full rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-role-data text-text-default placeholder:text-text-faint',
  focusRing('field'),
);

async function fetchSupportLinkage(args: {
  order?: string;
  tracking?: string;
  serial?: string;
}): Promise<OrderLinkage | null> {
  const sp = new URLSearchParams();
  if (args.order) sp.set('order', args.order);
  if (args.tracking) sp.set('tracking', args.tracking);
  if (args.serial) sp.set('serial', args.serial);
  if (![...sp.keys()].length) return null;
  const res = await fetch(`/api/support/linkage?${sp.toString()}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) return null;
  return (data.linkage as OrderLinkage) ?? null;
}

function LinkagePreview({ linkage, isFetching }: { linkage: OrderLinkage | null; isFetching: boolean }) {
  if (isFetching) {
    return <p className="text-role-micro text-text-faint">Looking up connections…</p>;
  }
  if (!linkage || linkage.matchedBy == null) {
    return (
      <p className="text-role-micro text-text-faint">
        No match yet — paste an order #, tracking #, or serial to auto-connect.
      </p>
    );
  }

  const chips: string[] = [];
  if (linkage.order?.orderId) chips.push(`Order #${linkage.order.orderId}`);
  for (const t of linkage.trackings) {
    if (t.tracking) chips.push(t.isPrimary ? `TRK ${t.tracking}` : `TRK ${t.tracking} (ref)`);
  }
  for (const s of linkage.serials.slice(0, 3)) {
    if (s.serial) chips.push(`SN ${s.serial}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-role-micro font-semibold text-emerald-800"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function SupportCreateTicketModal({
  open,
  defaultSubject,
  defaultOrderNumber,
  defaultTrackingNumber,
  defaultSerialNumber,
  orderFieldLocked = false,
  submitting = false,
  surface = 'overlay',
  onClose,
  onCreate,
}: {
  open: boolean;
  /** Pre-fill for an anchored create (e.g. "Order #1234"). */
  defaultSubject?: string;
  /** Prefill the order linkage field (Orders focus). */
  defaultOrderNumber?: string | null;
  defaultTrackingNumber?: string | null;
  defaultSerialNumber?: string | null;
  /** When true, order # is read-only (order-anchored create). */
  orderFieldLocked?: boolean;
  submitting?: boolean;
  /** `inline` fills the parent (search / station empty ticket). Overlay is the Support board. */
  surface?: 'overlay' | 'inline';
  onClose: () => void;
  onCreate: (args: { subject: string; note: string; linkages: SupportTicketLinkages }) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [note, setNote] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [debouncedOrder, setDebouncedOrder] = useState('');
  const [debouncedTracking, setDebouncedTracking] = useState('');
  const [debouncedSerial, setDebouncedSerial] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus each open.
  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject ?? '');
    setNote('');
    setOrderNumber((defaultOrderNumber ?? '').trim());
    setTrackingNumber((defaultTrackingNumber ?? '').trim());
    setSerialNumber((defaultSerialNumber ?? '').trim());
    setDebouncedOrder((defaultOrderNumber ?? '').trim());
    setDebouncedTracking((defaultTrackingNumber ?? '').trim());
    setDebouncedSerial((defaultSerialNumber ?? '').trim());
    setSubjectTouched(Boolean(defaultSubject?.trim()));
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, defaultSubject, defaultOrderNumber, defaultTrackingNumber, defaultSerialNumber]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedOrder(orderNumber.trim()), 300);
    return () => clearTimeout(h);
  }, [orderNumber]);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedTracking(trackingNumber.trim()), 300);
    return () => clearTimeout(h);
  }, [trackingNumber]);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSerial(serialNumber.trim()), 300);
    return () => clearTimeout(h);
  }, [serialNumber]);

  const hasLookup = Boolean(debouncedOrder || debouncedTracking || debouncedSerial);
  const linkageQuery = useQuery({
    queryKey: ['support-linkage', debouncedOrder, debouncedTracking, debouncedSerial],
    queryFn: () =>
      fetchSupportLinkage({
        order: debouncedOrder || undefined,
        tracking: debouncedTracking || undefined,
        serial: debouncedSerial || undefined,
      }),
    enabled: open && hasLookup,
    staleTime: 15_000,
  });

  // Seed subject from resolved facts when the operator hasn't typed one yet.
  useEffect(() => {
    if (!open || subjectTouched) return;
    const linkage = linkageQuery.data;
    if (!linkage || linkage.matchedBy == null) return;
    const seeded = buildSupportTicketSubjectFromLinkage(linkage);
    if (seeded) setSubject(seeded);
  }, [open, subjectTouched, linkageQuery.data]);

  const [aiDrafting, setAiDrafting] = useState(false);

  const canSubmit = subject.trim().length > 0 && !submitting;

  const draftWithAi = async () => {
    if (aiDrafting || submitting) return;
    const liveSubject = subject.trim();
    const liveNote = note.trim();
    if (!liveSubject && !liveNote) {
      toast.error('Add a subject or note first');
      return;
    }
    setAiDrafting(true);
    try {
      const res = await fetch('/api/support/tickets/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'Support ticket',
          subject: liveSubject,
          description: liveNote || liveSubject,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        subject?: string;
        description?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'AI draft failed');
        return;
      }
      if (typeof data.subject === 'string' && data.subject.trim()) {
        setSubjectTouched(true);
        setSubject(data.subject);
      }
      if (typeof data.description === 'string' && data.description.trim()) {
        setNote(data.description);
      }
      toast.success('Drafted with AI — review before creating');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI draft failed');
    } finally {
      setAiDrafting(false);
    }
  };

  const linkages: SupportTicketLinkages = {
    order: orderNumber.trim() || undefined,
    tracking: trackingNumber.trim() || undefined,
    serial: serialNumber.trim() || undefined,
  };

  if (surface === 'inline' && !open) return null;

  const form = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onCreate({ subject: subject.trim(), note, linkages });
        }}
        className="flex min-h-0 flex-1 flex-col bg-surface-card text-text-default"
        data-testid="support-create-ticket-form"
      >
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline bg-surface-card px-4 py-3">
        {surface === 'overlay' ? (
          <p className="text-role-micro uppercase tracking-[0.14em] text-text-faint">Ticket</p>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold tracking-tight text-text-default">Create ticket</p>
          {surface === 'overlay' ? (
            <IconButton
              onClick={onClose}
              disabled={submitting}
              ariaLabel="Cancel"
              icon={<X className="h-4 w-4" />}
              className="rounded-lg p-1.5 text-text-faint hover:bg-surface-card hover:text-text-muted disabled:opacity-50"
            />
          ) : null}
        </div>
      </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-role-data">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            icon={<Sparkles className="h-4 w-4" />}
            loading={aiDrafting}
            disabled={aiDrafting || submitting}
            onClick={() => void draftWithAi()}
            ariaLabel="Draft ticket with AI"
          >
            Draft with AI
          </Button>
          <label className="block space-y-1">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Subject
            </span>
            <input
              ref={inputRef}
              value={subject}
              onChange={(e) => {
                setSubjectTouched(true);
                setSubject(e.target.value);
              }}
              placeholder="What is this ticket about?"
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex min-h-[8rem] flex-col space-y-1">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              First note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context — becomes the ticket's first comment."
              className={cn(FIELD_CLASS, 'min-h-[7rem] flex-1 resize-y')}
            />
          </label>

          <div className="space-y-2.5 rounded-xl border border-border-hairline bg-surface-sunken/40 p-3">
            <div>
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                Linkages
              </p>
              <p className="mt-0.5 text-role-micro text-text-faint">
                Order, tracking, and serial connect shipping + inventory on create.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
                  Order #
                </span>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. 12345"
                  disabled={orderFieldLocked}
                  className={cn(FIELD_CLASS, orderFieldLocked && 'opacity-70')}
                />
              </label>
              <label className="space-y-1">
                <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
                  Tracking #
                </span>
                <input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Paste or scan"
                  className={FIELD_CLASS}
                />
              </label>
              <label className="space-y-1">
                <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
                  Serial #
                </span>
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="Unit serial"
                  className={FIELD_CLASS}
                />
              </label>
            </div>

            <LinkagePreview
              linkage={hasLookup ? (linkageQuery.data ?? null) : null}
              isFetching={hasLookup && linkageQuery.isFetching}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-hairline bg-surface-card px-4 py-3">
          {surface === 'overlay' ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={submitting} disabled={!canSubmit}>
            Create ticket
          </Button>
        </div>
      </form>
  );

  if (surface === 'inline') return form;

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="support-create-ticket-modal-size"
      minWidth={460}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,52rem)] bg-surface-card text-text-default"
      aria-label="Create ticket"
    >
      {form}
    </RightPaneOverlay>
  );
}
