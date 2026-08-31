'use client';

/**
 * Order details — the editable record, reordered around what identifies it.
 *
 * Operator 2026-08-31. The old grid opened on Item number and SKU: two mono
 * strings that, on a single-identifier channel, hold the SAME value. So the
 * first thing the surface said about an order was a number, twice, and the
 * title — the only field a human reads to know WHICH order this is — sat third.
 *
 * Now: **title**, then **condition**, then the three short keys on one row
 * (quantity · item number · SKU). Identity first, judgement second, the small
 * facts last and side by side where their widths actually justify sharing a
 * row. Tracking keeps its own row: it is long, and pairing it with a 4-char
 * quantity wasted the line.
 */

import { AlertCircle } from '@/components/Icons';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import { ExceptionQtyStepper } from './ExceptionQtyStepper';

export function ExceptionOrderFields({
  fieldId,
  itemNumber,
  sku,
  title,
  quantity,
  tracking,
  condition,
  dirty,
  saving,
  onItemNumber,
  onSku,
  onTitle,
  onQuantity,
  onTracking,
  onCondition,
}: {
  fieldId: string;
  itemNumber: string;
  sku: string;
  title: string;
  quantity: string;
  tracking: string;
  condition: string;
  dirty: boolean;
  saving: boolean;
  onItemNumber: (value: string) => void;
  onSku: (value: string) => void;
  onTitle: (value: string) => void;
  onQuantity: (value: string) => void;
  onTracking: (value: string) => void;
  onCondition: (value: string) => void;
}) {
  // Two different keys — a marketplace listing id vs the internal catalog key —
  // so a single-identifier channel writing one value into both is AGREEMENT,
  // not duplication. Adjacent on one row, the pair reads as confirmation when
  // they match and as a question when they do not; the marker says which,
  // rather than leaving the operator to diff two mono strings by eye. Same
  // treatment (and same words) as the intake surface's `IdentityRow`.
  const keysDiffer =
    itemNumber.trim().length > 0
    && sku.trim().length > 0
    && itemNumber.trim() !== sku.trim();

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-title`}>Product title</Label>
          <Input
            id={`${fieldId}-title`}
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            className={triagePanelControl()}
            data-testid="exception-title"
          />
        </div>

        <div className="space-y-2">
          {/*
            A heading, not a <label>: ConditionPills is a radiogroup, and a
            <label for> pointing at a group is a broken association. Same type
            treatment as Label so the column still reads as one rhythm.
          */}
          <p className="text-role-caption font-medium text-text-muted">Condition</p>
          {/*
            `barDistribute` + `corner="panel"`: the grades share the row edge to
            edge instead of clumping left with dead air after them, and the
            strip's two outer ends take the panel corner. Both are host
            decisions — the scan station keeps the flush scrolling face, which
            is why these are props rather than a second component.
          */}
          <ConditionPills
            value={condition}
            onChange={onCondition}
            layout="barDistribute"
            corner="panel"
          />
        </div>

        {/* The three short keys, one row. Quantity is a fixed stepper width;
            the two identity fields share what is left. */}
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <div className="shrink-0 space-y-2">
            <Label htmlFor={`${fieldId}-qty`}>Quantity</Label>
            <ExceptionQtyStepper
              id={`${fieldId}-qty`}
              value={quantity}
              onChange={onQuantity}
              data-testid="exception-qty"
            />
          </div>
          <div className="min-w-40 flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`${fieldId}-item`}>Item number</Label>
              {keysDiffer ? (
                <Badge variant="warning">
                  <AlertCircle aria-hidden />
                  differs
                </Badge>
              ) : null}
            </div>
            <Input
              id={`${fieldId}-item`}
              value={itemNumber}
              onChange={(e) => onItemNumber(e.target.value)}
              className={triagePanelControl('font-mono')}
              data-testid="exception-item-number"
            />
          </div>
          <div className="min-w-40 flex-1 space-y-2">
            <Label htmlFor={`${fieldId}-sku`}>SKU</Label>
            <Input
              id={`${fieldId}-sku`}
              value={sku}
              onChange={(e) => onSku(e.target.value)}
              className={triagePanelControl('font-mono')}
              data-testid="exception-sku"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-tracking`}>Tracking number</Label>
          <Input
            id={`${fieldId}-tracking`}
            value={tracking}
            onChange={(e) => onTracking(e.target.value)}
            className={triagePanelControl('font-mono')}
            data-testid="exception-tracking"
          />
        </div>
      </div>
      {/*
        No Save button — the editor autosaves (operator 2026-08-31). What lives
        here is LIVE STATE, not the confirmation: `Saving…` while a write is in
        flight, `Unsaved changes` while one is pending, `Up to date` otherwise.

        The confirmation itself is a bottom-right toast, fired from
        `ExceptionEditor`'s save path (operator ruling 2026-08-31). `Saved`
        printed here read as part of the FORM — a caption on the tracking field
        above it rather than an answer about the write — and nothing else in
        this app confirms in that corner.

        `aria-live="polite"` so the answer reaches a screen reader too — it is
        the only confirmation there is once the button is gone.
      */}
      <div className="mt-4 flex justify-end">
        <span
          role="status"
          aria-live="polite"
          className="text-role-caption text-text-soft"
          data-testid="exception-save-status"
        >
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Up to date'}
        </span>
      </div>
    </>
  );
}
