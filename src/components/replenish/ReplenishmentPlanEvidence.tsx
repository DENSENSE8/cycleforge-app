'use client';

import { useEffect, useState } from 'react';
import { ArrowRightToLine, Check, X } from '@/components/Icons';
import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
} from '@/design-system/components/record-ledger/RecordEvidence';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { Button, TextField } from '@/design-system/primitives';
import { REPLENISHMENT_RECORD_STATE } from '@/design-system/tokens/replenishment';
import {
  REPLENISHMENT_ALLOWED_TRANSITIONS,
  type ReplenishmentRequestStatus,
} from '@/lib/replenishment-request-status';
import { numText, type NeedToOrderRow } from './replenish-types';

export interface ReplenishmentPlanPatch {
  quantity_to_order?: number;
  vendor_zoho_contact_id?: string;
  vendor_name?: string;
  unit_cost?: number;
  notes?: string;
  status?: ReplenishmentRequestStatus;
}

const STATUS_LABEL: Readonly<Record<ReplenishmentRequestStatus, string>> = {
  detected: 'Detected',
  pending_review: 'Review',
  planned_for_po: 'Plan PO',
  po_created: 'PO created',
  waiting_for_receipt: 'Await receipt',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

/** The open plan read as a whole — the ledger's summary with nothing open. */
export function replenishmentPlanSummary(rows: readonly NeedToOrderRow[]): RecordLedgerSummary {
  const blocked = rows.reduce(
    (sum, row) => sum + (Array.isArray(row.orders_waiting) ? row.orders_waiting.length : 0),
    0,
  );
  return {
    title: 'Purchasing plan',
    sub: 'Review detected demand, plan quantities by vendor, then create Zoho draft POs',
    facts: [
      { label: 'Requests', value: rows.length },
      { label: 'Orders blocked', value: blocked, warn: blocked > 0, toolbar: true },
    ],
    note: 'Select a request to review stock, edit purchasing facts, and move it through the plan.',
  };
}

export function ReplenishmentPlanEvidence({
  row,
  saving,
  onSave,
  onTransition,
}: {
  row: NeedToOrderRow;
  saving: boolean;
  onSave: (row: NeedToOrderRow, patch: ReplenishmentPlanPatch) => Promise<void>;
  onTransition: (row: NeedToOrderRow, status: ReplenishmentRequestStatus) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setQuantity(row.quantity_to_order ?? row.quantity_needed ?? '');
    setVendorName(row.vendor_name ?? '');
    setVendorId(row.vendor_zoho_contact_id ?? '');
    setUnitCost(row.unit_cost ?? '');
    setNotes(row.notes ?? '');
  }, [row]);

  const state = REPLENISHMENT_RECORD_STATE[row.status];
  const transitions = REPLENISHMENT_ALLOWED_TRANSITIONS[row.status].filter(
    (status) => status !== 'po_created',
  );
  const waiting = Array.isArray(row.orders_waiting) ? row.orders_waiting : [];
  const save = () => {
    const quantityNumber = Number(quantity);
    const unitCostNumber = Number(unitCost);
    return onSave(row, {
      quantity_to_order: Number.isFinite(quantityNumber) && quantityNumber > 0
        ? quantityNumber
        : undefined,
      vendor_zoho_contact_id: vendorId,
      vendor_name: vendorName,
      unit_cost: Number.isFinite(unitCostNumber) && unitCostNumber >= 0
        ? unitCostNumber
        : undefined,
      notes,
    });
  };

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="replenishment-plan-evidence">
      <EvidenceTitle sub={row.sku || 'No SKU'}>{row.item_name}</EvidenceTitle>
      <EvidenceStateStrip state={state} next={row.status === 'planned_for_po' ? 'Create PO' : undefined} />
      <EvidenceSection label="Demand and stock">
        <EvidenceFacts>
          <EvidenceFact label="Need" mono>{numText(row.quantity_needed)}</EvidenceFact>
          <EvidenceFact label="Available" mono>{numText(row.zoho_quantity_available)}</EvidenceFact>
          <EvidenceFact label="On hand" mono>{numText(row.zoho_quantity_on_hand)}</EvidenceFact>
          <EvidenceFact label="Incoming" mono>{numText(row.zoho_incoming_quantity)}</EvidenceFact>
          <EvidenceFact label="Blocked orders" mono>{waiting.length}</EvidenceFact>
          <EvidenceFact label="Zoho PO" mono>{row.zoho_po_number || '—'}</EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceSection label="Purchasing facts">
        <div className="divide-y divide-border-hairline border-y border-border-hairline">
          <TextField label="Quantity to order" type="number" min={1} value={quantity} onChange={setQuantity} appearance="flush" />
          <TextField label="Vendor" value={vendorName} onChange={setVendorName} appearance="flush" />
          <TextField label="Zoho vendor id" value={vendorId} onChange={setVendorId} appearance="flush" mono />
          <TextField label="Unit cost" type="number" min={0} step="0.01" value={unitCost} onChange={setUnitCost} appearance="flush" />
          <TextField label="Notes" value={notes} onChange={setNotes} appearance="flush" multiline rows={3} />
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Check aria-hidden />}
          loading={saving}
          onClick={() => void save()}
          className="mt-3 w-full"
        >
          Save purchasing plan
        </Button>
      </EvidenceSection>
      {transitions.length > 0 ? (
        <EvidenceSection label="Workflow">
          <div className="flex flex-wrap gap-2">
            {transitions.map((status) => (
              <Button
                key={status}
                type="button"
                variant={status === 'cancelled' ? 'secondary' : 'primary'}
                size="sm"
                icon={status === 'cancelled' ? <X aria-hidden /> : <ArrowRightToLine aria-hidden />}
                disabled={saving}
                onClick={() => void onTransition(row, status)}
              >
                {STATUS_LABEL[status]}
              </Button>
            ))}
          </div>
        </EvidenceSection>
      ) : null}
      {row.status === 'planned_for_po' ? (
        <EvidenceNotice>Select this record in the ledger, then use Create draft PO. Planned lines are grouped by Zoho vendor.</EvidenceNotice>
      ) : null}
    </div>
  );
}
