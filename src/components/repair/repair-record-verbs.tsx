'use client';

/** The repair record's verbs for the desk's action strip (owner 2026-09-25: */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { Button } from '@/design-system/primitives/Button';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { buildRepairLabelPayload, printRepairLabel } from '@/lib/print/printRepairLabel';
import { REPAIR_WORKBENCH_STATUSES, repairStatusOperatorLabel } from '@/lib/repair-status';
import { repairTicketValue } from '@/lib/tables/field-catalog/repair-resolve';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { RepairPickupFlow } from './RepairPickupFlow';
import { RepairOrderLinkSearch } from './details-panel/RepairOrderLinkSearch';
import { useRepairDetailsPanel, type RepairDetailsController } from './details-panel/useRepairDetailsPanel';

const DISPLAY_CLASS = 'flex min-w-0 flex-1 flex-wrap items-center gap-1.5';

/** A one-line field in a strip display — the strip's own card chrome, one control tall. */
const STRIP_INPUT_CLASS = cn(
  'h-7 border border-border-default bg-surface-card px-2 text-role-data text-text-default placeholder:text-text-soft disabled:opacity-50',
  focusRing('field'),
);

/** Status — one press per workbench status; the current one is marked and inert. */
function StatusDisplay({ repair, c, done }: { repair: RSRecord; c: RepairDetailsController; done: () => void }) {
  return (
    <div className={DISPLAY_CLASS} data-testid="repair-strip-status">
      {REPAIR_WORKBENCH_STATUSES.map((next) => {
        const current = next === repair.status;
        return (
          <Button
            key={next}
            type="button"
            size="sm"
            variant={current ? 'ink' : 'secondary'}
            aria-pressed={current}
            disabled={c.updatingStatus || current}
            data-testid={`repair-strip-status-${next}`}
            onClick={async () => {
              await c.handleStatusChange(next);
              done();
            }}
          >
            {repairStatusOperatorLabel(next)}
          </Button>
        );
      })}
    </div>
  );
}

/** Edit ticket # — Enter or Save writes the existing PATCH; the display closes after. */
function TicketDisplay({ repair, c, done }: { repair: RSRecord; c: RepairDetailsController; done: () => void }) {
  const { setTicketNumber } = c;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setTicketNumber(repair.ticket_number || '');
  }, [repair.ticket_number, setTicketNumber]);
  const save = async () => {
    await c.handleSaveTicket();
    done();
  };
  return (
    <form
      className={DISPLAY_CLASS}
      data-testid="repair-strip-ticket"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-text-muted')}>Ticket #</span>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the display exists to type this one value
          autoFocus
          type="text"
          value={c.ticketNumber}
          onChange={(event) => c.setTicketNumber(event.target.value)}
          placeholder="Zendesk ticket #"
          disabled={c.isSavingTicket}
          aria-label="Ticket number"
          className={cn(STRIP_INPUT_CLASS, 'min-w-0 flex-1 font-mono')}
        />
      </label>
      <Button type="submit" size="sm" variant="ink" loading={c.isSavingTicket} data-testid="repair-strip-ticket-save">
        Save
      </Button>
    </form>
  );
}

/** Link / unlink — the existing `POST|DELETE /api/repair-service/:id/link` editor. */
function LinkDisplay({ repair, c, done }: { repair: RSRecord; c: RepairDetailsController; done: () => void }) {
  const { setLinkOrderId, setLinkTracking, setLinkSerial, setLinkSku } = c;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setLinkOrderId(repair.source_order_id || '');
    setLinkTracking(repair.source_tracking_number || '');
    setLinkSerial(repair.serial_number || '');
    setLinkSku(repair.source_sku || '');
  }, [repair, setLinkOrderId, setLinkTracking, setLinkSerial, setLinkSku]);
  const fields: Array<{ label: string; value: string; set: (value: string) => void; placeholder: string }> = [
    { label: 'TRK#', value: c.linkTracking, set: c.setLinkTracking, placeholder: 'Inbound tracking' },
    { label: 'Serial', value: c.linkSerial, set: c.setLinkSerial, placeholder: 'Unit serial' },
    { label: 'SKU', value: c.linkSku, set: c.setLinkSku, placeholder: 'Source SKU' },
  ];
  return (
    <div className={DISPLAY_CLASS} data-testid="repair-strip-links">
      <span className="w-64 min-w-0">
        <RepairOrderLinkSearch value={c.linkOrderId} onChange={c.setLinkOrderId} disabled={c.savingLink} />
      </span>
      {fields.map((field) => (
        <input
          key={field.label}
          type="text"
          aria-label={field.label}
          value={field.value}
          onChange={(event) => field.set(event.target.value)}
          placeholder={field.placeholder}
          disabled={c.savingLink}
          className={cn(STRIP_INPUT_CLASS, 'w-36 font-mono')}
        />
      ))}
      {c.hasAnyLink ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={c.savingLink}
          onClick={async () => {
            await c.handleClearLinks();
            done();
          }}
        >
          Unlink all
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ink"
        disabled={!c.linksDirty}
        loading={c.savingLink}
        onClick={async () => {
          await c.handleSaveLinks();
          done();
        }}
      >
        Save links
      </Button>
    </div>
  );
}

