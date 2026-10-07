/**
 * Client fetch for the receiving-line putaway write —
 * `POST /api/receiving/lines/:id/stage`. One caller shape for the Unbox desk
 * pill and the phone LPN location screen; failures throw the server's words.
 */

export interface LineStageResponse {
  success?: boolean;
  error?: string;
  line?: {
    staged_at?: string | null;
    staged_location_id?: number | null;
  };
  location?: {
    id?: number;
    name?: string | null;
    barcode?: string | null;
    room?: string | null;
  } | null;
}

export async function postLineStage(
  lineId: number,
  body: { location_id?: number; barcode?: string },
): Promise<LineStageResponse> {
  const res = await fetch(`/api/receiving/lines/${lineId}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as LineStageResponse | null;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Could not update location');
  }
  return data;
}
