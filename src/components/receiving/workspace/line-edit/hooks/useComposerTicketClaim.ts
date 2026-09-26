'use client';

/** The claim, headless, for the station composer's Ticket tab. */

import { useCallback, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { defaultReceivingClaimType } from '@/lib/receiving-claim-type';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { useClaimTemplate } from '../../claim/hooks/useClaimTemplate';

/** Server error text, falling back to a caller-supplied line. */
function claimErrorText(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }
  return fallback;
}

interface ComposerTicketClaim {
  /** True when the composer's Ticket tab is a CLAIM (no linked ticket yet). */
  isClaim: boolean;
  /** Template subject — displayed above the draft, not edited in the dock. */
  subject: string;
  /** The claim body. This is the composer's textarea value. */
  body: string;
  setBody: (next: string) => void;
  /** Template preview still in flight — the body is empty until it lands. */
  loading: boolean;
  filing: boolean;
  /** Enter is live only with a body to file. */
  canFile: boolean;
  file: () => void;
  /**
   * Developer "Test create" — assembles the ticket and builds the REAL photo
   * share pack, but files nothing. Dev builds only.
   */
  canTest: boolean;
  testing: boolean;
  testCreate: () => void;
}

export function useComposerTicketClaim({
  row,
  hasTicket,
  notePublic = false,
  ccEmails,
  onTicketCreated,
}: {
  row?: ReceivingLineRow | null;
  /** A linked ticket means the composer replies instead of filing. */
  hasTicket: boolean;
  notePublic?: boolean;
  ccEmails?: string[];
  onTicketCreated?: (ticketNumber: string) => void;
}): ComposerTicketClaim {
  const receivingId = row?.receiving_id ?? null;
  const lineId = row?.id ?? null;
  // No row → nothing to claim about. The hook still runs (hooks are not
  // conditional); it just never fetches and never files.
  const isClaim = !hasTicket && row != null && receivingId != null;

  // Same default the claim form derives — RETURNED → RTS, return intake →
  // return, unmatched without a PO → unfound, else damage. Read from the row so
  // the composer files the same claim type the form would have.
  const claimType = defaultReceivingClaimType({
    shipmentStatus: row?.shipment_status,
    receivingType: row?.receiving_type,
    cartonIntakeType: row?.carton_intake_type,
    intakeType: row?.intake_type,
    receivingSource: row?.receiving_source,
    hasPo: Boolean(row?.zoho_purchaseorder_number || row?.zoho_purchaseorder_id),
  });

  const template = useClaimTemplate({
    open: isClaim,
    active: isClaim,
    receivingId,
    lineId,
    claimType,
    initialSourcePlatform: row?.source_platform ?? null,
    initialReceivingType: row?.receiving_type ?? null,
    initialIsReturn: row != null ? isReturnIntake(row) : null,
  });

  const [filing, setFiling] = useState(false);
  const [testing, setTesting] = useState(false);
  // One key per carton+line: a double Enter must not file two tickets.
  const idempotencyKey = useRef<string>('');
  if (!idempotencyKey.current) {
    idempotencyKey.current = `composer-claim-${receivingId ?? 'x'}-${lineId ?? 'x'}`;
  }

  const file = useCallback(() => {
    if (!isClaim || filing || receivingId == null) return;
    const description = template.readDescription().trim();
    if (!description) return;

    setFiling(true);
    void (async () => {
      try {
        const res = await fetch('/api/receiving/zendesk-claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey.current,
          },
          body: JSON.stringify({
            receivingId,
            lineId,
            claimType,
            subject: template.readSubject().trim(),
            description,
            notePublic,
            ccEmails: notePublic ? (ccEmails ?? []) : [],
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(claimErrorText(data, 'Could not file the claim'));
          return;
        }
        const ticketNumber = data.ticketNumber ? String(data.ticketNumber) : '';
        const ticketUrl = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
        if (ticketNumber) {
          toast.success(`Ticket ${ticketNumber} filed`, {
            action: ticketUrl
              ? { label: 'Open', onClick: () => window.open(ticketUrl, '_blank', 'noopener') }
              : undefined,
          });
          onTicketCreated?.(ticketNumber);
        } else {
          toast.success('Claim filed');
        }
        const archiveWarning =
          typeof data.archiveWarning === 'string' && data.archiveWarning.trim()
            ? data.archiveWarning.trim()
            : null;
        if (archiveWarning) {
          toast.warning(archiveWarning, { duration: 8000 });
        }
      } catch {
        toast.error('Could not file the claim');
      } finally {
        setFiling(false);
      }
    })();
  }, [
    isClaim,
    filing,
    receivingId,
    lineId,
    claimType,
    template,
    notePublic,
    ccEmails,
    onTicketCreated,
  ]);

  /** Test create — the same POST with `dryRun`, which assembles the subject and body and BUILDS THE SHARE PACK but creates no ticket. */
  const testCreate = useCallback(() => {
    if (!isClaim || testing || receivingId == null) return;
    setTesting(true);
    void (async () => {
      try {
        const res = await fetch('/api/receiving/zendesk-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivingId,
            lineId,
            claimType,
            subject: template.readSubject().trim(),
            description: template.readDescription().trim(),
            notePublic,
            ccEmails: notePublic ? (ccEmails ?? []) : [],
            dryRun: true,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(claimErrorText(data, 'Test create failed'));
          return;
        }
        if (typeof data.description === 'string') {
          template.onDescriptionChange(data.description);
        }
        const packUrl = typeof data.sharePackUrl === 'string' ? data.sharePackUrl : null;
        const packCount = Number(data.sharePackPhotoCount ?? 0);
        toast.success(
          packUrl
            ? `Test create — no ticket filed · share pack of ${packCount} photo${packCount === 1 ? '' : 's'}`
            : 'Test create — no ticket filed · no photos to share',
          {
            duration: 8000,
            action: packUrl
              ? { label: 'Open pack', onClick: () => window.open(packUrl, '_blank', 'noopener') }
              : undefined,
          },
        );
      } catch {
        toast.error('Test create failed');
      } finally {
        setTesting(false);
      }
    })();
  }, [isClaim, testing, receivingId, lineId, claimType, template, notePublic, ccEmails]);

  return {
    isClaim,
    subject: template.subject,
    body: template.description,
    setBody: template.onDescriptionChange,
    loading: template.previewLoading,
    filing,
    canFile: isClaim && !filing && template.description.trim().length > 0,
    file,
    // Dev builds only — this is a developer tool, not floor chrome.
    canTest: isClaim && process.env.NODE_ENV !== 'production',
    testing,
    testCreate,
  };
}