/** Every verb the open repair offers, in strip order. */
export function buildRepairVerbs(
  repair: RSRecord,
  c: RepairDetailsController,
  { onClose }: { onClose: () => void },
): RecordActionVerb[] {
  const ticket = repairTicketValue(repair);
  return [
    {
      id: 'status',
      label: 'Status',
      hotkey: 's',
      display: (done) => <StatusDisplay repair={repair} c={c} done={done} />,
    },
    {
      id: 'label',
      label: repair.label_printed_at ? 'Reprint label' : 'Print label',
      hotkey: 'l',
      run: () => {
        printRepairLabel(
          buildRepairLabelPayload({
            repairId: repair.id,
            customerName: repair.contact_info,
            ticketNumber: repair.ticket_number,
            intakeAt: repair.created_at,
          }),
        );
        // Record the first print so the repair leaves the Needs-label queue.
        void c.markLabelPrinted();
      },
    },
    { id: 'document', label: 'Repair doc', hotkey: 'd', run: c.printRepairDocument },
    {
      id: 'pay',
      label: c.isPaying ? 'Creating link…' : 'Square checkout',
      hotkey: 'p',
      disabled: !c.canCreateSquarePayment || c.isPaying,
      disabledReason: c.isPaying ? 'Creating the payment link' : 'Add a source SKU or a valid price first',
      run: () => c.openSquarePayment(),
    },
    {
      id: 'pickup',
      label: 'Start pickup',
      hotkey: 'u',
      disabled: !c.canStartPickup,
      disabledReason: 'Available when the repair is ready for pickup',
      run: () => c.setShowPickupFlow(true),
    },
    {
      id: 'ticket',
      label: 'Edit ticket #',
      placement: 'overflow',
      display: (done) => <TicketDisplay repair={repair} c={c} done={done} />,
    },
    {
      id: 'links',
      label: 'Link / unlink',
      placement: 'overflow',
      display: (done) => <LinkDisplay repair={repair} c={c} done={done} />,
    },
    {
      id: 'copy-ticket',
      label: 'Copy ticket #',
      placement: 'overflow',
      disabled: !ticket,
      disabledReason: 'No ticket number to copy',
      run: async () => {
        try {
          await navigator.clipboard.writeText(ticket);
          toast.success(`Copied ${ticket}`);
        } catch {
          toast.error('Failed to copy');
        }
      },
    },
    {
      id: 'cancel',
      label: 'Cancel repair',
      tone: 'danger',
      placement: 'isolated',
      disabled: repair.status === 'Cancelled',
      disabledReason: 'Already cancelled',
      run: async () => {
        try {
          await c.handleDelete();
          toast.success('Repair cancelled');
          onClose();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Cancel failed');
        }
      },
    },
  ];
}

/** The pickup signature flow, portalled over the desk while the controller asks for it. */
function PickupFlowPortal({ repair, c, onUpdate }: { repair: RSRecord; c: RepairDetailsController; onUpdate: () => void }) {
  if (!c.isMounted || !c.showPickupFlow) return null;
  return createPortal(
    <RepairPickupFlow repair={repair} onUpdate={onUpdate} onClose={() => c.setShowPickupFlow(false)} />,
    document.body,
  );
}

/** The strip armed for the open repair (both views); hosted under the list's search row. */
export function RepairRecordStrip({
  repair,
  onClose,
  onUpdate,
}: {
  repair: RSRecord;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const c = useRepairDetailsPanel({ repair, onUpdate });
  return (
    <>
      <RecordActionStrip
        verbs={buildRepairVerbs(repair, c, { onClose })}
        label={`Repair ${repairTicketValue(repair) || `RS-${repair.id}`} actions`}
        testId="repair-actions"
      />
      <PickupFlowPortal repair={repair} c={c} onUpdate={onUpdate} />
    </>
  );
}
