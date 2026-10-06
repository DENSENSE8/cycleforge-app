'use client';

/**
 * `/m/receiving/order` — the PHONE face of the one inbound-order form (the
 * desk's is `/purchasing/new`). Same model (`useInboundOrderForm`: draft,
 * `inboundOrderMissing`, dry run, listing photos held per item until the
 * order lands), same writer (POST /api/receiving/inbound/orders →
 * `ingestInboundOrder`).
 *
 *   - new:   `/m/receiving/order?type=PO|RETURN` — type, platform, order #,
 *            priority, items (catalog product, qty, price, listing, condition
 *            bought at, serials, photos), every tracking number, details.
 *            `?fill=1` opens Paste or photo first.
 *   - fix:   `/m/receiving/order?id=<inbound_order_id>` — the landed order
 *            reopened with its identity locked and its line keys kept.
 *
 * One job on screen; an item, the tracking list and the optional details are
 * edited in task-local sheets; the ONE sticky dock carries the commit, which
 * names what is still missing while it cannot land.
 */

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardPaste } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import {
  addInboundTracking,
  inboundAutoPriorityLabel,
  inboundPriorityChoices,
  INBOUND_FORM_ID_PARAM,
  INBOUND_FORM_TYPE_PARAM,
  parseInboundFormOrderId,
  parseInboundFormType,
  RETURN_REASON_CHOICES,
  type InboundFormType,
} from '@/lib/inbound/inbound-order-compose';
import {
  composeInboundReturnReason,
  emptyInboundOrderLine,
  INBOUND_ORDER_TYPE_LABELS,
  parseInboundReturnReason,
  type InboundOrderDraft,
  type InboundReturnReason,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderEditRecord } from '@/lib/inbound/inbound-order-edit';
import { fetchInboundOrderEdit } from '@/lib/inbound/inbound-order-client';
import { useInboundOrderForm } from '@/lib/inbound/use-inbound-order-form';
import { useInboundPlatformChoices } from '@/lib/inbound/use-inbound-platform-choices';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';
import { MobileV2InboundDetailsSheet } from './MobileV2InboundDetailsSheet';
import { MobileV2InboundFillSheet } from './MobileV2InboundFillSheet';
import { MobileV2InboundLineSheet } from './MobileV2InboundLineSheet';
import { InboundChoiceSheet } from './MobileV2InboundParts';
import {
  InboundItemsSection,
  InboundLandedView,
  InboundOrderFactsSection,
  InboundStillNeeded,
  InboundTrackingSection,
  type InboundPicker,
} from './MobileV2InboundSections';
import { MobileV2InboundTrackingSheet } from './MobileV2InboundTrackingSheet';

const NEW_ORDER_DOORS = '/m/receiving/new';

type Sheet = InboundPicker | 'tracking' | 'fill' | { line: number | null };
type DockId = 'fill' | 'submit';

/** Loads the order to fix (`?id=`), then mounts the form; remounts blank for the next order. */
export function MobileV2InboundOrderComposer() {
  const params = useSearchParams();
  const editId = parseInboundFormOrderId(params.get(INBOUND_FORM_ID_PARAM));
  const back = mobileJobReturn(params.get('back')) ?? (editId != null ? '/m/receiving' : NEW_ORDER_DOORS);
  const [session, setSession] = useState(0);
  const edit = useQuery({
    queryKey: ['inbound-order-edit', editId],
    queryFn: ({ signal }) => fetchInboundOrderEdit(editId!, signal),
    enabled: editId != null,
    staleTime: 0,
  });

  if (editId != null && !edit.data) {
    return (
      <div className="flex min-h-full flex-col bg-mode-panel">
        <MobileV2DetailTopBar title={`Order ${editId}`} subtitle="Fix inbound order" backHref={back} close />
        <p className="px-6 py-16 text-center text-role-body text-text-muted">
          {edit.error ? (edit.error as Error).message : 'Loading the order…'}
        </p>
      </div>
    );
  }
  return (
    <InboundOrderForm
      key={`${editId ?? 'new'}:${session}`}
      record={editId != null ? (edit.data ?? null) : null}
      type={parseInboundFormType(params.get(INBOUND_FORM_TYPE_PARAM))}
      openFill={editId == null && session === 0 && params.get('fill') === '1'}
      back={back}
      onNext={() => setSession((n) => n + 1)}
    />
  );
}

