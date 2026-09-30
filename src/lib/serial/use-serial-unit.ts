'use client';

import { useQuery } from '@tanstack/react-query';

/** One serial unit as `GET /api/serial-units/[ref]` returns it — the phone and the desk QC record read the same row. */
export interface SerialUnitRead {
  id: number;
  serial_number: string;
  sku: string | null;
  sku_catalog_id: number | null;
  unit_uid: string | null;
  /** The SKU identity title (Zoho item governs) — never a similarity guess. */
  product_title: string | null;
  /** What the product looks like — catalog photo, listing cover, then the Zoho item image. */
  product_image_url: string | null;
  current_status: string;
  current_location: string | null;
  condition_grade: string | null;
  received_at: string | null;
  received_by_name: string | null;
  /** The receiving line the unit is on NOW (not its frozen origin) — line test and stash write here. */
  current_receiving_line_id: number | null;
  /** That line's carton — what a failed-QC ticket is filed against. */
  current_receiving_id: number | null;
  /** That line's helpdesk ticket (a filed vendor claim). */
  current_line_ticket: string | null;
  /** That line's QC tester (`receiving_line_testing.assigned_tech_id`). */
  current_line_tech_id: number | null;
}

export interface SerialUnitEvent {
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

export interface SerialUnitResponse {
  success: boolean;
  serial_unit: SerialUnitRead;
  /** Newest first. */
  events: SerialUnitEvent[];
}

export const serialUnitQueryKey = (ref: string) => ['serial-unit', ref] as const;

/** Shared by the unit hub, its sub-screens, the QC runner and the desk QC record — one cache entry per ref. */
export function useSerialUnit(ref: string) {
  return useQuery<SerialUnitResponse>({
    queryKey: serialUnitQueryKey(ref),
    enabled: !!ref,
    queryFn: async () => {
      const res = await fetch(`/api/serial-units/${encodeURIComponent(ref)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      return json as SerialUnitResponse;
    },
    refetchOnWindowFocus: false,
  });
}
