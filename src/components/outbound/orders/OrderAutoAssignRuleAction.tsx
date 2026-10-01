'use client';

/**
 * The line's auto-assign rule as an ACTION, not a details row (owner
 * 2026-09-26): a pencil on the item card's right edge whose tooltip reads the
 * current rule; pressing it opens the rule editor over the record.
 */

import { useState } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Pencil } from '@/components/Icons';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { RECORD_TRAILING_ACTION_CLASS } from '@/design-system/tokens/record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { OrderAutoAssignRule, useOrderListingRule } from './OrderAutoAssignRule';

export function OrderAutoAssignRuleAction({
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
      ? 'Rule unreadable'
      : rule
        ? [stage('Pick', rule.techId, rule.backupTechId), stage('Pack', rule.packerId, rule.backupPackerId)]
            .filter(Boolean)
            .join(' · ') || 'No staff set'
        : 'No rule';
  const scope = `Item ${itemNumber}${sku ? ` · SKU ${sku}` : ''}`;

  return (
    <>
      <button
        type="button"
        data-testid="order-rule-edit"
        data-rule={rule ? 'set' : 'none'}
        aria-haspopup="dialog"
        aria-label="Change auto-assign rule"
        title={`Change rule — ${face}`}
        onClick={() => setEditing(true)}
        className={cn('ds-raw-button', RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
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
