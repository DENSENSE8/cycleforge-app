'use client';

/**
 * Pairing identity — the facts needed to point this order at a Zoho SKU.
 *
 * Operator 2026-09-01 (R-FLOW-7): this form does not edit tracking, quantity,
 * or condition. Title, item number, and SKU are what the catalog pair reads.
 * Creation and modification remain under Inventory Management / Accounting
 * control, outside this desk.
 *
 * Layout: **title** first (which product), then item number · SKU on one row.
 * On a single-identifier channel those two keys often match; adjacent, the
 * pair reads as confirmation, and the marker says when they differ.
 */

import { AlertCircle } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';

export function ExceptionOrderFields({
  fieldId,
  itemNumber,
  sku,
  title,
  dirty,
  saving,
  onItemNumber,
  onSku,
  onTitle,
}: {
  fieldId: string;
  itemNumber: string;
  sku: string;
  title: string;
  dirty: boolean;
  saving: boolean;
  onItemNumber: (value: string) => void;
  onSku: (value: string) => void;
  onTitle: (value: string) => void;
}) {
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

        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
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
      </div>
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
