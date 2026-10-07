/** Browser calls for Remove from list / put back (`src/app/api/orders/list-removal`). Client-safe. */

import { LIST_REMOVAL_API, type ListRemovalReason } from '@/lib/orders/list-removal';

async function send(method: 'POST' | 'DELETE', body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(LIST_REMOVAL_API, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Request failed (${res.status})`));
  return json;
}

export async function removeFromList(orderIds: readonly number[], reason: ListRemovalReason, note: string | null): Promise<number[]> {
  const json = await send('POST', { orderIds, reason, note });
  return (json.removedIds as number[]) ?? [];
}

export async function restoreToList(orderIds: readonly number[]): Promise<number[]> {
  const json = await send('DELETE', { orderIds });
  return (json.restoredIds as number[]) ?? [];
}
