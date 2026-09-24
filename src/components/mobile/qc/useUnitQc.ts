'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MobileUnit } from '@/components/mobile/unit/useMobileUnit';
import type { QcResultInput } from '@/lib/schemas/qc-checks';
import { unitQcMeta, type UnitQcStep } from '@/lib/qc/unit-qc';

/** A checklist request the server refused; `status` lets 403 read as "no permission". */
export class UnitChecklistError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const checklistKey = (unitId: number | null) => ['serial-unit.checklist', unitId] as const;

async function fetchUnitChecklist(unitId: number): Promise<UnitQcStep[]> {
  const res = await fetch(`/api/serial-units/${unitId}/checklist`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new UnitChecklistError(json?.error || `HTTP ${res.status}`, res.status);
  }
  return json.steps as UnitQcStep[];
}

/**
 * The unit's checklist steps with this unit's server-recorded results.
 * `unitId` is the numeric `serial_units.id` (the route does `Number(segment)`);
 * null holds the query until the unit resolves.
 */
export function useUnitChecklist(unitId: number | null) {
  return useQuery<UnitQcStep[], UnitChecklistError>({
    queryKey: checklistKey(unitId),
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

/**
 * Record one step through the existing checklist POST, then re-read the
 * checklist so what the screen shows — verdict, who, when — is the server's.
 * Resolves to the step as re-read.
 */
export function useRecordUnitQcStep(unitId: number) {
  const queryClient = useQueryClient();
  return useMutation<UnitQcStep | null, Error, QcResultInput>({
    mutationFn: async (body) => {
      const res = await fetch(`/api/serial-units/${unitId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const steps = await queryClient.fetchQuery({
        queryKey: checklistKey(unitId),
        queryFn: () => fetchUnitChecklist(unitId),
        staleTime: 0,
      });
      return steps.find((s) => s.step_id === body.stepId) ?? null;
    },
  });
}

/**
 * The unit hub's "Quality control" door: meta line plus where it opens. The
 * door is inert (href null) while loading, when there is nothing to run, or
 * when the checklist cannot be read — and the meta says which.
 */
export function useUnitQcRow(unit: MobileUnit | null): { meta: string; href: string | null } {
  // Without a catalog row the route returns no steps; skip the round trip.
  const checklist = useUnitChecklist(unit?.sku_catalog_id != null ? unit.id : null);
  if (!unit) return { meta: 'Loading…', href: null };
  if (unit.sku_catalog_id == null) return { meta: unitQcMeta(unit, []), href: null };
  if (checklist.error) return { meta: unitChecklistErrorText(checklist.error), href: null };
  if (!checklist.data) return { meta: 'Loading checklist…', href: null };
  return {
    meta: unitQcMeta(unit, checklist.data),
    href: checklist.data.length > 0 ? `/m/u/${unit.id}/qc` : null,
  };
}
