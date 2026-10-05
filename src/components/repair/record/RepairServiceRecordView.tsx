'use client';

/**
 * The REPAIR RECORD — the repair ticket on the ONE two-column record Inbound
 * (`InboundRecordView`) and Outbound (`OrderRecordView`) use (owner
 * 2026-09-30):
 *
 *   left  — Fulfillment FIRST (the repair's status points on the internal
 *           rail, the inbound carrier scans on the external one for a
 *           shipped-in ticket; the SLA top-right) → Device (the reported
 *           issue, the serial, the price) → Status history → Staff notes.
 *   right — Photos → alerts → the product exactly as the inbound item →
 *           Customer → Ticket (channel, tracking, carton, Zendesk #).
 *
 * Verbs live in the record header (`RecordActionStrip face="header"`, built in
 * `repair-record-verbs.tsx`); a panel verb swaps this body for its panel.
 */

import { useCallback, type ReactNode } from 'react';
import { StaffNotesEditor } from '@/components/sidebar/receiving/incoming-details/NotesTab';
import { LedgerOpenAction } from '@/components/outbound/orders/outbound-orders-ledger-editors';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { RepairRecordPhotos } from './RepairRecordPhotos';
import { RepairActivityLog } from './RepairActivityLog';
import {
  RepairCarrierRail,
  RepairRecordAlerts,
  RepairRecordFlow,
  RepairStatusHistory,
  RepairStepRail,
  SerialEditor,
} from './repair-record-parts';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordFulfillmentSources } from '@/design-system/components/record-ledger/RecordFulfillmentSources';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RecordItem } from '@/design-system/components/record-ledger/RecordItem';
import { RecordSerials } from '@/design-system/components/record-ledger/RecordSerials';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { RECORD_DEADLINE_DOT_CLASS, RECORD_DEADLINE_TONE_CLASS } from '@/design-system/tokens/record-card';
import type { RepairRecordModel } from '@/lib/repair/repair-record-model';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';

/** A verb's panel, in place of the record body while it is open. */
export interface RepairRecordPanel {
  title: string;
  body: ReactNode;
  onBack: () => void;
}

/** The record header's title — the ticket identifier, or "No ticket #" when it has none. */
export function RepairRecordTitle({ title }: { title: RepairRecordModel['title'] }) {
  return (
    <span className="flex min-w-max flex-nowrap items-center gap-1 whitespace-nowrap" data-testid="repair-record-title">
      {title.ticket ? (
        <span className="shrink-0 select-all">{title.ticket}</span>
      ) : (
        <span className="shrink-0 text-mode-muted">{title.face}</span>
      )}
    </span>
  );
}

