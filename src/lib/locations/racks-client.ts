/**
 * Client fetchers for `/api/racks/**` — client-safe, typed by the wire
 * contract in `rack-types.ts`. Failures throw {@link RackRequestError}
 * carrying the server's `RackErrorBody.code` so a surface can name the
 * problem (`same_placement`, `shelf_has_stock`, …) instead of a status.
 */

import type {
  AdoptBayBody,
  AdoptBayResponse,
  CreateRackBody,
  CreateRackResponse,
  EditRackShelvesBody,
  EditRackShelvesResponse,
  GetRackResponse,
  ListRacksResponse,
  MoveRackBody,
  MoveRackResponse,
  RackErrorCode,
  RackLabelsPrintedBody,
} from '@/lib/locations/rack-types';
import { isRackErrorCode } from '@/lib/locations/rack-types';

export class RackRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Null when the server answered without a rack error body (401/403/500). */
    readonly code: RackErrorCode | null,
  ) {
    super(message);
    this.name = 'RackRequestError';
  }
}

export function racksQueryKey(filter: { placement?: string | null; room?: number | null } = {}) {
  return ['racks', filter.placement ?? null, filter.room ?? null] as const;
}

export function rackQueryKey(code: string) {
  return ['rack', code] as const;
}

async function rackFetch<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    cache: 'no-store',
    ...(init ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json && typeof json === 'object' ? json : {};
    throw new RackRequestError(
      'error' in err && typeof err.error === 'string' ? err.error : `Rack request failed (${res.status})`,
      res.status,
      'code' in err && isRackErrorCode(err.code) ? err.code : null,
    );
  }
  // The server answered 2xx with the contract shape for this path.
  const body = json as T;
  return body;
}

const rackPath = (code: string) => `/api/racks/${encodeURIComponent(code)}`;

export function listRacks(filter: { placement?: string | null; room?: number | null } = {}): Promise<ListRacksResponse> {
  const qs = new URLSearchParams();
  if (filter.placement) qs.set('placement', filter.placement);
  if (filter.room != null) qs.set('room', String(filter.room));
  const q = qs.toString();
  return rackFetch<ListRacksResponse>(`/api/racks${q ? `?${q}` : ''}`);
}

/** Any rack spelling; a shelf/position code returns its rack. */
export function getRack(code: string): Promise<GetRackResponse> {
  return rackFetch<GetRackResponse>(rackPath(code));
}

export function createRack(body: CreateRackBody): Promise<CreateRackResponse> {
  return rackFetch<CreateRackResponse>('/api/racks', { method: 'POST', body });
}

export function moveRack(code: string, body: MoveRackBody): Promise<MoveRackResponse> {
  return rackFetch<MoveRackResponse>(`${rackPath(code)}/move`, { method: 'POST', body });
}

export function editRackShelves(code: string, body: EditRackShelvesBody): Promise<EditRackShelvesResponse> {
  return rackFetch<EditRackShelvesResponse>(`${rackPath(code)}/shelves`, { method: 'POST', body });
}

/** Record a finished print run for `rackCode` (`location.labels.printed`). */
export async function reportRackLabelsPrinted(rackCode: string, body: RackLabelsPrintedBody): Promise<void> {
  await rackFetch<{ ok: true }>(`${rackPath(rackCode)}/labels-printed`, { method: 'POST', body });
}

export function adoptBay(body: AdoptBayBody): Promise<AdoptBayResponse> {
  return rackFetch<AdoptBayResponse>('/api/racks/adopt', { method: 'POST', body });
}
