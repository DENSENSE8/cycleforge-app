'use client';

import { useMemo } from 'react';
import { CARRIER_LABEL, STATUS_LABEL, TYPE_LABEL } from './shipped-filter-constants';
import { toISODate } from './shipped-filter-params';
import { useShippedFilterActions } from './useShippedFilterActions';
import { useStaffOptions } from './useStaffOptions';

/** Shipped-filter state + setters + the active-refinement chip list (for ShippedSidebar). */
export function useShippedFilterRefinements() {
  const a = useShippedFilterActions();
  const { pickers, packers, allStaff } = useStaffOptions();

  const pickerName = useMemo(() => new Map(pickers.map((t) => [t.id, t.name])), [pickers]);
  const packerName = useMemo(() => new Map(packers.map((p) => [p.id, p.name])), [packers]);

  const { exceptionsOnly, carrier, statusCategory, typeFilter, pickedBy, packedBy, dateFrom, dateTo } = a;

  const refinements = useMemo(() => {
    const out: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (typeFilter !== 'all') out.push({ id: 'type', label: TYPE_LABEL.get(typeFilter) ?? typeFilter, onRemove: () => a.setTypeFilter('all') });
    if (exceptionsOnly) out.push({ id: 'ex', label: 'Needs attention', onRemove: a.toggleExceptions });
    if (carrier) out.push({ id: 'carrier', label: CARRIER_LABEL.get(carrier) ?? carrier, onRemove: () => a.setCarrier(null) });
    if (statusCategory) out.push({ id: 'status', label: STATUS_LABEL.get(statusCategory) ?? statusCategory, onRemove: () => a.setStatus(null) });
    if (pickedBy) out.push({ id: 'picker', label: `Picker: ${pickerName.get(pickedBy) ?? `#${pickedBy}`}`, onRemove: () => a.setPickedBy(null) });
    if (packedBy) out.push({ id: 'packer', label: `Packer: ${packerName.get(packedBy) ?? `#${packedBy}`}`, onRemove: () => a.setPackedBy(null) });
    if (dateFrom) {
      const label = dateTo && toISODate(dateTo) !== toISODate(dateFrom)
        ? `${toISODate(dateFrom)} → ${toISODate(dateTo)}`
        : `${toISODate(dateFrom)}`;
      out.push({ id: 'date', label, onRemove: () => a.setDateRange(undefined) });
    }
    return out;
  }, [typeFilter, exceptionsOnly, carrier, statusCategory, pickedBy, packedBy, dateFrom, dateTo, pickerName, packerName, a]);

  return {
    refinements,
    clearAll: a.clearAll,
    state: { exceptionsOnly, carrier, statusCategory, typeFilter, pickedBy, packedBy, dateFrom, dateTo, pickers, packers, allStaff },
    actions: {
      toggleExceptions: a.toggleExceptions,
      setCarrier: a.setCarrier,
      setStatus: a.setStatus,
      setPickedBy: a.setPickedBy,
      setPackedBy: a.setPackedBy,
      setDateRange: a.setDateRange,
      setTypeFilter: a.setTypeFilter,
    },
  };
}