export function RepairServiceRecordView({
  model,
  panel,
  onUpdate,
}: {
  model: RepairRecordModel;
  panel: RepairRecordPanel | null;
  /** Refetch the record after a write. */
  onUpdate: () => void;
}) {
  const saveNotes = useCallback(
    async (text: string | null) => {
      const res = await fetch('/api/repair-service', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, notes: text ?? '' }),
      });
      if (!res.ok) throw new Error(`Notes save failed (${res.status})`);
      onUpdate();
    },
    [model.id, onUpdate],
  );

  if (panel) {
    return (
      <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="repair-record-view" data-panel="">
        <DeskRecordLayout
          main={
            <RecordGroup
              title={panel.title}
              testId="repair-record-panel"
              action={
                <Button type="button" variant="ghost" size="sm" onClick={panel.onBack} data-testid="repair-record-panel-back">
                  Back
                </Button>
              }
            >
              <div className="px-4 pb-4 pt-1">{panel.body}</div>
            </RecordGroup>
          }
        />
      </div>
    );
  }

  const { device } = model;
  const fulfillment = (
    <RecordGroup
      title="Fulfillment"
      titleAccessory={
        // Pinned orange (owner 2026-09-29): the current status reads in ONE tone, whatever the stage.
        <span
          className={cn('inline-flex h-6 min-w-0 items-center gap-1.5 rounded-mode-pill px-2 text-role-data font-semibold', STATE_TONE_CLASSES.warning.pill)}
          aria-label={`Current status: ${model.status.label}`}
          data-testid="repair-record-current-status"
          data-status={model.status.stored}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', STATE_TONE_CLASSES.warning.dot)} aria-hidden />
          <span className="truncate">{model.status.label}</span>
        </span>
      }
      action={
        <span
          className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-role-caption tabular-nums', RECORD_DEADLINE_TONE_CLASS[model.sla.tone])}
          title={model.sla.tip ?? undefined}
          data-testid="repair-record-sla"
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', RECORD_DEADLINE_DOT_CLASS[model.sla.tone])} aria-hidden />
          {model.sla.face}
        </span>
      }
      testId="repair-record-fulfillment"
      singleLineHeader
    >
      <RecordFulfillmentSources
        key={model.key}
        flow="inbound"
        internal={<RepairStepRail steps={model.steps} closed={model.closed} />}
        external={model.tracking ? <RepairCarrierRail repairId={model.id} /> : null}
      />
    </RecordGroup>
  );

  const orderHref = device.orderId ? marketplaceOrderUrl(device.orderId, device.sourceSystem) : null;
  // Hard rule (owner 2026-09-30): the product lives in the 2/3 work column, never the aside.
  const left = (
    <div className="flex flex-col gap-4">
      {fulfillment}
      <RecordGroup title="Device" titleHidden testId="repair-record-device">
        <RecordItem
          testId="repair-record-item"
          title={device.title}
          photo={{ src: device.photoUrl }}
          sku={device.sku}
          item={{
            label: 'Order #',
            value: device.orderId ? (
              <CopyableCellValue
                value={device.orderId}
                historyKind="Order number"
                className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}
              />
            ) : (
              <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>Walk-in</span>
            ),
            actions: orderHref ? <LedgerOpenAction href={orderHref} label="order" /> : null,
          }}
          right={[
            {
              label: 'Price',
              value: (
                <span className={cn(device.price ? RECORD_PRICE_CLASS : RECORD_ID_CLASS, !device.price && 'text-mode-warn')}>{device.price ?? 'Not set'}</span>
              ),
            },
          ]}
        >
          <div className="flex min-w-0 flex-col pt-1">
            <span className="mode-label text-mode-muted">Reported issue</span>
            <p className={cn('whitespace-pre-line break-words text-role-data', device.issue ? 'text-mode-ink' : 'text-mode-muted')} data-testid="repair-record-issue">
              {device.issue ?? 'No issue described'}
            </p>
          </div>
        </RecordItem>
      </RecordGroup>
      <RecordSerials
        rows={device.serial ? [device.serial] : []}
        expected={device.serial ? undefined : 1}
        editor={<SerialEditor key={`${model.id}:${device.serial ?? ''}`} repairId={model.id} serial={device.serial} onSaved={onUpdate} />}
        testId="repair-record-serials"
      />
      <RecordGroup title="Status history" testId="repair-record-status-history">
        <RepairStatusHistory rows={model.history} />
      </RecordGroup>
      <RecordGroup title="Activity" testId="repair-record-activity">
        <RepairActivityLog repairId={model.id} />
      </RecordGroup>
      <RecordGroup title="Staff notes" testId="repair-record-notes">
        <div className="px-4 pb-3">
          <StaffNotesEditor
            initialValue={model.notes}
            resetKey={model.id}
            save={saveNotes}
            label={null}
            placeholder="Diagnosis, parts used, what was done…"
            testId="repair-staff-notes"
          />
        </div>
      </RecordGroup>
    </div>
  );

  const right = (
    <div className="flex flex-col gap-4">
      <RepairRecordPhotos key={`photos:${model.key}`} repairId={model.id} />
      <RepairRecordAlerts model={model} />
      <RepairRecordFlow model={model} />
    </div>
  );

  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="repair-record-view">
      <DeskRecordLayout main={left} aside={right} />
    </div>
  );
}
