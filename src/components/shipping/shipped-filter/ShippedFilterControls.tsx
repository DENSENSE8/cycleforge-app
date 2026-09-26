import { AlertTriangle, Truck } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { CarrierCode, ShipmentStatusCategory } from '@/components/shipping/ShipmentStatusBadge';
import { CARRIERS, STATUS_CATEGORIES, TYPE_ITEMS, type ShippedTypeFilter } from './shipped-filter-constants';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { Button } from '@/design-system/primitives';



export function NeedsAttentionButton({
  active,
  onClick,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <HoverTooltip label="Show only shipments with a carrier exception or no scan in >72h" asChild>
      <Button
        variant={active ? 'danger' : 'dangerSoft'}
        size={compact ? 'sm' : 'md'}
        radius="flush"
        onClick={onClick}
        aria-pressed={active}
        icon={<AlertTriangle />}
        className={compact ? undefined : 'w-full'}
      >
        Needs attention
      </Button>
    </HoverTooltip>
  );
}

export function CarrierSelect({ value, onChange }: { value: CarrierCode | null; onChange: (next: CarrierCode | null) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-none bg-surface-card px-2.5 py-1 text-role-caption font-semibold text-text-muted ring-1 ring-inset ring-border-soft">
      <Truck className="h-3.5 w-3.5 text-text-faint" />
      <span className="sr-only">Carrier</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as CarrierCode | null)}
        className={cn('bg-transparent text-role-caption font-semibold text-text-default', focusRing('field', 'accent'))}
        aria-label="Filter by carrier"
      >
        <option value="">All carriers</option>
        {CARRIERS.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </label>
  );
}

export function StatusSelect({ value, onChange }: { value: ShipmentStatusCategory | null; onChange: (next: ShipmentStatusCategory | null) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-none bg-surface-card px-2.5 py-1 text-role-caption font-semibold text-text-muted ring-1 ring-inset ring-border-soft">
      <span className="sr-only">Status</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as ShipmentStatusCategory | null)}
        className={cn('bg-transparent text-role-caption font-semibold text-text-default', focusRing('field', 'accent'))}
        aria-label="Filter by shipment status"
      >
        <option value="">All statuses</option>
        {STATUS_CATEGORIES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Record TYPE — Orders · SKU · FBA · All. */
export function TypeSelect({ value, onChange }: { value: ShippedTypeFilter; onChange: (next: ShippedTypeFilter) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-none bg-surface-card px-2.5 py-1 text-role-caption font-semibold text-text-muted ring-1 ring-inset ring-border-soft">
      <span className="sr-only">Type</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ShippedTypeFilter)}
        className={cn('bg-transparent text-role-caption font-semibold text-text-default', focusRing('field', 'accent'))}
        aria-label="Filter by record type"
      >
        {TYPE_ITEMS.map((t) => (
          <option key={String(t.id)} value={String(t.id)}>{t.label}</option>
        ))}
      </select>
    </label>
  );
}
