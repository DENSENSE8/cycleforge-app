'use client';

/**
 * OrderItemFacts — compact Item card for the order record.
 *
 * Title · condition · SKU · item # · quantity. No multi-platform SKU matrix
 * (that lives behind catalog tooling); no packing-checklist title echo.
 */

import { useEffect, useState } from 'react';
import { CopyChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { Lock } from '@/components/Icons';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import type { EditableShippingFields } from '@/components/shipped/details-panel/shipping-information/types';
import { isOrderShipped } from '@/components/shipped/details-panel/shipped-details-logic';
import { normalizeCondition, type ConditionGrade } from '@/components/tech/StationConditionEditor';
import { useOrderAssignment } from '@/hooks';
import { conditionGradeTone } from '@/lib/condition-tone';
import { conditionLabel } from '@/lib/conditions';
import type { ShippedOrder } from '@/types/orders';

function ConditionChip({
  value,
  locked,
  saving,
  expanded,
  onToggle,
}: {
  value: ConditionGrade;
  locked: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = conditionGradeTone(value);
  const label = conditionLabel(value, 'pill');
  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-wider ring-1 ring-inset ${tone.badge}`}
    >
      {label}
      {locked ? <Lock className="h-3 w-3 opacity-70" aria-hidden /> : null}
      {saving ? <span className="text-text-info">…</span> : null}
    </span>
  );

  if (locked) {
    return (
      <HoverTooltip label="Condition locked after shipping" asChild focusable={false}>
        <span className="inline-flex">{chip}</span>
      </HoverTooltip>
    );
  }

  return (
    <HoverTooltip label={expanded ? 'Hide condition picker' : 'Change condition'} asChild>
      {/* ds-raw-button: compact condition chip — not a DS Button CTA */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Condition ${label}${expanded ? ' — collapse' : ' — change'}`}
        className="ds-raw-button inline-flex rounded-md transition-opacity hover:opacity-90"
      >
        {chip}
      </button>
    </HoverTooltip>
  );
}

export function OrderItemFacts({
  order,
  editableShippingFields,
}: {
  order: ShippedOrder;
  editableShippingFields?: EditableShippingFields;
}) {
  const [conditionValue, setConditionValue] = useState<ConditionGrade>(
    normalizeCondition(order.condition),
  );
  const [isSavingCondition, setIsSavingCondition] = useState(false);
  const [conditionExpanded, setConditionExpanded] = useState(false);
  const orderAssignmentMutation = useOrderAssignment();
  const conditionLocked = isOrderShipped(order);

  useEffect(() => {
    setConditionValue(normalizeCondition(order.condition));
    setConditionExpanded(false);
  }, [order.id, order.condition]);

  const handleConditionChange = async (nextCondition: string) => {
    if (conditionLocked || isSavingCondition) return;
    const grade = normalizeCondition(nextCondition);
    setConditionValue(grade);
    setConditionExpanded(false);
    setIsSavingCondition(true);
    try {
      await orderAssignmentMutation.mutateAsync({
        orderId: order.id,
        condition: grade,
      });
    } catch (error) {
      console.error('Failed to update condition:', error);
    } finally {
      setIsSavingCondition(false);
    }
  };

  const title = String(order.product_title || '').trim() || 'Order';
  const sku = String(order.sku || '').trim();
  const itemNumber = String(
    editableShippingFields?.itemNumber ?? order.item_number ?? '',
  ).trim();
  const qty = String(order.quantity ?? '').trim();
  const serials = String(order.serial_number || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="stack-tight">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-role-body font-semibold text-text-default">{title}</p>
        {conditionLocked ? (
          <ConditionPills value={conditionValue} onChange={() => {}} readOnly />
        ) : (
          <ConditionChip
            value={conditionValue}
            locked={false}
            saving={isSavingCondition}
            expanded={conditionExpanded}
            onToggle={() => setConditionExpanded((v) => !v)}
          />
        )}
      </div>

      {!conditionLocked && conditionExpanded ? (
        <ConditionPills value={conditionValue} onChange={(g) => void handleConditionChange(g)} />
      ) : null}

      <OrderFactList>
        {sku ? (
          <OrderFactRow
            label="SKU"
            mono
            value={<CopyChip value={sku} display={sku} width="w-fit max-w-full" truncateDisplay={false} />}
          />
        ) : null}
        <OrderFactRow label="Item #" value={itemNumber} mono omitWhenEmpty />
        <OrderFactRow label="Qty" value={qty} omitWhenEmpty />
        {serials.length > 0 ? (
          <OrderFactRow
            label={serials.length === 1 ? 'Serial' : 'Serials'}
            span
            mono
            value={
              <span className="flex flex-wrap gap-1.5">
                {serials.map((sn) => (
                  <CopyChip key={sn} value={sn} display={sn} width="w-fit max-w-full" truncateDisplay={false} />
                ))}
              </span>
            }
          />
        ) : null}
      </OrderFactList>
    </div>
  );
}
