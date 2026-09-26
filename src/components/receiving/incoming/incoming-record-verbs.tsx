'use client';

/**
 * The incoming delivery record's verbs — the ONE action strip under the
 * ledger's search row, armed for the open row (owner 2026-09-25: no verbs in
 */

import { Copy, Link2, Package, RefreshCw, Ticket, Trash2 } from '@/components/Icons';
import { requestConfirm } from '@/design-system/components/confirm';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { buildRecordTaskVerbs } from '@/components/tasks/RecordTaskActions';
import { ReceivingClaimPanel } from '@/components/receiving/workspace/ReceivingClaimPanel';
import { PairingTab } from '@/components/sidebar/receiving/incoming-details/PairingTab';
import { copyValue } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { formatReceivingCopyRow } from '@/lib/receiving/receiving-copy-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import type { IncomingDelivery } from './IncomingDeliveryEvidence';
import { cartonIdOf } from './incoming-record-sections';

const NO_CARTON = 'Tasks attach to the carton — available after the door scan';

export function buildIncomingDeliveryVerbs({
  row,
  delivery,
  navigate,
  onRemoved,
}: {
  row: ReceivingLineRow;
  delivery: IncomingDelivery;
  /** Client navigation (`router.push`). */
  navigate: (href: string) => void;
  /** The record is gone from Incoming — close it. */
  onRemoved: () => void;
}): RecordActionVerb[] {
  const c = delivery.controller;
  const data = c.data?.success ? c.data : undefined;
  const target = delivery.resolved?.ok ? delivery.resolved.target : null;
  const cartonId = cartonIdOf(row, data);
  const po = data?.po?.zoho_purchaseorder_number || row.zoho_purchaseorder_number || null;
  const taskTarget = cartonId
    ? { entityType: 'receiving' as const, entityId: cartonId, label: po ? `PO ${po}` : `Carton ${cartonId}` }
    : null;
  const unpaired = data != null && !data.po?.zoho_purchaseorder_id && !data.inbound;
  const ticket = (row.zendesk_ticket || '').trim() || null;

  const verbs: RecordActionVerb[] = [
    {
      id: 'sync',
      label: c.syncing ? 'Syncing…' : 'Sync',
      icon: <RefreshCw aria-hidden />,
      disabled: !target || c.isShipmentOnly || c.isCartonOnly || c.syncing,
      disabledReason: c.syncing ? 'Sync in progress' : 'No purchase order to re-pull',
      run: () => c.syncOne(),
    },
  ];
  if (unpaired && data) {
    verbs.push({
      id: 'pair',
      label: 'Pair to PO',
      icon: <Link2 aria-hidden />,
      display: (done) => (
        <PairingTab
          data={data}
          seedRow={row}
          focusReceivingId={target?.receivingId ?? null}
          focusReceivingLineId={target?.receivingLineId ?? null}
          onPaired={() => {
            c.invalidateIncoming();
            done();
          }}
        />
      ),
    });
  }
  verbs.push(
    {
      id: 'claim',
      label: ticket ? 'Update claim' : 'File claim',
      icon: <Ticket aria-hidden />,
      display: (done) => (
        <ReceivingClaimPanel
          open
          row={row}
          chrome="display"
          onClose={done}
          onTicketCreated={() => {
            c.invalidateIncoming();
            done();
          }}
        />
      ),
    },
    {
      id: 'unbox',
      label: 'Open in Unbox',
      icon: <Package aria-hidden />,
      disabled: cartonId == null,
      disabledReason: 'No carton yet — it opens in Unbox after the door scan',
      run: () => {
        if (cartonId != null) navigate(openInUnboxHref(cartonId, row.id > 0 ? row.id : undefined));
      },
    },
    {
      id: 'copy',
      label: 'Copy details',
      icon: <Copy aria-hidden />,
      placement: 'overflow',
      run: () => copyValue(formatReceivingCopyRow(row), 'Details'),
    },
    {
      id: 'remove',
      label: 'Remove from Incoming',
      icon: <Trash2 aria-hidden />,
      tone: 'danger',
      placement: 'isolated',
      disabled: data == null,
      disabledReason: 'Details still loading',
      run: async () => {
        const confirmed = await requestConfirm({
          title: 'Remove from Incoming',
          description: data?.po
            ? 'Removes every incoming line for this purchase order. The upstream purchase order is unchanged.'
            : 'Removes this incoming record.',
          confirmLabel: 'Remove',
          tone: 'danger',
        });
        if (!confirmed) return;
        await c.handleDelete();
        onRemoved();
      },
    },
  );
  if (taskTarget) verbs.push(...buildRecordTaskVerbs(taskTarget));
  else {
    verbs.push(
      { id: 'task-mine', label: 'Add task', placement: 'overflow', disabled: true, disabledReason: NO_CARTON },
      { id: 'task-staff', label: 'Send to staff as task', placement: 'overflow', disabled: true, disabledReason: NO_CARTON },
    );
  }
  return verbs;
}
