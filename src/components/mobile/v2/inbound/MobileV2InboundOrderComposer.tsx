'use client';

/**
 * `/m/receiving/order` — the PHONE face of the one inbound-order form (the
 * desk's is `/incoming/new`). Same draft (`InboundOrderDraft`), same checklist
 * (`inboundOrderMissing`), same editing model (`inbound-order-compose.ts`),
 * same writer (POST /api/receiving/inbound/orders → `ingestInboundOrder`).
 *
 *   - new:   `/m/receiving/order` — platform, order #, vendor, urgency, items,
 *            tracking, notes. `?fill=1` opens Paste or photo first.
 *   - fix:   `/m/receiving/order?id=<inbound_order_id>` — the landed order
 *            reopened with its identity locked and its line keys kept, so the
 *            re-save edits the same order and lines (content hash → updated).
 *
 * One job on screen; each line is edited in a task-local sheet; the ONE
 * sticky dock carries the commit, enabled only when nothing is missing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardPaste } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { TextField } from '@/design-system/primitives';
import { useDebounce } from '@/hooks';
import {
  addInboundTracking,
  appendInboundLine,
  patchInboundLine,
  removeInboundLine,
  removeInboundTracking,
} from '@/lib/inbound/inbound-order-compose';
import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  inboundOrderMissing,
  type InboundOrderDraft,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderEditRecord } from '@/lib/inbound/inbound-order-edit';
import { fetchInboundOrderEdit, postInboundOrder, postInboundOrderPreview } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { useInboundPlatformChoices } from '@/lib/inbound/use-inbound-platform-choices';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { MobileV2InboundFillSheet } from './MobileV2InboundFillSheet';
import { MobileV2InboundLineSheet } from './MobileV2InboundLineSheet';
import { InboundChoiceSheet, InboundSectionHeading } from './MobileV2InboundParts';
import {
  INBOUND_PRIORITY_CHOICES,
  InboundItemsSection,
  InboundLandedView,
  InboundOrderFactsSection,
  InboundStillNeeded,
  InboundTrackingSection,
  type InboundLanded,
} from './MobileV2InboundSections';
import { MobileV2InboundTrackingSheet } from './MobileV2InboundTrackingSheet';

const NEW_ORDER_DOORS = '/m/receiving/new';

type Sheet = 'platform' | 'priority' | 'tracking' | 'fill' | { line: number | null };
type DockId = 'fill' | 'submit';

/** Loads the order to fix (`?id=`), then mounts the form; remounts blank for the next order. */
export function MobileV2InboundOrderComposer() {
  const params = useSearchParams();
  const editId = Number(params.get('id'));
  const editing = Number.isInteger(editId) && editId > 0;
  const back = mobileJobReturn(params.get('back')) ?? (editing ? '/m/receiving' : NEW_ORDER_DOORS);
  const [session, setSession] = useState(0);
  const edit = useQuery({
    queryKey: ['inbound-order-edit', editId],
    queryFn: ({ signal }) => fetchInboundOrderEdit(editId, signal),
    enabled: editing,
    staleTime: 0,
  });

  if (editing && !edit.data) {
    return (
      <div className="flex min-h-full flex-col bg-mode-panel">
        <MobileV2DetailTopBar title={`Order ${editId}`} subtitle="Fix purchase order" backHref={back} close />
        <p className="px-6 py-16 text-center text-role-body text-text-muted">
          {edit.error ? (edit.error as Error).message : 'Loading the order…'}
        </p>
      </div>
    );
  }
  return (
    <InboundOrderForm
      key={`${editing ? editId : 'new'}:${session}`}
      record={editing ? edit.data ?? null : null}
      openFill={!editing && session === 0 && params.get('fill') === '1'}
      back={back}
      onNext={() => setSession((n) => n + 1)}
    />
  );
}