function InboundOrderForm({
  record,
  type,
  openFill,
  back,
  onNext,
}: {
  record: InboundOrderEditRecord | null;
  type: InboundFormType;
  openFill: boolean;
  back: string;
  onNext: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const platforms = useInboundPlatformChoices();
  const form = useInboundOrderForm({ record, type });
  const { draft, missing, preview, submitting, landing } = form;
  const [sheet, setSheet] = useState<Sheet | null>(openFill ? 'fill' : null);
  const close = useCallback(() => setSheet(null), []);
  const fixing = record != null;
  const refusal = record?.refusal ?? null;

  if (landing) return <InboundLandedView landing={landing} fixing={fixing} back={back} onNext={onNext} onBack={() => router.push(back)} />;

  const typeLabel = INBOUND_ORDER_TYPE_LABELS[draft.type];
  const platformLabel = platforms.find((p) => p.value === draft.platform)?.label ?? (draft.platform || null);
  const priorityChoices = inboundPriorityChoices(inboundAutoPriorityLabel(draft.platform, platformLabel));
  const priorityLabel = priorityChoices.find((c) => c.value === draft.priority)?.label ?? draft.priority;
  const lineSheet = sheet != null && typeof sheet === 'object' ? sheet : null;
  const sheetLine = lineSheet?.line != null ? draft.lines[lineSheet.line] : null;
  const photosHeld = form.photos.some((p) => p.length > 0);
  const blocked = missing.length > 0 || refusal != null || (Boolean(preview?.unchanged) && !photosHeld);
  // R9: a disabled commit names what is missing.
  const submitLabel = missing.length
    ? `Need ${missing[0]!.label.charAt(0).toLowerCase()}${missing[0]!.label.slice(1)}${missing.length > 1 ? ` +${missing.length - 1}` : ''}`
    : fixing || preview?.existing
      ? `Save ${typeLabel.toLowerCase()}`
      : `Add ${typeLabel.toLowerCase()}`;

  const verbs: DetailDockVerb<DockId>[] = [
    ...(fixing ? [] : [{ id: 'fill' as const, label: 'Paste or photo', icon: <ClipboardPaste />, testId: 'm-inbound-fill' }]),
    { id: 'submit', label: submitLabel, icon: <Check />, primary: true, disabled: blocked || submitting, loading: submitting, testId: 'm-inbound-submit' },
  ];

  const changeType = (next: InboundFormType) => {
    form.patch({ type: next });
    const params = new URLSearchParams(searchParams.toString());
    params.set(INBOUND_FORM_TYPE_PARAM, next);
    params.delete('fill');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-inbound-order">
      <MobileV2DetailTopBar
        title={fixing ? draft.orderNumber : `Add ${typeLabel.toLowerCase()}`}
        subtitle={record ? `Fix ${typeLabel.toLowerCase()} · ${record.status.replace(/_/g, ' ')}` : 'Purchasing'}
        mono={fixing}
        backHref={back}
        close
      />

      {fixing ? (
        <p className={cn('border-b border-mode-rule px-mode-page py-2 text-role-caption', refusal ? 'text-text-warning' : 'text-text-muted')} data-testid="m-inbound-fixing">
          {refusal ?? `Correcting inbound order ${record?.inboundOrderId}. Platform and order number are its identity; items already on it are edited in place.`}
        </p>
      ) : preview?.existing ? (
        <p className="border-b border-mode-rule px-mode-page py-2 text-role-caption text-text-warning" data-testid="m-inbound-exists">
          Already on file as inbound order {preview.existing.inboundOrderId} — adding updates it.
        </p>
      ) : null}

      <InboundOrderFactsSection form={form} platformLabel={platformLabel} priorityLabel={priorityLabel} onTypeChange={changeType} onPick={setSheet} />
      <InboundItemsSection form={form} onOpenLine={(line) => setSheet({ line })} />
      <InboundTrackingSection form={form} onAdd={() => setSheet('tracking')} />
      <InboundStillNeeded missing={missing} />

      <div className="flex-1" />
      <DetailDock label={typeLabel} verbs={verbs} onVerb={(id) => (id === 'fill' ? setSheet('fill') : form.submit())} />

      <InboundChoiceSheet
        open={sheet === 'platform'}
        onClose={close}
        title={draft.type === 'RETURN' ? 'Sold on' : 'Platform'}
        options={platforms}
        value={draft.platform || null}
        onPick={(platform) => form.patch({ platform })}
        testId="m-inbound-platform-sheet"
      />
      <InboundChoiceSheet
        open={sheet === 'priority'}
        onClose={close}
        title="Priority"
        options={priorityChoices}
        value={draft.priority}
        onPick={(priority) => form.patch({ priority: priority as InboundOrderDraft['priority'] })}
        testId="m-inbound-priority-sheet"
      />
      <InboundChoiceSheet
        open={sheet === 'reason'}
        onClose={close}
        title="Return reason"
        options={RETURN_REASON_CHOICES}
        value={parseInboundReturnReason(draft.returnReason).reason}
        onPick={(reason) =>
          form.patch({ returnReason: composeInboundReturnReason(reason as InboundReturnReason, parseInboundReturnReason(draft.returnReason).detail) })
        }
        testId="m-inbound-reason-sheet"
      />
      <MobileV2InboundDetailsSheet open={sheet === 'details'} draft={draft} onChange={form.patch} onClose={close} />
      <MobileV2InboundTrackingSheet
        open={sheet === 'tracking'}
        count={draft.tracking.filter((t) => t.number.trim()).length}
        onAdd={(numbers) => form.patch({ tracking: addInboundTracking(draft, numbers).tracking })}
        onClose={close}
      />
      {fixing ? null : <MobileV2InboundFillSheet open={sheet === 'fill'} type={draft.type} onClose={close} onUse={form.replace} />}
      {lineSheet ? (
        <MobileV2InboundLineSheet
          key={lineSheet.line ?? 'new'}
          line={sheetLine ?? emptyInboundOrderLine()}
          photos={lineSheet.line != null ? (form.photos[lineSheet.line] ?? []) : []}
          landedPhotos={sheetLine ? form.landedPhotos(sheetLine) : []}
          position={lineSheet.line == null ? null : lineSheet.line + 1}
          landed={sheetLine != null && (record?.landedLineKeys.includes(sheetLine.lineKey) ?? false)}
          received={sheetLine ? (record?.receivedByLineKey[sheetLine.lineKey] ?? 0) : 0}
          currency={draft.currency}
          isReturn={draft.type === 'RETURN'}
          onClose={close}
          onDeleteLanded={(photo) => void form.deleteLandedPhoto(photo)}
          onRemove={() => {
            if (lineSheet.line != null) form.removeLine(lineSheet.line);
            close();
          }}
          onDone={(line, photos) => {
            form.putLine(lineSheet.line, line, photos);
            close();
          }}
        />
      ) : null}
    </div>
  );
}
