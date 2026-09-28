'use client';

import { Switch } from '@/design-system/primitives';

interface ShippedOutOfStockComposerProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  isSaving?: boolean;
}

export function ShippedOutOfStockComposer({
  checked,
  onCheckedChange,
  isSaving = false,
}: ShippedOutOfStockComposerProps) {
  return (
    <section className="mx-8 pt-2 pb-2">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200/80 bg-surface-card px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <span className="text-role-micro font-semibold text-text-danger">
          Out of stock
        </span>
        <Switch
          checked={checked}
          disabled={isSaving}
          onCheckedChange={onCheckedChange}
          aria-label="Mark order out of stock"
          checkedClassName="data-[state=checked]:bg-red-600"
        />
      </div>
    </section>
  );
}
