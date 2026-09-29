'use client';

/**
 * `/incoming/new` — THE inbound-order form, the inbound twin of `/orders/new`.
 * `?type=` (PO · RETURN · TRADE_IN · PICKUP) picks the type it opens on;
 * switching the type here writes it back (replace, not push) so a reload keeps
 * it. One fixed-width stage, two thirds entry | one third identity & outcome:
 *   left  — the order (type, platform, number, vendor, account, priority,
 *           dates), its shipment, its items, return facts, notes;
 *   right — what the order IS (its CycleForge identity) and what landing it
 *           will DO (create / update each line, the carton, conflicts),
 *           read from the server dry run of the exact draft — plus the submit.
 * Lands through POST /api/receiving/inbound/orders → ingestInboundOrder; the
 * done screen offers the next order of the same type or the way back.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { TriageSections } from '@/design-system/components/TriageSections';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { useDebounce } from '@/hooks';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import {
  emptyInboundOrderDraft,
  inboundOrderMissing,
  INBOUND_ORDER_TYPE_LABELS,
  type InboundOrderDraft,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { INBOUND_ORDER_TYPE_PARAM, parseInboundOrderTypeParam } from '@/lib/inbound/new-inbound-order-path';
import { postInboundOrder, postInboundOrderPreview } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { useInboundOrderSections } from './InboundOrderFields';
import { InboundOrderOutcome } from './InboundOrderOutcome';

/** The stage's fixed measure — the desk stage ceiling (DESK_STAGE_MAX_PX, 1152px). */
const STAGE_WIDTH_CLASS = 'w-full max-w-[72rem]';
const INCOMING_PATH = '/incoming';

interface LandedOrder {
  type: InboundOrderType;
  orderNumber: string;
  lineCount: number;
  unchanged: boolean;
}

/** Remounts a blank form (same `?type=`) for the next order once one lands. */
export function NewInboundOrderPage() {
  const [session, setSession] = useState(0);
  const next = useCallback(() => setSession((n) => n + 1), []);
  return <InboundOrderForm key={session} onNext={next} />;
}

function InboundOrderForm({ onNext }: { onNext: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlType = parseInboundOrderTypeParam(searchParams.get(INBOUND_ORDER_TYPE_PARAM));
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InboundOrderDraft>(() => emptyInboundOrderDraft(urlType));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InboundOrderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [landed, setLanded] = useState<LandedOrder | null>(null);
  const idempotencyKey = useRef(safeRandomUUID());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const missing = useMemo(() => inboundOrderMissing(draft), [draft]);
  const pristine = useMemo(
    () => JSON.stringify(draft) === JSON.stringify(emptyInboundOrderDraft(draft.type)),
    [draft],
  );
  const debounced = useDebounce(draft, 350);

  useEffect(() => titleRef.current?.focus(), []);

  const leave = useCallback(
    () => router.push(draft.type === 'PICKUP' ? (pathname.startsWith('/m/') ? '/m/receiving' : '/pickup') : INCOMING_PATH),
    [draft.type, pathname, router],
  );

  // A door that lands here with another `?type=` (header + New return) switches
  // the open form in place, or starts the next one from the done screen.
  const shownType = useRef(urlType);
  useEffect(() => {
    if (shownType.current === urlType) return;
    shownType.current = urlType;
    if (landed) onNext();
    else setDraft((d) => (d.type === urlType ? d : { ...d, type: urlType }));
  }, [urlType, landed, onNext]);

  // Switching the type in the form writes `?type=` back — replace, so the
  // history keeps one entry and a reload reopens on the same type.
  const writeType = useCallback(
    (type: InboundOrderType) => {
      if (type === urlType) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set(INBOUND_ORDER_TYPE_PARAM, type);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [urlType, searchParams, pathname, router],
  );

  const patch = useCallback(
    (next: Partial<InboundOrderDraft>) => {
      setDraft((d) => ({ ...d, ...next }));
      if (next.type) writeType(next.type);
    },
    [writeType],
  );

  const replace = useCallback(
    (next: InboundOrderDraft) => {
      setDraft(next);
      writeType(next.type);
    },
    [writeType],
  );

  // Esc leaves for Incoming when nothing is typed yet (or the order landed)
  // and no popover / dialog owns the key.
  const canLeaveOnEscape = pristine || landed != null;
  useEffect(() => {
    if (!canLeaveOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      event.preventDefault();
      leave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canLeaveOnEscape, leave]);

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
      setLanded({
        type: draft.type,
        orderNumber: result.identity.externalOrderId,
        lineCount: result.lines.length,
        unchanged: result.unchanged,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [draft, queryClient]);

  const sections = useInboundOrderSections({ draft, missing, preview, onChange: patch, onReplace: replace });

  if (landed) {
    return (
      <div className="h-full w-full overflow-y-auto" data-testid="new-inbound-order">
        <div
          className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center"
          data-testid="new-inbound-order-done"
        >
          <span className="flex size-12 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
            <Check className="size-6" />
          </span>
          <h1 className="text-role-title font-semibold text-text-default">
            {INBOUND_ORDER_TYPE_LABELS[landed.type]} <span className="font-mono">{landed.orderNumber}</span> is on Incoming
          </h1>
          <p className="text-role-body text-text-muted">
            {landed.lineCount} line{landed.lineCount === 1 ? '' : 's'}
            {landed.unchanged ? ' · nothing changed' : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="ink" icon={<Plus className="size-4" />} onClick={onNext} autoFocus data-testid="new-inbound-order-next">
              Next {INBOUND_ORDER_TYPE_LABELS[landed.type].toLowerCase()}
            </Button>
            <Button variant="secondary" onClick={leave} data-testid="new-inbound-order-back">
              Back to {landed.type === 'PICKUP' ? 'Local Pickup' : 'Incoming'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-surface-canvas" data-testid="new-inbound-order">
      <form
        data-testid="new-inbound-order-form"
        aria-labelledby="new-inbound-order-title"
        className={cn('mx-auto grid grid-cols-1 items-start gap-x-4 py-5 lg:grid-cols-3', STAGE_WIDTH_CLASS)}
        onSubmit={(event) => {
          event.preventDefault();
          if (missing.length === 0 && !submitting) void submit();
        }}
      >
        <header className="col-span-1 flex items-center gap-3 px-4 lg:col-span-3 lg:px-6">
          <h1
            id="new-inbound-order-title"
            ref={titleRef}
            tabIndex={-1}
            className="flex-1 text-role-title font-semibold text-text-default outline-none"
          >
            New {INBOUND_ORDER_TYPE_LABELS[draft.type].toLowerCase()}
          </h1>
          <IconButton icon={<X className="h-4 w-4" />} ariaLabel="Close — back to Incoming" onClick={leave} />
        </header>
        <div className="col-span-1 min-w-0 lg:col-span-2">
          <TriageSections sections={sections} />
        </div>
        <aside className={cn('mx-4 mt-5 lg:sticky lg:top-5 lg:mx-0', DESK_RECORD_COLUMN_CARD_CLASS)} aria-label="Identity and outcome">
          <InboundOrderOutcome
            draft={draft}
            missing={missing}
            preview={preview}
            previewing={previewing}
            submitting={submitting}
            error={error}
            onCancel={leave}
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
