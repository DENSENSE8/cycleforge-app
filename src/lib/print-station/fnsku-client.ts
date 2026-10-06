/**
 * Browser half of Print station › FNSKU labels: list reads and mutable label
 * metadata writes.
 */
import { PRINT_STATION_CONDITION_PARAM, type PrintStationFnskuRow, type PrintStationFnskuView } from './fnsku';

export interface PrintStationFnskuList {
  rows: PrintStationFnskuRow[];
}

/** Every list the desk has loaded sits under this prefix — a condition edit patches them all. */
export const PRINT_STATION_FNSKUS_KEY = ['print-station', 'fnskus'] as const;

export const printStationFnskusKey = (query: string, view: PrintStationFnskuView, condition: string) =>
  [...PRINT_STATION_FNSKUS_KEY, view, query, condition] as const;

export async function fetchPrintStationFnskus(
  query: string,
  view: PrintStationFnskuView,
  condition: string,
  signal?: AbortSignal,
): Promise<PrintStationFnskuList> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (view !== 'all') params.set('view', view);
  if (condition) params.set(PRINT_STATION_CONDITION_PARAM, condition);
  const res = await fetch(`/api/print-station/fnskus${params.size ? `?${params}` : ''}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Could not load FNSKUs (${res.status})`);
  return (await res.json()) as PrintStationFnskuList;
}

export interface PrintStationFnskuPatch {
  title?: string | null;
  condition?: string | null;
  /** Bottom-right mark. Null clears it so the label reads the title again. */
  mark?: string | null;
}

/** Persist the catalog fields that change the printed FNSKU label. */
export async function savePrintStationFnsku(fnsku: string, patch: PrintStationFnskuPatch): Promise<void> {
  const body: { product_title?: string | null; condition?: string | null; label_mark?: string | null } = {};
  if ('title' in patch) body.product_title = patch.title?.trim() || null;
  if ('condition' in patch) body.condition = patch.condition?.trim() || null;
  if ('mark' in patch) body.label_mark = patch.mark?.trim().slice(0, 40) || null;
  const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(fnsku)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const response = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      res.status === 403
        ? 'You cannot change FNSKU labels.'
        : (response?.error ?? `Could not save the FNSKU label (${res.status})`),
    );
  }
}
