'use client';

/**
 * Return on the receiving-order sheet → `POST /api/receiving/inbound/import-purchase`
 * (kind=return), which also files the linked support ticket. Owns the draft,
 * the picked inventory item and the submit; the frame is `ReceivingOrderSheet`
 * and completeness is the intake domain's `canSubmitAddInbound`.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { buildAddInboundImportBody, canSubmitAddInbound } from '@/lib/inbound/build-add-inbound-payload';
import { postInboundImport } from '@/lib/inbound/inbound-import-client';
import { closeReceivingOrderComposer } from '@/lib/inbound/receiving-order-composer-store';
import { toast } from '@/lib/toast';
import { PRIORITY_AUTO } from './composer-choices';
import { ReceivingOrderSheet } from './ReceivingOrderSheet';
import { ReturnItemFields, ReturnOrderFields, type ReturnDraft } from './ReturnOrderFields';
import { ComposerSection, ComposerStatus, ComposerTextArea } from './receiving-order-composer-parts';

const EMPTY_RETURN: ReturnDraft = {
  platform: 'amazon',
  priority: PRIORITY_AUTO,
  orderId: '',
  sku: '',
  itemName: '',
  quantity: '1',
  trackingNumber: '',
  listingUrl: '',
  seller: '',
  accountName: '',
  returnReason: '',
  rmaId: '',
};

export function ReturnOrderComposer() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReturnDraft>(EMPTY_RETURN);
  const [picked, setPicked] = useState<SkuCatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketDraftBody, setTicketDraftBody] = useState<string | null>(null);

  const patch = useCallback((next: Partial<ReturnDraft>) => setDraft((d) => ({ ...d, ...next })), []);
  const input = useMemo(
    () => ({ ...draft, receivingType: 'RETURN', pickedCatalogId: picked?.id ?? null }),
    [draft, picked],
  );
  const missing = [
    !draft.orderId.trim() ? 'order number' : null,
    !draft.trackingNumber.trim() ? 'return tracking number' : null,
    picked == null ? 'the inventory item' : null,
  ].filter((m): m is string => m != null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    setTicketDraftBody(null);
    try {
      const result = await postInboundImport(buildAddInboundImportBody(input));
      invalidateReceivingFeeds(queryClient);
      toast.success(result.created ? 'Return added to Incoming' : 'Return refreshed on Incoming');
      if (result.ticket && !result.ticket.success) {
        setTicketDraftBody(result.ticket.draftBody);
        toast.error(result.ticket.error ?? 'Return saved — ticket could not be filed');
        return;
      }
      if (result.ticket?.success && result.ticketNumber) toast.success(`Ticket ${result.ticketNumber} linked`);
      closeReceivingOrderComposer();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the return';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [input, queryClient]);

  return (
    <ReceivingOrderSheet
      kind="return"
      submitLabel="Add return"
      submitting={submitting}
      canSubmit={canSubmitAddInbound(input) && !ticketDraftBody}
      onSubmit={() => void submit()}
      status={
        error ? (
          <ComposerStatus tone="error">{error}</ComposerStatus>
        ) : ticketDraftBody ? (
          <ComposerStatus tone="blocked">Return saved. Copy the ticket draft above and file it by hand.</ComposerStatus>
        ) : missing.length > 0 ? (
          <ComposerStatus tone="blocked">Still need: {missing.join(', ')}.</ComposerStatus>
        ) : (
          <ComposerStatus tone="ready">Ready — adds the return and files its support ticket.</ComposerStatus>
        )
      }
    >
      <ReturnOrderFields draft={draft} onChange={patch} />
      <ReturnItemFields
        draft={draft}
        picked={picked}
        onChange={patch}
        onPick={(item) => {
          setPicked(item);
          patch({ sku: item?.sku ?? '', itemName: item?.product_title ?? '' });
        }}
      />
      {ticketDraftBody ? (
        <ComposerSection label="Ticket draft — filing failed">
          <ComposerTextArea readOnly value={ticketDraftBody} aria-label="Ticket draft body" className="min-h-28" />
        </ComposerSection>
      ) : null}
    </ReceivingOrderSheet>
  );
}
