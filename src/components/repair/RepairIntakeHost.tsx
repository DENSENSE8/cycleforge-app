'use client';

/**
 * Repair intake — the ONE Add of Repair service (`/repair` and Sales ›
 * Repair service): the `New repair` CTA top-right of the page (the desk
 * chrome's primary slot, bare `N` while it is painted) and the full-screen
 * intake it opens (also `?new=true`). Closing after a submit opens the new
 * repair.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useBodyScrollLock } from '@/design-system/hooks';
import { useRepairNewParam } from '@/hooks/useRepairNewParam';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { toast } from '@/lib/toast';
import { qk } from '@/queries/keys';
import {
  RepairIntakeForm,
  type RepairFormData,
  type RepairSubmitResult,
} from '@/components/repair/RepairIntakeForm';

const REPAIR_SUBMIT_TIMEOUT_MS = 60_000;
const NEW_REPAIR_KEY = 'N';

export function RepairIntakeHost() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { newPulse, clearPulse } = useRepairNewParam();
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Idempotency key for the in-flight intake submission. Persists across failed
  // retries (so a replay dedupes the Zendesk ticket) and is cleared on success.
  const repairIdemKey = useRef<string | null>(null);
  // The repair this intake created — its record opens when the intake closes.
  const createdId = useRef<number | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const addAction = useMemo(
    () => (
      <DeskHeaderAction
        ref={addRef}
        type="button"
        variant="primary"
        size="md"
        icon={<Plus aria-hidden />}
        label="New repair"
        shortcut={NEW_REPAIR_KEY}
        aria-keyshortcuts={NEW_REPAIR_KEY}
        onClick={() => setShowIntakeForm(true)}
        data-testid="repair-new"
      />
    ),
    [],
  );

  // Bare `N` — only while the CTA is painted (an open record or fullscreen hides the header row).
  useEffect(() => {
    if (showIntakeForm) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'n' || isEditableKeyTarget(e.target) || hasOpenOverlay()) return;
      if (addRef.current?.offsetParent == null) return;
      e.preventDefault();
      setShowIntakeForm(true);
    };
    window.addEventListener('keydown', onKey);
    const unregister = registerShortcutOverviewGroup({
      id: 'repair-new',
      title: 'Repair service',
      rows: [{ keys: [NEW_REPAIR_KEY], label: 'New repair' }],
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
    };
  }, [showIntakeForm]);

  // One-shot: paint intake from optimistic/URL pulse, then strip `?new=`.
  useEffect(() => {
    if (!newPulse) return;
    setShowIntakeForm(true);
    clearPulse();
  }, [newPulse, clearPulse]);

  useBodyScrollLock(isMounted && showIntakeForm);

  const handleCloseForm = () => {
    setShowIntakeForm(false);
    const id = createdId.current;
    if (id == null) return;
    createdId.current = null;
    const next = new URLSearchParams(window.location.search);
    next.delete('new');
    next.set('openRepair', String(id));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
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
        createdId.current = Number(result.id);
        void queryClient.invalidateQueries({ queryKey: qk.repairs.all });
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

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{addAction}</DeskActionSlotRegistrar>
      {isMounted && showIntakeForm
        ? createPortal(
            <div className="fixed inset-0 z-panelOverlay bg-surface-card">
              <RepairIntakeForm onClose={handleCloseForm} onSubmit={handleSubmitForm} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
