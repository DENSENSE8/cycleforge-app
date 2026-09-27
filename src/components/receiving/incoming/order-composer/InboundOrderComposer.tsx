'use client';

/**
 * `/incoming` Add — THE inbound-order form. One fixed-width triage stage,
 * two thirds entry | one third identity & outcome:
 *   left  — the order (type, platform, number, vendor, account, priority,
 *           dates), its shipment, its items, return facts, notes;
 *   right — what the order IS (its CycleForge identity) and what landing it
 *           will DO (create / update each line, the carton, conflicts),
 *           read from the server dry run of the exact draft — plus the submit.
 * Lands through POST /api/receiving/inbound/orders → ingestInboundOrder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { TriageSections } from '@/design-system/components/TriageSections';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { useDebounce } from '@/hooks';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { closeReceivingOrderComposer } from '@/lib/inbound/receiving-order-composer-store';
import {
  emptyInboundOrderDraft,
  inboundOrderMissing,
  INBOUND_ORDER_TYPE_LABELS,
  type InboundOrderDraft,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { postInboundOrder, postInboundOrderPreview } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { useInboundOrderSections } from './InboundOrderFields';
import { InboundOrderOutcome } from './InboundOrderOutcome';

/** The stage's fixed measure — the desk stage ceiling (DESK_STAGE_MAX_PX, 1152px). */
const STAGE_WIDTH_CLASS = 'w-[72rem]';

export function InboundOrderComposer({ initialType }: { initialType: InboundOrderType }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InboundOrderDraft>(() => emptyInboundOrderDraft(initialType));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InboundOrderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const idempotencyKey = useRef(safeRandomUUID());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const missing = useMemo(() => inboundOrderMissing(draft), [draft]);
  const debounced = useDebounce(draft, 350);

  useEffect(() => titleRef.current?.focus(), []);
  // The "Add return" door re-opens the form on another type without a remount.
  useEffect(() => setDraft((d) => ({ ...d, type: initialType })), [initialType]);

  useEffect(() => {
    if (!debounced.orderNumber.trim() && !debounced.lines.some((l) => l.sku.trim() || l.skuCatalogId != null)) {
      setPreview(null);
      return;
    }
    const abort = new AbortController();
    setPreviewing(true);
    postInboundOrderPreview(debounced, abort.signal)
      .then(setPreview)
      .catch((err: unknown) => {
        if (!abort.signal.aborted) setPreview(null);
        if (!abort.signal.aborted) console.warn('[inbound] preview failed', err);
      })
      .finally(() => {
        if (!abort.signal.aborted) setPreviewing(false);
      });
    return () => abort.abort();
  }, [debounced, previewNonce]);

  const patch = useCallback((next: Partial<InboundOrderDraft>) => setDraft((d) => ({ ...d, ...next })), []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { result, ticket } = await postInboundOrder(draft, idempotencyKey.current);
      invalidateReceivingFeeds(queryClient);
      const label = INBOUND_ORDER_TYPE_LABELS[draft.type];
      toast.success(
        result.unchanged
          ? `${label} ${result.identity.externalOrderId} is already on Incoming — nothing changed`
          : `${label} ${result.identity.externalOrderId} ${result.created ? 'added to' : 'updated on'} Incoming · ${result.lines.length} line${result.lines.length === 1 ? '' : 's'}`,
      );
      if (ticket?.success && ticket.ticketNumber) toast.success(`Ticket ${ticket.ticketNumber} linked`);
      if (ticket && !ticket.success) toast.error(`Return landed; the claim ticket was not filed — ${ticket.error}`);
      closeReceivingOrderComposer();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [draft, queryClient]);

  const sections = useInboundOrderSections({ draft, missing, preview, onChange: patch, onReplace: setDraft });

  return (
    <div
      data-testid="receiving-order-composer-stage"
      className="flex min-h-0 min-w-0 flex-1 overflow-auto bg-surface-canvas"
    >
      <form
        data-testid="receiving-order-composer"
        aria-labelledby="inbound-order-composer-title"
        className={cn('mx-auto grid shrink-0 grid-cols-3 items-start gap-x-4 py-5', STAGE_WIDTH_CLASS)}
        onSubmit={(event) => {
          event.preventDefault();
          if (missing.length === 0 && !submitting) void submit();
        }}
      >
        <header className="col-span-3 flex items-center gap-3 px-6">
          <h2
            id="inbound-order-composer-title"
            ref={titleRef}
            tabIndex={-1}
            className={cn(RECORD_TITLE_CLASS, 'flex-1 outline-none')}
          >
            New inbound order
          </h2>
          <IconButton
            icon={<X className="h-4 w-4" />}
            ariaLabel="Close new inbound order"
            onClick={closeReceivingOrderComposer}
          />
        </header>
        <div className="col-span-2 min-w-0">
          <TriageSections sections={sections} />
        </div>
        <aside className={cn('sticky top-5 mt-5', DESK_RECORD_COLUMN_CARD_CLASS)} aria-label="Identity and outcome">
          <InboundOrderOutcome
            draft={draft}
            missing={missing}
            preview={preview}
            previewing={previewing}
            submitting={submitting}
            error={error}
            onCancel={closeReceivingOrderComposer}
            onDeleted={() => {
              invalidateReceivingFeeds(queryClient);
              setPreviewNonce((n) => n + 1);
            }}
          />
        </aside>
      </form>
    </div>
  );
}
