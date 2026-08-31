'use client';

import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  onSave,
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
  onSave: () => void;
}) {
  return (
    <>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-item`}>Item number</Label>
          <Input
            id={`${fieldId}-item`}
            value={itemNumber}
            onChange={(e) => onItemNumber(e.target.value)}
            className="font-mono"
            data-testid="exception-item-number"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-sku`}>SKU</Label>
          <Input
            id={`${fieldId}-sku`}
            value={sku}
            onChange={(e) => onSku(e.target.value)}
            className="font-mono"
            data-testid="exception-sku"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${fieldId}-title`}>Title</Label>
          <Input
            id={`${fieldId}-title`}
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            data-testid="exception-title"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-qty`}>Quantity</Label>
          <Input
            id={`${fieldId}-qty`}
            value={quantity}
            onChange={(e) => onQuantity(e.target.value)}
            className="w-28"
            data-testid="exception-qty"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-tracking`}>Tracking number</Label>
          <Input
            id={`${fieldId}-tracking`}
            value={tracking}
            onChange={(e) => onTracking(e.target.value)}
            className="font-mono"
            data-testid="exception-tracking"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
            Condition
          </p>
          <ConditionPills value={condition} onChange={onCondition} />
        </div>
      </div>
      <div className="mt-3">
        <Button
          variant="default"
          size="md"
          disabled={!dirty || saving}
          onClick={() => onSave()}
          data-testid="exception-save"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>
    </>
  );
}
