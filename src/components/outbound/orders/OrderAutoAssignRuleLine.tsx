'use client';

/** The order record's auto-assign rule as ONE read-only line — owner 2026-09-25, decision 8: */

import { useState } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Pencil } from '@/components/Icons';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RECORD_LABEL_CLASS, RECORD_TRAILING_CELL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { OrderAutoAssignRule, useOrderListingRule } from './OrderAutoAssignRule';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';

export function OrderAutoAssignRuleLine({
  record,
  records,
  getStaffName,
}: {
  record: ShippedOrder;
  /** The painted queue — the editor assigns every order sharing the pair on save. */
  records: readonly ShippedOrder[];
  getStaffName: (id: number) => string;
}) {
  const { itemNumber, sku, ruleQuery } = useOrderListingRule(record);
  const [editing, setEditing] = useState(false);
  if (!itemNumber) return null;

  const rule = ruleQuery.data ?? null;
  const stage = (verb: string, primary: number | null, backup: number | null) => {
    if (!primary || primary <= 0) return null;
    return backup && backup > 0
      ? `${verb} ${getStaffName(primary)} → ${getStaffName(backup)}`
      : `${verb} ${getStaffName(primary)}`;
  };
  const face = ruleQuery.isPending
    ? '…'
    : ruleQuery.isError
      ? 'Unreadable'
      : rule
        ? [stage('Pick', rule.techId, rule.backupTechId), stage('Pack', rule.packerId, rule.backupPackerId)]
            .filter(Boolean)
            .join(' · ') || 'No staff set'
        : 'No rule';
  const scope = `Item ${itemNumber}${sku ? ` · SKU ${sku}` : ''}`;

  return (
    <>
      <EvidenceFactRow label="Rule">
        <span className="flex min-w-0 items-center" data-testid="order-rule-line">
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              ruleQuery.isError ? 'text-mode-warn' : rule ? 'text-mode-ink' : cn(RECORD_LABEL_CLASS, 'text-mode-muted'),
            )}
            title={ruleQuery.isError ? ruleQuery.error.message : `${scope} — primary → backup`}
          >
            {face}
          </span>
          <button
            type="button"
            data-testid="order-rule-edit"
            aria-haspopup="dialog"
            aria-label="Edit auto-assign rule"
            title="Edit auto-assign rule"
            onClick={() => setEditing(true)}
            className={cn(
              'ds-raw-button border-l border-mode-edge text-mode-ink hover:bg-mode-hover',
              RECORD_TRAILING_CELL_CLASS,
              LEDGER_HIT_CLASS,
              focusRing('cell'),
            )}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </EvidenceFactRow>
      <DeskStageOverlay
        open={editing}
        onClose={() => setEditing(false)}
        title="Auto-assign rule"
        subtitle={scope}
        fill="inset"
        testId="order-rule-editor"
      >
        {/* Keyed by record so an unsaved draft never follows J / K. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <OrderAutoAssignRule key={record.id} record={record} records={records} getStaffName={getStaffName} />
        </div>
      </DeskStageOverlay>
    </>
  );
}
