'use client';

import { useQuery } from '@tanstack/react-query';
import type { CustomFieldDef, CustomFieldEntityType } from '@/lib/custom-fields/types';

async function fetchDefs(entityType: CustomFieldEntityType): Promise<CustomFieldDef[]> {
  const res = await fetch(`/api/custom-fields/defs?entityType=${entityType}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { success?: boolean; items?: CustomFieldDef[] };
  return json.items ?? [];
}

/** Live custom_field_defs for one entity family (Orders / Receiving grids). */
export function useCustomFieldDefs(entityType: CustomFieldEntityType) {
  return useQuery({
    queryKey: ['custom-field-defs', entityType],
    queryFn: () => fetchDefs(entityType),
    staleTime: 30_000,
  });
}
