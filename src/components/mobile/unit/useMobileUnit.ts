'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * One serial unit as the phone reads it — `GET /api/serial-units/[ref]`. The
 * ref is whatever the label carried (numeric id, serial, or minted unit_uid);
 * the route resolves it, and `id` is the numeric `serial_units.id` every
 * unit-scoped write (checklist, allocate, move) keys on.
 */
export interface MobileUnit {
  id: number;
  serial_number: string;
  sku: string | null;
  sku_catalog_id: number | null;
  unit_uid: string | null;
  /** The SKU identity title (Zoho item governs) — never a similarity guess. */
  product_title: string | null;
  current_status: string;
  current_location: string | null;
  condition_grade: string | null;
  /** The receiving line the unit is on NOW (not its frozen origin) — line test and stash write here. */
  current_receiving_line_id: number | null;
}

export interface MobileUnitEvent {
  id: number;
  occurred_at: string;
  event_type: string;
  station: string | null;
  prev_status: string | null;
  next_status: string | null;
  notes: string | null;
  payload: Record<string, unknown> | null;
  /** Actor display name, resolved by readTimeline's staff join. */
  actor_name?: string | null;
}

export interface MobileUnitResponse {
  success: boolean;
  serial_unit: MobileUnit;
  events: MobileUnitEvent[];
}

/** Shared by the unit hub, its sub-screens and the QC runner — one cache entry per ref. */
export function useMobileUnit(ref: string) {
  return useQuery<MobileUnitResponse>({
    queryKey: ['serial-unit.mobile', ref],
    enabled: !!ref,
    queryFn: async () => {
      const res = await fetch(`/api/serial-units/${encodeURIComponent(ref)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      return json as MobileUnitResponse;
    },
    refetchOnWindowFocus: false,
  });
}
