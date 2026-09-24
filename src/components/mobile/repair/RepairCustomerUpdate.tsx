'use client';

import { useEffect, useRef, useState } from 'react';
import { ConfirmSheet } from '@/components/ui/BottomSheet';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { Button } from '@/design-system/primitives';
import { customerUpdateDraft, readableStamp } from '@/lib/repair/customer-update-drafts';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import type { RepairTicketLink } from '@/lib/repair/ticket-link';

type SendResult = { ok: true; zendeskTicketId: number; at: string } | { ok: false; error: string };

const BLOCKED_REASON: Record<Exclude<RepairTicketLink['state'], 'linked' | 'unverified'>, string> = {
  none: 'No support ticket is linked to this repair.',
  ambiguous: 'More than one ticket is linked — sending is off until one is chosen on desktop.',
  internal: 'The linked ticket is internal-only; it cannot be emailed from here.',
};

function linkReason(link: RepairTicketLink): string {
  if (link.state === 'linked') return `Zendesk #${link.zendeskTicketId}`;
  if (link.state === 'unverified') {
    return `Ticket number ${link.ticketNumber} is not linked in the helpdesk — link it on desktop before sending.`;
  }
  return BLOCKED_REASON[link.state];
}

/**
 * Customer-update composer of the mobile repair workbench. The ticket target
 * comes from `ticket_links` (never the free-typed ticket number), so only a
 * verified `linked` ticket can receive a message, and only through the explicit
 * Send → confirm path. Opening, editing, inserting a stamp or dismissing the
 * confirm sends nothing.
 */
export function RepairCustomerUpdate({
  repairId,
  rsCode,
  status,
  customerFirstName,
  device,
  eventStamp,
  onLinkResolved,
}: {
  repairId: number;
  /** Display code, e.g. 'RS-4799'. */
  rsCode: string;
  /** Saved stored status. */
  status: string | null;
  customerFirstName: string;
  device: string;
  /** Server time of the most relevant saved event (latest status_history timestamp or latest repair action created_at), or null. */
  eventStamp: string | null;
  /** Called once the ticket-link fetch resolves, so the page can reuse it instead of fetching again. */
  onLinkResolved?: (link: RepairTicketLink) => void;
}) {
  const [link, setLink] = useState<RepairTicketLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const prefill = customerUpdateDraft(status, { firstName: customerFirstName, device, rsCode });
  const [draft, setDraft] = useState(prefill);
  const [edited, setEdited] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onLinkResolvedRef = useRef(onLinkResolved);

  useEffect(() => {
    onLinkResolvedRef.current = onLinkResolved;
  });

  useEffect(() => {
    const controller = new AbortController();
    setLink(null);
    setLinkError(null);
    fetch(`/api/repair-service/${repairId}/ticket-link`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { link?: RepairTicketLink; error?: string } | null;
        if (!res.ok || !json?.link) throw new Error(json?.error || `HTTP ${res.status}`);
        setLink(json.link);
        onLinkResolvedRef.current?.(json.link);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLinkError(err instanceof Error ? err.message : 'Could not check the ticket link');
      });
    return () => controller.abort();
  }, [repairId]);

  // Follow the saved status until the operator types; their words then win.
  useEffect(() => {
    if (!edited) setDraft(prefill);
  }, [prefill, edited]);

  const editDraft = (next: string) => {
    setDraft(next);
    setEdited(true);
    setResult(null);
  };

  const insertStamp = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    // Keep prose readable: never glue the stamp onto a neighbouring word.
    const stamp = `${before && !/\s$/.test(before) ? ' ' : ''}${readableStamp(eventStamp ?? new Date())}${after && !/^\s/.test(after) ? ' ' : ''}`;
    editDraft(`${before}${stamp}${after}`);
    const caret = start + stamp.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const resetDraft = () => {
    setDraft(prefill);
    setEdited(false);
  };

  const linkedId = link?.state === 'linked' ? link.zendeskTicketId : null;
  const canSend = linkedId !== null && draft.trim().length > 0 && !sending;

  const send = async () => {
    if (linkedId === null || !draft.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/zendesk/tickets/${linkedId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim(), public: isPublic }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ticket?: { updated_at?: string | null }; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setResult({ ok: true, zendeskTicketId: linkedId, at: readableStamp(json?.ticket?.updated_at ?? new Date()) });
      setDraft(prefill);
      setEdited(false);
    } catch (err: unknown) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Send failed' });
    } finally {
      setSending(false);
    }
  };

  const visibility = isPublic ? 'a public reply emailed to the customer' : 'an internal note the customer does not see';

  return (
    <div className="flex flex-col gap-3">
      {link ? (
        <p className={linkedId !== null ? 'text-mode-body font-semibold text-mode-ink' : 'text-role-caption text-mode-muted'}>
          {linkReason(link)}
        </p>
      ) : linkError ? (
        <p role="alert" className="text-role-caption font-semibold text-rose-700">
          Could not check the ticket link — {linkError}. Sending is off.
        </p>
      ) : (
        <p className="text-role-caption text-mode-muted">Checking the ticket link…</p>
      )}

      <VisibilityToggle
        value={isPublic}
        onChange={setIsPublic}
        publicLabel="Public customer update"
        internalLabel="Internal note"
        className="self-start"
      />

      <label htmlFor="rs-customer-draft" className="sr-only">
        Customer update draft
      </label>
      <textarea
        id="rs-customer-draft"
        ref={textareaRef}
        rows={5}
        value={draft}
        onChange={(e) => editDraft(e.target.value)}
        disabled={sending}
        placeholder="Write an update for the customer"
        className="w-full rounded-mode border border-mode-control bg-mode-panel p-mode-page text-mode-body text-mode-ink disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <Button variant="secondary" size="sm" onClick={insertStamp} disabled={sending} className="self-start rounded-mode">
            Insert timestamp
          </Button>
          <span className="text-role-caption text-mode-muted">
            {eventStamp ? `uses the last saved event (${readableStamp(eventStamp)})` : 'uses the current time'}
          </span>
        </div>
        {edited && prefill && draft !== prefill ? (
          <Button variant="ghost" size="sm" onClick={resetDraft} disabled={sending} className="rounded-mode">
            {`Use the ${repairStatusOperatorLabel(status ?? '')} draft`}
          </Button>
        ) : null}
      </div>

      {result?.ok ? (
        <p role="status" className="text-role-caption font-semibold text-emerald-700">
          Sent to Zendesk #{result.zendeskTicketId} · {result.at}
        </p>
      ) : result ? (
        <p role="alert" className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700">
          Not sent — {result.error}. Your draft is kept.
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        className="w-full rounded-mode"
        disabled={!canSend}
        loading={sending}
        onClick={() => setConfirmOpen(true)}
      >
        {sending ? 'Sending' : isPublic ? 'Send to customer' : 'Add internal note'}
      </Button>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isPublic ? 'Send to customer?' : 'Add internal note?'}
        message={linkedId !== null ? `Adds ${visibility} on Zendesk #${linkedId}.` : undefined}
        confirmLabel="Send"
        onConfirm={() => void send()}
      />
    </div>
  );
}
