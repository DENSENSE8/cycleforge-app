'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerialUnitRead } from '@/lib/serial/use-serial-unit';
import type { QcResultInput } from '@/lib/schemas/qc-checks';
import { unitQcMeta, type UnitQcStep } from '@/lib/qc/unit-qc';
import { fetchUnitChecklist, unitChecklistErrorText, unitChecklistKey, useUnitChecklist } from '@/lib/qc/use-unit-checklist';

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
        queryKey: unitChecklistKey(unitId),
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
export function useUnitQcRow(unit: SerialUnitRead | null): { meta: string; href: string | null } {
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
