/**
 * Phone-side fetches for arrival pairing — package read, urgency / place
 * actions, and the unbox queue. Every answer is parsed with the contract
 * schemas (`@/lib/receiving/arrival-contract`); a failure surfaces the
 * server's own `error` words.
 */

import { z } from 'zod';
import {
  ArrivalPackageResponse,
  UnboxQueueResponse,
  type ArrivalActionBody,
  type ArrivalPackage,
  type UnboxQueueItem,
} from '@/lib/receiving/arrival-contract';

const FailureBody = z.object({ error: z.string().min(1) });

/** Parse a 2xx body with `schema`; anything else throws the server's `error`. */
async function readBody<T>(res: Response, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const ok = schema.safeParse(json);
    if (ok.success) return ok.data;
  }
  const failure = FailureBody.safeParse(json);
  throw new Error(failure.success ? failure.data.error : `${fallback} (${res.status})`);
}

export async function fetchArrivalPackage(receivingId: number): Promise<ArrivalPackage> {
  const res = await fetch(`/api/receiving/${receivingId}/arrival`, { credentials: 'include', cache: 'no-store' });
  return (await readBody(res, ArrivalPackageResponse, 'Could not load the package')).package;
}

export async function postArrivalAction(receivingId: number, body: ArrivalActionBody): Promise<ArrivalPackage> {
  const res = await fetch(`/api/receiving/${receivingId}/arrival`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': body.clientEventId },
    body: JSON.stringify(body),
  });
  const fallback = body.action === 'place' ? 'Could not place the package' : 'Could not save urgency';
  return (await readBody(res, ArrivalPackageResponse, fallback)).package;
}

export async function fetchUnboxQueue(): Promise<UnboxQueueItem[]> {
  const res = await fetch('/api/receiving/unbox-next', { credentials: 'include', cache: 'no-store' });
  return (await readBody(res, UnboxQueueResponse, 'Could not load the unbox queue')).items;
}
