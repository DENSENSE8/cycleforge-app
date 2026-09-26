'use client';

/** Purchase order on the receiving-order sheet: */

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import {
  EMPTY_PO_INTAKE_DRAFT,
  addPoIntakeLine,
  missingPoIntakeFields,
  poIntakeMissingPrompt,
  removePoIntakeLine,
  updatePoIntakeLine,
  type PoIntakeDraft,
} from '@/lib/inbound/po-intake-draft';
import { postPoIntakeConfirm } from '@/lib/inbound/po-intake-client';
import { closeReceivingOrderComposer } from '@/lib/inbound/receiving-order-composer-store';
import { toast } from '@/lib/toast';
import { ReceivingOrderSheet } from './ReceivingOrderSheet';
import { OrderDocumentFill } from './OrderDocumentFill';
import { PurchaseOrderFields } from './PurchaseOrderFields';
import { PurchaseOrderLines } from './PurchaseOrderLines';
import { ComposerStatus } from './receiving-order-composer-parts';

export function PurchaseOrderComposer() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PoIntakeDraft>(EMPTY_PO_INTAKE_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = useMemo(() => missingPoIntakeFields(draft), [draft]);

  const patch = useCallback((next: Partial<PoIntakeDraft>) => setDraft((d) => ({ ...d, ...next })), []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await postPoIntakeConfirm(draft);
      invalidateReceivingFeeds(queryClient);
      const lines = result.created + result.updated;
      toast.success(lines === 1 ? 'Purchase order added to Incoming' : `${lines} purchase lines added to Incoming`);
      closeReceivingOrderComposer();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the purchase order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [draft, queryClient]);

  return (
    <ReceivingOrderSheet
      kind="purchase"
      submitLabel="Add purchase order"
      submitting={submitting}
      canSubmit={missing.length === 0}
      onSubmit={() => void submit()}
      status={
        error ? (
          <ComposerStatus tone="error">{error}</ComposerStatus>
        ) : missing.length > 0 ? (
          <ComposerStatus tone="blocked">{poIntakeMissingPrompt(missing)}</ComposerStatus>
        ) : (
          <ComposerStatus tone="ready">Ready — lands on On the way with every line.</ComposerStatus>
        )
      }
    >
      <OrderDocumentFill onFilled={setDraft} />
      <PurchaseOrderFields draft={draft} missing={missing} onChange={patch} />
      <PurchaseOrderLines
        lines={draft.lines}
        missing={missing}
        onAdd={() => setDraft(addPoIntakeLine)}
        onRemove={(index) => setDraft((d) => removePoIntakeLine(d, index))}
        onChange={(index, next) => setDraft((d) => updatePoIntakeLine(d, index, next))}
      />
    </ReceivingOrderSheet>
  );
}
