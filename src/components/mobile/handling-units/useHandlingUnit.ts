'use client';

import { useQuery } from '@tanstack/react-query';

export interface HandlingUnitMemberRead {
  id: number;
  serial_number: string;
  unit_uid: string | null;
  sku: string | null;
  current_status: string;
  current_location: string | null;
  condition_grade: string | null;
  origin_receiving_line_id: number | null;
}

export interface HandlingUnitRead {
  id: number;
  code: string;
  status: 'OPEN' | 'STAGED' | 'IN_TEST' | 'CLOSED';
  location_id: number | null;
  location_name: string | null;
  created_at: string;
  created_by_name: string | null;
  paired_order_id: number | null;
  paired_order_number: string | null;
  notes: string | null;
  units: HandlingUnitMemberRead[];
  rollup: { total: number; tested: number; untested: number };
}

interface HandlingUnitResponse {
  success: boolean;
  handling_unit: HandlingUnitRead;
}

export const handlingUnitQueryKey = (ref: string) => ['handling-unit.mobile-v2', ref] as const;

export function useHandlingUnit(ref: string) {
  return useQuery<HandlingUnitResponse>({
    queryKey: handlingUnitQueryKey(ref),
    enabled: ref.trim().length > 0,
    queryFn: async () => {
      const response = await fetch(`/api/handling-units/${encodeURIComponent(ref)}`, { cache: 'no-store', credentials: 'include' });
      const body = (await response.json().catch(() => null)) as (HandlingUnitResponse & { error?: string }) | null;
      if (!response.ok || !body?.success || !body.handling_unit) {
        throw new Error(body?.error || `Could not load LPN (${response.status})`);
      }
      return body;
    },
    refetchOnWindowFocus: false,
  });
}
