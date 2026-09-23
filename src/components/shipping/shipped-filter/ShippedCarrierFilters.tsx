import { useMemo, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { ChevronDown, Filter, X } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  FILTER_DROPDOWN_LABEL_CLASS,
  FILTER_DROPDOWN_SELECT_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import type { CarrierCode, ShipmentStatusCategory } from '@/components/shipping/ShipmentStatusBadge';
import { CARRIERS, CARRIER_LABEL, STATUS_CATEGORIES, STATUS_LABEL, TYPE_ITEMS, TYPE_LABEL, type ShippedTypeFilter } from './shipped-filter-constants';
import { toISODate } from './shipped-filter-params';
import { useShippedFilterActions } from './useShippedFilterActions';
import { useStaffOptions } from './useStaffOptions';
import { CarrierSelect, NeedsAttentionButton, StatusSelect, TypeSelect } from './ShippedFilterControls';
import { Button, Panel } from '@/design-system/primitives';




const selectClass = FILTER_DROPDOWN_SELECT_CLASS;
const labelClass = FILTER_DROPDOWN_LABEL_CLASS;

export function ShippedCarrierFilters({
  className,
  basePath,
  layout = 'sidebar',
}: {
  className?: string;
  basePath?: string;
  layout?: 'sidebar' | 'inline';
}) {
  const [open, setOpen] = useState(false);
  // Anchor for the portaled filter popover (AnchoredLayer pins to this wrapper).
  const popoverRef = useRef<HTMLDivElement>(null);

  const a = useShippedFilterActions(basePath);
  const { techs, packers } = useStaffOptions();
  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs]);
  const packerName = useMemo(() => new Map(packers.map((p) => [p.id, p.name])), [packers]);

  const { exceptionsOnly, carrier, statusCategory, typeFilter, testedBy, packedBy, dateFrom, dateTo, dateRange, clearAll } = a;

  // Active refinements — Type now lives in the popover, so it counts too.
  const activeCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (exceptionsOnly ? 1 : 0) + (carrier ? 1 : 0) + (statusCategory ? 1 : 0) +
    (testedBy ? 1 : 0) + (packedBy ? 1 : 0) + (dateFrom ? 1 : 0);

  const chips = useMemo(() => {
    const out: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (typeFilter !== 'all') out.push({ key: 'type', label: TYPE_LABEL.get(typeFilter) ?? typeFilter, onRemove: () => a.setTypeFilter('all') });
    if (exceptionsOnly) out.push({ key: 'ex', label: 'Needs attention', onRemove: a.toggleExceptions });
    if (carrier) out.push({ key: 'carrier', label: CARRIER_LABEL.get(carrier) ?? carrier, onRemove: () => a.setCarrier(null) });
    if (statusCategory) out.push({ key: 'status', label: STATUS_LABEL.get(statusCategory) ?? statusCategory, onRemove: () => a.setStatus(null) });
    if (testedBy) out.push({ key: 'tester', label: `Tech: ${techName.get(testedBy) ?? `#${testedBy}`}`, onRemove: () => a.setTestedBy(null) });
    if (packedBy) out.push({ key: 'packer', label: `Packer: ${packerName.get(packedBy) ?? `#${packedBy}`}`, onRemove: () => a.setPackedBy(null) });
    if (dateFrom) {
      const label = dateTo && toISODate(dateTo) !== toISODate(dateFrom)
        ? `${toISODate(dateFrom)} → ${toISODate(dateTo)}`
        : `${toISODate(dateFrom)}`;
      out.push({ key: 'date', label, onRemove: () => a.setDateRange(undefined) });
    }
    return out;
  }, [typeFilter, exceptionsOnly, carrier, statusCategory, testedBy, packedBy, dateFrom, dateTo, techName, packerName, a]);

  /**
   * Inline layout — the RAIL-LESS well.
   *
   * It was written for the retired shipped toolbar and marked legacy when every
   * shipped filter moved into the left rail. The Shipped desk brought it back
   * on purpose: a Pattern-E desk has no left column for the sidebar form to
   * live in, so its refinements ride a compact row above the rows they scope.
   */
  if (layout === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
        <NeedsAttentionButton active={exceptionsOnly} onClick={a.toggleExceptions} compact />
        <TypeSelect value={typeFilter} onChange={a.setTypeFilter} />
        <CarrierSelect value={carrier} onChange={a.setCarrier} />
        <StatusSelect value={statusCategory} onChange={a.setStatus} />
        {activeCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" radius="flush" onClick={clearAll} className="h-auto px-0">
            Clear
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {/* Single filter entry point — Type (All/Orders/SKU/FBA) lives inside the
          popover alongside every other refinement (Shopify / Linear pattern). */}
      <div className="relative" ref={popoverRef}>
        <Button
          variant={activeCount > 0 ? 'primarySoft' : 'secondary'}
          size="md"
          radius="flush"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          icon={<Filter />}
          iconRight={<ChevronDown className={open ? 'rotate-180' : undefined} />}
          className="w-full justify-start"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            Filters
            {activeCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-none bg-fill-info px-1.5 text-role-micro text-text-inverse">{activeCount}</span>
            ) : null}
          </span>
        </Button>

        <AnchoredLayer
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={popoverRef}
          placement="bottom-stretch"
          gap={4}
          ignoreClickSelector="[data-radix-popper-content-wrapper]"
        >
          <Panel radius="xl" padding="sm" elevation="md" className="space-y-3 ring-1 ring-black/5" role="dialog" aria-label="Shipment filters">
            <NeedsAttentionButton active={exceptionsOnly} onClick={a.toggleExceptions} />

            <label className="block">
              <span className={labelClass}>Type</span>
              <div className="relative">
                <select value={typeFilter} onChange={(e) => a.setTypeFilter(e.target.value as ShippedTypeFilter)} className={selectClass} aria-label="Shipped type filter">
                  {TYPE_ITEMS.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </label>

            <div>
              <span className={labelClass}>Packed date</span>
              <DateRangePickerField value={dateRange as DateRange | undefined} onChange={a.setDateRange} placeholder="Any date" />
            </div>

            <label className="block">
              <span className={labelClass}>Carrier</span>
              <div className="relative">
                <select value={carrier ?? ''} onChange={(e) => a.setCarrier((e.target.value || null) as CarrierCode | null)} className={selectClass} aria-label="Filter by carrier">
                  <option value="">All carriers</option>
                  {CARRIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </label>

            <label className="block">
              <span className={labelClass}>Carrier status</span>
              <div className="relative">
                <select value={statusCategory ?? ''} onChange={(e) => a.setStatus((e.target.value || null) as ShipmentStatusCategory | null)} className={selectClass} aria-label="Filter by shipment status">
                  <option value="">All statuses</option>
                  {STATUS_CATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </label>

            <label className="block">
              <span className={labelClass}>Tested by</span>
              <div className="relative">
                <select value={testedBy ?? ''} onChange={(e) => a.setTestedBy(e.target.value ? Number(e.target.value) : null)} className={selectClass} aria-label="Filter by tester">
                  <option value="">Any tech</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </label>

            <label className="block">
              <span className={labelClass}>Packed by</span>
              <div className="relative">
                <select value={packedBy ?? ''} onChange={(e) => a.setPackedBy(e.target.value ? Number(e.target.value) : null)} className={selectClass} aria-label="Filter by packer">
                  <option value="">Any packer</option>
                  {packers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              </div>
            </label>

            {activeCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" radius="flush" onClick={clearAll} className="w-full">
                Clear filters
              </Button>
            ) : null}
          </Panel>
        </AnchoredLayer>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              variant="primarySoft"
              size="sm"
              radius="flush"
              onClick={chip.onRemove}
              iconRight={<X />}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
