'use client';

import { useQuery } from '@tanstack/react-query';
import type { UnitQcStep } from '@/lib/qc/unit-qc';

/** A checklist request the server refused; `status` lets 403 read as "no permission". */
class UnitChecklistError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const unitChecklistKey = (unitId: number | null) => ['serial-unit.checklist', unitId] as const;

export async function fetchUnitChecklist(unitId: number): Promise<UnitQcStep[]> {
  const res = await fetch(`/api/serial-units/${unitId}/checklist`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new UnitChecklistError(json?.error || `HTTP ${res.status}`, res.status);
  }
  return json.steps as UnitQcStep[];
}

/**
 * The unit's checklist steps with this unit's server-recorded results — the
 * phone runner, the unit hub door and the desk QC record's fail ticket read it.
 * `unitId` is the numeric `serial_units.id` (the route does `Number(segment)`);
 * null holds the query until the unit resolves.
 */
export function useUnitChecklist(unitId: number | null) {
  return useQuery<UnitQcStep[], UnitChecklistError>({
    queryKey: unitChecklistKey(unitId),
    enabled: unitId != null,
    queryFn: () => fetchUnitChecklist(unitId as number),
    // A 4xx (no permission, unit gone) will not change on retry.
    retry: (count, err) => err.status >= 500 && count < 2,
    refetchOnWindowFocus: false,
  });
}

export function unitChecklistErrorText(err: UnitChecklistError): string {
  return err.status === 403 ? 'No QC permission' : `Checklist unavailable — ${err.message}`;
}
