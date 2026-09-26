'use client';

/** Repair intake overlay host — the `?new=true` host for the **rail-less** repair desk. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useBodyScrollLock } from '@/design-system/hooks';
import { useRepairNewParam } from '@/hooks/useRepairNewParam';
import { toast } from '@/lib/toast';
import {
  RepairIntakeForm,
  type RepairFormData,
  type RepairSubmitResult,
} from '@/components/repair/RepairIntakeForm';

const REPAIR_SUBMIT_TIMEOUT_MS = 60_000;

export function RepairIntakeHost() {
  const { newPulse, clearPulse } = useRepairNewParam();
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Idempotency key for the in-flight intake submission. Persists across failed
  // retries (so a replay dedupes the Zendesk ticket) and is cleared on success.
  const repairIdemKey = useRef<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // One-shot: paint intake from optimistic/URL pulse, then strip `?new=`.
  useEffect(() => {
    if (!newPulse) return;
    setShowIntakeForm(true);
    clearPulse();
  }, [newPulse, clearPulse]);

  useBodyScrollLock(isMounted && showIntakeForm);

  const handleCloseForm = () => {
    setShowIntakeForm(false);
  };

  const handleSubmitForm = async (data: RepairFormData): Promise<RepairSubmitResult | null> => {
    if (!repairIdemKey.current) repairIdemKey.current = safeRandomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPAIR_SUBMIT_TIMEOUT_MS);
    try {
      const response = await fetch('/api/repair/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': repairIdemKey.current,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let result: Record<string, unknown>;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          response.ok
            ? 'Invalid response from server. Please try again.'
            : `Failed to submit repair (${response.status}). Please try again.`,
        );
      }

      if (response.ok && result.success) {
        repairIdemKey.current = null;
        const ticketUrl: string | null =
          typeof result.zendeskTicketUrl === 'string' ? result.zendeskTicketUrl : null;
        const ticketSuffix = result.zendeskTicketNumber
          ? ` — ticket ${result.zendeskTicketNumber}`
          : '';
        toast.success(`Repair ${result.rsNumber ?? ''} submitted${ticketSuffix}`.trim(), {
          action: ticketUrl
            ? { label: 'Open', onClick: () => window.open(ticketUrl, '_blank', 'noopener') }
            : undefined,
        });
        if (result.signatureWarning) {
          toast.warning(`Repair submitted, but: ${String(result.signatureWarning)}`);
        }
        return {
          id: Number(result.id),
          rsNumber: (result.rsNumber as string | number | null | undefined) ?? null,
          zendeskTicketNumber: (result.zendeskTicketNumber as string | null | undefined) ?? null,
          zendeskTicketUrl: ticketUrl,
        };
      }

      const message =
        typeof result.error === 'string' && result.error.trim()
          ? result.error
          : typeof result.details === 'string' && result.details.trim()
            ? result.details
            : `Failed to submit repair form (${response.status}). Please try again.`;
      throw new Error(message);
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          'Submission timed out. The repair may already have been saved — check the Active repairs list before submitting again.',
        );
      }
      if (error instanceof Error) throw error;
      throw new Error('Error submitting repair form. Please try again.');
    }
  };

  return isMounted && showIntakeForm
    ? createPortal(
        <div className="fixed inset-0 z-panelOverlay bg-surface-card">
          <RepairIntakeForm onClose={handleCloseForm} onSubmit={handleSubmitForm} />
        </div>,
        document.body,
      )
    : null;
}