function InboundOrderForm({
  record,
  openFill,
  back,
  onNext,
}: {
  record: InboundOrderEditRecord | null;
  openFill: boolean;
  back: string;
  onNext: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const platforms = useInboundPlatformChoices();
  const [draft, setDraft] = useState<InboundOrderDraft>(() => record?.draft ?? emptyInboundOrderDraft('PO'));
  const [sheet, setSheet] = useState<Sheet | null>(openFill ? 'fill' : null);
  const [submitting, setSubmitting] = useState(false);
  const [landed, setLanded] = useState<InboundLanded | null>(null);
  const [preview, setPreview] = useState<InboundOrderPreview | null>(null);
  const idempotencyKey = useRef(safeRandomUUID());
  const missing = useMemo(() => inboundOrderMissing(draft), [draft]);
  const debounced = useDebounce(draft, 400);
  const fixing = record != null;
  const refusal = record?.refusal ?? null;
  const landedKeys = useMemo(() => new Set(record?.landedLineKeys ?? []), [record]);

  // New orders only: is this platform + number already on Incoming? Then adding it corrects that order.
  useEffect(() => {
    if (fixing || !debounced.platform.trim() || !debounced.orderNumber.trim()) {
      setPreview(null);
      return;
    }
    const abort = new AbortController();
    postInboundOrderPreview(debounced, abort.signal)
      .then(setPreview)
      .catch(() => {
        if (!abort.signal.aborted) setPreview(null);
      });
    return () => abort.abort();
  }, [debounced, fixing]);

  const patch = useCallback((next: Partial<InboundOrderDraft>) => setDraft((d) => ({ ...d, ...next })), []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const { result } = await postInboundOrder(draft, idempotencyKey.current);
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['inbound-order-edit'] });
      void queryClient.invalidateQueries({ queryKey: ['inbound-orders-for-carton'] });
      setLanded({
        orderNumber: result.identity.externalOrderId,
        lineCount: result.lines.length,
        created: result.created,
        unchanged: result.unchanged,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the order');
    } finally {
      setSubmitting(false);
    }
  }, [draft, queryClient]);

  if (landed) return <InboundLandedView landed={landed} fixing={fixing} back={back} onNext={onNext} onBack={() => router.push(back)} />;

  const platformLabel = platforms.find((p) => p.value === draft.platform)?.label ?? (draft.platform || null);
  const lineSheet = sheet != null && typeof sheet === 'object' ? sheet : null;
  const sheetLine = lineSheet?.line != null ? draft.lines[lineSheet.line] : null;

  const verbs: DetailDockVerb<DockId>[] = [
    ...(fixing ? [] : [{ id: 'fill' as const, label: 'Paste or photo', icon: <ClipboardPaste />, testId: 'm-inbound-fill' }]),
    {
      id: 'submit',
      label: fixing ? 'Save changes' : 'Add to Incoming',
      icon: <Check />,
      primary: true,
      disabled: missing.length > 0 || refusal != null || submitting,
      loading: submitting,
      testId: 'm-inbound-submit',
    },
  ];

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-inbound-order">
      <MobileV2DetailTopBar
        title={fixing ? draft.orderNumber : 'New purchase order'}
        subtitle={record ? `Fix purchase order · ${record.status.replace(/_/g, ' ')}` : 'Receiving'}
        mono={fixing}
        backHref={back}
        close
      />

      {fixing ? (
        <p
          className={cn('border-b border-mode-rule px-mode-page py-2 text-role-caption', refusal ? 'text-text-warning' : 'text-text-muted')}
          data-testid="m-inbound-fixing"
        >
          {refusal ??
            `Correcting inbound order ${record?.inboundOrderId}. Platform and order number are its identity; items already on it are edited in place.`}
        </p>
      ) : preview?.existing ? (
        <p className="border-b border-mode-rule px-mode-page py-2 text-role-caption text-text-warning" data-testid="m-inbound-exists">
          Already on Incoming as order {preview.existing.inboundOrderId} — adding updates it.
        </p>
      ) : null}

      <InboundOrderFactsSection
        draft={draft}
        missing={missing}
        platformLabel={platformLabel}
        identityLocked={fixing}
        onChange={patch}
        onPick={setSheet}
      />

      <InboundItemsSection draft={draft} missing={missing} onOpenLine={(line) => setSheet({ line })} />
      <InboundTrackingSection
        draft={draft}
        onScan={() => setSheet('tracking')}
        onRemove={(index) => setDraft((d) => removeInboundTracking(d, index))}
      />

      <InboundSectionHeading>Notes</InboundSectionHeading>
      <div className="border-b border-mode-rule px-mode-page py-3">
        <TextField label="Notes for receiving" value={draft.notes} multiline rows={3} onChange={(notes) => patch({ notes })} data-testid="m-inbound-notes" />
      </div>

      <InboundStillNeeded missing={missing} />

      <div className="flex-1" />
      <DetailDock
        label="Purchase order"
        verbs={verbs}
        onVerb={(id) => (id === 'fill' ? setSheet('fill') : submit())}
      />

      <InboundChoiceSheet
        open={sheet === 'platform'}
        onClose={() => setSheet(null)}
        title="Platform"
        options={platforms}
        value={draft.platform || null}
        onPick={(platform) => patch({ platform })}
        testId="m-inbound-platform-sheet"
      />
      <InboundChoiceSheet
        open={sheet === 'priority'}
        onClose={() => setSheet(null)}
        title="Urgency"
        options={INBOUND_PRIORITY_CHOICES}
        value={draft.priority}
        onPick={(priority) => patch({ priority: priority as InboundOrderDraft['priority'] })}
        testId="m-inbound-priority-sheet"
      />
      <MobileV2InboundTrackingSheet
        open={sheet === 'tracking'}
        onClose={() => setSheet(null)}
        onScan={(number) => setDraft((d) => addInboundTracking(d, number))}
      />
      {fixing ? null : (
        <MobileV2InboundFillSheet
          open={sheet === 'fill'}
          type={draft.type}
          onClose={() => setSheet(null)}
          onUse={(read) => setDraft(read)}
        />
      )}
      {lineSheet ? (
        <MobileV2InboundLineSheet
          key={lineSheet.line ?? 'new'}
          line={sheetLine ?? emptyInboundOrderLine()}
          position={lineSheet.line == null ? null : lineSheet.line + 1}
          landed={sheetLine != null && landedKeys.has(sheetLine.lineKey)}
          received={sheetLine ? record?.receivedByLineKey[sheetLine.lineKey] ?? 0 : 0}
          currency={draft.currency}
          onClose={() => setSheet(null)}
          onRemove={() => {
            if (lineSheet.line != null) setDraft((d) => removeInboundLine(d, lineSheet.line!));
            setSheet(null);
          }}
          onDone={(line) => {
            setDraft((d) => (lineSheet.line == null ? appendInboundLine(d, line).draft : patchInboundLine(d, lineSheet.line, line)));
            setSheet(null);
          }}
        />
      ) : null}
    </div>
  );
}
